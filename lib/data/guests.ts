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
import type { AdminGuest } from "@/types/guest";
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

export type AdminGuestPage = {
  guests: AdminGuest[];
  total: number;
  /** The page actually returned: the requested one, pulled back into range. */
  page: number;
  pageSize: number;
  totalPages: number;
};

/** Admin lists: one page of guests with their host's name. The review queue is oldest first. */
export async function getAdminGuests(
  filter: { status?: GuestStatus; invitedBy?: string },
  { page, pageSize }: { page: number; pageSize: number },
): Promise<AdminGuestPage> {
  const orderBy: Prisma.GuestOrderByWithRelationInput[] = [
    filter.status === GuestStatus.PENDING
      ? { createdAt: "asc" }
      : filter.status === GuestStatus.APPROVED
        ? { approvedAt: "desc" }
        : { createdAt: "desc" },
    // Keeps pages stable when several guests share a timestamp.
    { id: "asc" },
  ];

  const total = await prisma.guest.count({ where: filter });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  // E.g. the last guest on the final page was just actioned.
  const currentPage = Math.min(Math.max(1, page), totalPages);

  const rows = await prisma.guest.findMany({
    where: filter,
    orderBy,
    skip: (currentPage - 1) * pageSize,
    take: pageSize,
    include: { host: { select: { name: true } } },
  });

  return {
    guests: rows.map(({ host, ...guest }) => ({ ...guest, hostName: host.name })),
    total,
    page: currentPage,
    pageSize,
    totalPages,
  };
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

/**
 * Corrects a guest's name, email and host, in any status. The name may match
 * another guest's (admins can create duplicates), so `normalizedName` is
 * suffixed when needed, as in `createGuest`. `changed` says what actually
 * differed: nothing is written when nothing did. `invitedBy` is optional;
 * leave it out to keep the host.
 *
 * Moving a guest to another host:
 * - An approved guest needs a seat there, so the new host's capacity and
 *   tables apply as they do for an approval: they get its first table with a
 *   free seat, or the move is refused (HOST_FULL / TABLE_FULL) and nothing
 *   changes. Their old seat frees up at once.
 * - Anyone else just changes host. A table they kept as history belongs to the
 *   old host, so it is cleared.
 *
 * An approved guest holds a card with the old name, address, host or table,
 * so a change to any of them puts their card back to NOT_SENT until a new one
 * is delivered (an admin sends it; see lib/invitations.ts).
 */
export async function updateGuestDetails(
  id: string,
  input: { name: string; email: string; invitedBy?: string },
): Promise<{ guest: Guest; changed: { name: boolean; email: boolean; host: boolean } }> {
  const base = requireNormalizedName(input.name);
  const email = normalizeEmail(input.email);

  return withUniqueNormalizedName(() =>
    prisma.$transaction(async (tx) => {
      const first = await tx.guest.findUnique({ where: { id }, select: { invitedBy: true } });
      if (!first) throw notFound(id);

      const moving = input.invitedBy !== undefined && input.invitedBy !== first.invitedBy;
      if (moving) {
        // Both hosts' seats are about to change. Taking the locks in a fixed
        // order means two opposite moves can't wait on each other.
        for (const hostId of [first.invitedBy, input.invitedBy!].sort()) {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`seating:${hostId}`}))`;
        }
      }
      // Read again now the lock is held: the guest may have been approved or cancelled meanwhile.
      const current = await tx.guest.findUniqueOrThrow({ where: { id } });

      const newHost = moving ? await getHost(input.invitedBy!, tx) : null;
      if (moving && !newHost) {
        throw new GuestError("UNKNOWN_HOST", `Unknown host "${input.invitedBy}".`);
      }
      const changed = {
        name: current.name !== input.name,
        email: current.email !== email,
        host: moving && current.invitedBy !== input.invitedBy,
      };
      if (!changed.name && !changed.email && !changed.host) return { guest: current, changed };

      const approved = current.status === GuestStatus.APPROVED;
      let seat: { tableNumber: number | null } | undefined;
      if (changed.host) {
        if (approved) {
          const occupancy = await readOccupancy(tx, newHost!);
          if (occupancy.remaining === 0) {
            throw new GuestError(
              "HOST_FULL",
              `${newHost!.name} has no invitations left, so this guest can't move there. Cancel another of their invitations to free a place, then try again.`,
            );
          }
          const tableNumber = nextAvailableTable(occupancy);
          if (tableNumber === null) {
            throw new GuestError(
              "TABLE_FULL",
              `Every table for ${newHost!.name} is full, so there's no seat for this guest. Free a seat there, then try again.`,
            );
          }
          seat = { tableNumber };
        } else {
          seat = { tableNumber: null };
        }
      }

      const guest = await tx.guest.update({
        where: { id },
        data: {
          ...(changed.name && {
            name: input.name,
            normalizedName: await availableNormalizedName(tx, base, id),
          }),
          ...(changed.email && { email }),
          ...(changed.host && { invitedBy: input.invitedBy, ...seat }),
          ...(approved && { cardStatus: CardStatus.NOT_SENT }),
        },
      });
      return { guest, changed };
    }),
  );
}

