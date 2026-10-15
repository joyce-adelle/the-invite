import "server-only";

import { GuestError } from "@/lib/data/errors";
import { getHost, getHosts } from "@/lib/data/hosts";
import { prisma } from "@/lib/prisma";
import {
  CardStatus,
  GuestStatus,
  Prisma,
  type Guest,
  type PrismaClient,
} from "@/lib/generated/prisma/client";
import { hostOccupancy, nextAvailableTable, normalizeEmail, normalizeName } from "../utils";
import { HostOccupancy, HostWithTables } from "@/types/hosts";


// Guest persistence. All Prisma access for guests goes through this module.
// Expected failures throw GuestError; see lib/data/errors.ts.
type Client = PrismaClient | Prisma.TransactionClient;

// --- Reads ---

export async function getGuest(id: string): Promise<Guest | null> {
  return prisma.guest.findUnique({ where: { id } });
}

/** Every request made with this email, newest first. */
export function findGuestsByEmail(email: string): Promise<Guest[]> {
  return prisma.guest.findMany({
    where: { email: normalizeEmail(email) },
    orderBy: { createdAt: "desc" },
  });
}

/** Newest first. Filter by status and/or host id. */
export function getGuests(filter: { status?: GuestStatus; invitedBy?: string } = {}): Promise<Guest[]> {
  return prisma.guest.findMany({ where: filter, orderBy: { createdAt: "desc" } });
}

// --- Creating guests ---

/**
 * A public request. The name is stored exactly as submitted; duplicates are
 * detected on `normalizedName`, whose unique index is the final safeguard.
 */
export async function createGuestRequest(input: {
  name: string;
  email: string;
  invitedBy: string;
}): Promise<Guest> {
  const normalizedName = requireNormalizedName(input.name);

  try {
    return await prisma.$transaction(async (tx) => {

      const host = await getHost(input.invitedBy, tx);
      if (!host) throw new GuestError("UNKNOWN_HOST", `Unknown host "${input.invitedBy}".`);

      // PENDING requests don't count; only APPROVED guests use capacity.
      if ((await readOccupancy(tx, host)).remaining === 0) {
        throw new GuestError("HOST_FULL", `${host.name} has no invitations left.`);
      }

      // Matches any host and any status.
      const existing = await tx.guest.findUnique({
        where: { normalizedName },
        select: { id: true },
      });
      if (existing) throw duplicateName();

      return tx.guest.create({
        data: {
          name: input.name,
          normalizedName,
          email: normalizeEmail(input.email),
          invitedBy: input.invitedBy,
        },
      });
    });
  } catch (error) {
    // A concurrent request for the same name got there first.
    throw isUniqueViolation(error) ? duplicateName() : error;
  }
}

/**
 * Creates a PENDING guest on an admin's behalf. Unlike public requests, the
 * display name may repeat: a numeric suffix goes on `normalizedName` only.
 */
export async function createGuest(input: {
  name: string;
  email: string;
  invitedBy: string;
}): Promise<Guest> {
  const base = requireNormalizedName(input.name);

  return withUniqueNormalizedName(() =>
    prisma.$transaction(async (tx) => {
      if (!(await getHost(input.invitedBy, tx))) {
        throw new GuestError("UNKNOWN_HOST", `Unknown host "${input.invitedBy}".`);
      }
      return tx.guest.create({
        data: {
          name: input.name,
          normalizedName: await availableNormalizedName(tx, base),
          email: normalizeEmail(input.email),
          invitedBy: input.invitedBy,
        },
      });
    }),
  );
}

/** Renames a guest, keeping `normalizedName` in step (suffixed if another guest has it). */
export async function updateGuestName(id: string, name: string): Promise<Guest> {
  const base = requireNormalizedName(name);

  return withUniqueNormalizedName(() =>
    prisma.$transaction(async (tx) => {
      if (!(await tx.guest.findUnique({ where: { id }, select: { id: true } }))) {
        throw notFound(id);
      }
      return tx.guest.update({
        where: { id },
        data: { name, normalizedName: await availableNormalizedName(tx, base, id) },
      });
    }),
  );
}

// --- Admin decisions ---

/**
 * Approves a PENDING, REJECTED or CANCELLED guest and seats them at the host's
 * next table with a free seat. Resets card status so a fresh card is sent.
 */