// --- Admin decisions ---

/**
 * Approves a PENDING, REJECTED or CANCELLED guest and seats them at the host's
 * first table with a free seat. Everything is decided on freshly read data
 * inside a transaction that holds the host's seating lock, so simultaneous
 * approvals can't take the same seat, and approving the same guest twice can't
 * succeed twice.
 *
 * When there is no room the error says what to do (free a place or a seat),
 * and the admin can approve again afterwards. Approving a cancelled guest
 * again clears `cancelledAt`: the invitation is live once more.
 *
 * The card is left NOT_SENT: it only becomes SENT once the email really goes
 * out (lib/invitations.ts).
 */
export function approveGuest(id: string): Promise<Guest> {
  return withHostLock(id, async (tx, guest, host) => {
    if (guest.status === GuestStatus.APPROVED) {
      throw new GuestError("INVALID_STATUS", "This guest is already approved.");
    }

    // Only APPROVED guests use capacity, so a pending, rejected or cancelled guest never does.
    const occupancy = await readOccupancy(tx, host);
    if (occupancy.remaining === 0) {
      throw new GuestError(
        "HOST_FULL",
        `${host.name} has no invitations left. Cancel another invitation to free a place, then approve again.`,
      );
    }
    const tableNumber = nextAvailableTable(occupancy);
    if (tableNumber === null) {
      throw new GuestError(
        "TABLE_FULL",
        `Every table for ${host.name} is full, so there's no seat for this guest. Cancel another invitation to free a seat, then approve again.`,
      );
    }
    return tx.guest.update({
      where: { id },
      data: {
        status: GuestStatus.APPROVED,
        tableNumber,
        approvedAt: new Date(),
        cardStatus: CardStatus.NOT_SENT,
        cardSentAt: null,
        cancelledAt: null,
      },
    });
  });
}

/** PENDING → REJECTED. Rejected guests are not emailed and never use capacity. */
export function rejectGuest(id: string): Promise<Guest> {
  return transition(id, GuestStatus.PENDING, {
    status: GuestStatus.REJECTED,
  });
}

/**
 * APPROVED → CANCELLED. The record stays, with its table, approval time and
 * card details as a history; only the status changes and `cancelledAt` is set.
 * Capacity and seats are counted from APPROVED guests, so they free up at once.
 */
export function cancelGuest(id: string): Promise<Guest> {
  return withHostLock(id, async (tx, guest) => {
    if (guest.status !== GuestStatus.APPROVED) {
      throw new GuestError(
        "INVALID_STATUS",
        `Only approved invitations can be cancelled; this guest is ${guest.status.toLowerCase()}.`,
      );
    }
    return tx.guest.update({
      where: { id },
      data: { status: GuestStatus.CANCELLED, cancelledAt: new Date() },
    });
  });
}

/**
 * Moves an APPROVED guest to another of their host's tables, never past the
 * table's capacity. `moved` is false when they were already there. A move
 * leaves them holding a card for the wrong table, so the card goes back to
 * NOT_SENT until a new one is delivered (lib/invitations.ts).
 */
export function updateGuestTable(
  id: string,
  tableNumber: number,
): Promise<{ guest: Guest; moved: boolean }> {
  return withHostLock(id, async (tx, guest, host) => {
    if (guest.status !== GuestStatus.APPROVED) {
      throw new GuestError("INVALID_STATUS", "Only approved guests have a table.");
    }
    if (guest.tableNumber === tableNumber) return { guest, moved: false };

    const table = (await readOccupancy(tx, host)).tables.find((t) => t.number === tableNumber);
    if (!table) {
      throw new GuestError("UNKNOWN_TABLE", `Table ${tableNumber} isn't one of ${host.name}'s tables.`);
    }
    if (table.remaining === 0) {
      throw new GuestError(
        "TABLE_FULL",
        `Table ${tableNumber} is full. Choose a table with a free seat, or move another guest off it first.`,
      );
    }
    const updated = await tx.guest.update({
      where: { id },
      data: { tableNumber, cardStatus: CardStatus.NOT_SENT },
    });
    return { guest: updated, moved: true };
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
  hosts: (HostOccupancy & { pending: number; byStatus: Record<GuestStatus, number> })[];
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
      byStatus: Object.fromEntries(
        Object.values(GuestStatus).map((status) => [status, count(host.id, status)]),
      ) as Record<GuestStatus, number>,
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