export function approveGuest(id: string): Promise<Guest> {
  return withHostLock(id, async (tx, guest, host) => {
    if (guest.status === GuestStatus.APPROVED) {
      throw new GuestError("INVALID_STATUS", "This guest is already approved.");
    }
    const occupancy = await readOccupancy(tx, host);
    if (occupancy.remaining === 0) {
      throw new GuestError("HOST_FULL", `${host.name} has no invitations left.`);
    }
    const tableNumber = nextAvailableTable(occupancy);
    if (tableNumber === null) {
      throw new GuestError("TABLE_FULL", `Every table for ${host.name} is full.`);
    }
    return tx.guest.update({
      where: { id },
      data: {
        status: GuestStatus.APPROVED,
        tableNumber,
        approvedAt: new Date(),
        cardStatus: CardStatus.NOT_SENT,
        cardSentAt: null,
      },
    });
  });
}

/** PENDING → REJECTED. Rejected guests are not emailed. */
export function rejectGuest(id: string): Promise<Guest> {
  return transition(id, GuestStatus.PENDING, {
    status: GuestStatus.REJECTED,
  });
}

/** APPROVED → CANCELLED, freeing the seat and the host's capacity. */
export function cancelGuest(id: string): Promise<Guest> {
  return transition(id, GuestStatus.APPROVED, {
    status: GuestStatus.CANCELLED,
    tableNumber: null,
  });
}

/** Moves an APPROVED guest to another of their host's tables. Does not resend the card. */
export function updateGuestTable(id: string, tableNumber: number): Promise<Guest> {
  return withHostLock(id, async (tx, guest, host) => {
    if (guest.status !== GuestStatus.APPROVED) {
      throw new GuestError("INVALID_STATUS", "Only approved guests have a table.");
    }
    if (guest.tableNumber === tableNumber) return guest;

    const table = (await readOccupancy(tx, host)).tables.find((t) => t.number === tableNumber);
    if (!table) {
      throw new GuestError("UNKNOWN_TABLE", `Table ${tableNumber} isn't one of ${host.name}'s tables.`);
    }
    if (table.remaining === 0) {
      throw new GuestError("TABLE_FULL", `Table ${tableNumber} is full.`);
    }
    return tx.guest.update({ where: { id }, data: { tableNumber } });
  });
}

/** Records access-card delivery; SENT also stamps cardSentAt. */
export async function updateCardStatus(id: string, cardStatus: CardStatus): Promise<Guest> {
  try {
    return await prisma.guest.update({
      where: { id },
      data: {
        cardStatus,
        ...(cardStatus === CardStatus.SENT && { cardSentAt: new Date() }),
      },
    });
  } catch (error) {
    throw notFoundOr(error, id);
  }
}

// --- Dashboard ---

export type DashboardCounts = {
  total: number;
  byStatus: Record<GuestStatus, number>;
  hosts: (HostOccupancy & { pending: number })[];
};

export async function getDashboardCounts(): Promise<DashboardCounts> {
  const [hosts, byHostAndStatus, byTable] = await Promise.all([
    getHosts(),
    prisma.guest.groupBy({ by: ["invitedBy", "status"], _count: { _all: true } }),
    approvedByTable(prisma),
  ]);

  const byStatus = Object.fromEntries(
    Object.values(GuestStatus).map((status) => [status, 0]),
  ) as Record<GuestStatus, number>;
  const count = (hostId: string, status: GuestStatus) =>
    byHostAndStatus.find((row) => row.invitedBy === hostId && row.status === status)?._count
      ._all ?? 0;

  for (const row of byHostAndStatus) byStatus[row.status] += row._count._all;

  return {
    total: byHostAndStatus.reduce((sum, row) => sum + row._count._all, 0),
    byStatus,
    hosts: hosts.map((host) => ({
      ...hostOccupancy(host, count(host.id, GuestStatus.APPROVED), byTable),
      pending: count(host.id, GuestStatus.PENDING),
    })),
  };
}

export async function getHostOccupancy(hostId: string): Promise<HostOccupancy> {
  const host = await getHost(hostId);
  if (!host) throw new GuestError("UNKNOWN_HOST", `Unknown host "${hostId}".`);
  return readOccupancy(prisma, host);
}

/** True while the host has approved-guest capacity left. False for unknown hosts. */
export async function hostHasCapacity(hostId: string): Promise<boolean> {
  const [host, approved] = await Promise.all([
    prisma.host.findUnique({ where: { id: hostId }, select: { capacity: true } }),
    prisma.guest.count({ where: { invitedBy: hostId, status: GuestStatus.APPROVED } }),
  ]);
  return host !== null && host.capacity > approved;
}

// --- Internals ---

async function readOccupancy(client: Client, host: HostWithTables): Promise<HostOccupancy> {
  const [approved, byTable] = await Promise.all([
    client.guest.count({ where: { invitedBy: host.id, status: GuestStatus.APPROVED } }),
    approvedByTable(client, host.tables.map((table) => table.number)),
  ]);
  return hostOccupancy(host, approved, byTable);
}

async function approvedByTable(client: Client, tableNumbers?: number[]) {
  const rows = await client.guest.groupBy({
    by: ["tableNumber"],
    where: {
      status: GuestStatus.APPROVED,
      tableNumber: tableNumbers ? { in: tableNumbers } : { not: null },
    },
    _count: { _all: true },
  });
  return new Map(rows.map((row) => [row.tableNumber!, row._count._all]));
}

/**
 * Runs a seating change in a transaction holding a per-host lock, so
 * concurrent approvals or moves can't both take the last seat. The guest is
 * re-read after the lock is acquired, so `fn` sees committed state.
 */
async function withHostLock<T>(
  id: string,
  fn: (tx: Prisma.TransactionClient, guest: Guest, host: HostWithTables) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.guest.findUnique({ where: { id }, select: { invitedBy: true } });
    if (!current) throw notFound(id);

    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`seating:${current.invitedBy}`}))`;

    const guest = await tx.guest.findUniqueOrThrow({ where: { id } });
    // The foreign key guarantees the host exists.
    const host = (await getHost(guest.invitedBy, tx))!;
    return fn(tx, guest, host);
  });
}

/** Applies `data` only if the guest is currently in status `from`, atomically. */
async function transition(
  id: string,
  from: GuestStatus,
  data: Prisma.GuestUncheckedUpdateManyInput,
): Promise<Guest> {
  const { count } = await prisma.guest.updateMany({ where: { id, status: from }, data });
  const guest = await getGuest(id);
  if (!guest) throw notFound(id);
  if (count === 0) {
    throw new GuestError(
      "INVALID_STATUS",
      `Only ${from.toLowerCase()} guests can be changed this way; this guest is ${guest.status.toLowerCase()}.`,
    );
  }
  return guest;
}

function requireNormalizedName(name: string): string {
  const normalized = normalizeName(name);
  if (!normalized) {
    throw new GuestError("INVALID_NAME", "A name needs at least one letter or digit.");
  }
  return normalized;
}

function duplicateName() {
  return new GuestError("DUPLICATE_NAME", "A guest with this name already exists.");
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * First free value among base, base2, base3…, taken under a lock on the base so
 * same-name callers queue up. Names that collide across bases (a guest called
 * "Jane Doe 2" vs. the suffixed "janedoe2") are caught by withUniqueNormalizedName.
 */
async function availableNormalizedName(
  tx: Prisma.TransactionClient,
  base: string,
  excludeId?: string,
): Promise<string> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`guest-name:${base}`}))`;
  const rows = await tx.guest.findMany({
    where: { normalizedName: { startsWith: base }, ...(excludeId && { id: { not: excludeId } }) },
    select: { normalizedName: true },
  });
  const taken = new Set(rows.map((row) => row.normalizedName));

  let candidate = base;
  for (let n = 2; taken.has(candidate); n++) candidate = `${base}${n}`;
  return candidate;
}

/**
 * Retries when the unique index rejects the chosen normalizedName because a
 * concurrent request took it first; the retry sees that row and picks the next.
 */
async function withUniqueNormalizedName<T>(fn: () => Promise<T>, attempts = 10): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (!isUniqueViolation(error) || attempt >= attempts) throw error;
    }
  }
}

function notFound(id: string) {
  return new GuestError("GUEST_NOT_FOUND", `No guest with id ${id}.`);
}

function notFoundOr(error: unknown, id: string): unknown {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025"
    ? notFound(id)
    : error;
}
