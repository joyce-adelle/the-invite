import "server-only";

import { generateCheckInToken } from "@/lib/check-in/check-in";
import { GuestError } from "@/lib/data/errors";
import { getHost, getHosts } from "@/lib/data/hosts";
import { prisma } from "@/lib/prisma";
import {
  AccessCardType,
  CardStatus,
  GuestStatus,
  Prisma,
  type Guest,
  type PrismaClient,
} from "@/lib/generated/prisma/client";
import { acceptsRequests, attendanceOf, hostOccupancy, nextAvailableTable, normalizeEmail, normalizeName } from "../utils";
import type { AdminGuest } from "@/types/guest";
import { HostOccupancy, HostWithTables } from "@/types/hosts";
import { Attendance } from "@/types/check-in";


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
  filter: { status?: GuestStatus; invitedBy?: string; checkedIn?: boolean },
  { page, pageSize }: { page: number; pageSize: number },
): Promise<AdminGuestPage> {
  const { checkedIn, ...match } = filter;
  const where: Prisma.GuestWhereInput = {
    ...match,
    ...(checkedIn !== undefined && { checkedInAt: checkedIn ? { not: null } : null }),
  };
  const orderBy: Prisma.GuestOrderByWithRelationInput[] = [
    filter.status === GuestStatus.PENDING
      ? { createdAt: "asc" }
      : filter.status === GuestStatus.APPROVED
        ? { approvedAt: "desc" }
        : { createdAt: "desc" },
    // Keeps pages stable when several guests share a timestamp.
    { id: "asc" },
  ];

  const total = await prisma.guest.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  // E.g. the last guest on the final page was just actioned.
  const currentPage = Math.min(Math.max(1, page), totalPages);

  const rows = await prisma.guest.findMany({
    where,
    orderBy,
    skip: (currentPage - 1) * pageSize,
    take: pageSize,
    include: { host: { select: { name: true } } },
    // The list goes to the browser, and the check-in token is a secret that
    // belongs on the card alone.
    omit: { checkInToken: true },
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

      // PENDING requests don't count; only APPROVED guests use capacity. This is
      // measured against everyone the host may bring, physical cards included, so
      // a host with only physical tables still takes requests (see acceptsRequests).
      if (!acceptsRequests(await readOccupancy(tx, host))) {
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
          const tableNumber = nextAvailableTable(occupancy);
          if (occupancy.remaining === 0 || tableNumber === null) {
            throw noSeatError(occupancy, "so this guest can't move there", "then try again");
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
 * out (lib/invitations.ts). The guest gets their check-in token here, if they
 * don't have one yet.
 */
export function approveGuest(id: string): Promise<Guest> {
  return withHostLock(id, async (tx, guest, host) => {
    if (guest.status === GuestStatus.APPROVED) {
      throw new GuestError("INVALID_STATUS", "This guest is already approved.");
    }

    // Only APPROVED guests use capacity, so a pending, rejected or cancelled guest never does.
    const occupancy = await readOccupancy(tx, host);
    const tableNumber = nextAvailableTable(occupancy);
    if (occupancy.remaining === 0 || tableNumber === null) {
      throw noSeatError(occupancy, "so there's no seat for this guest", "then approve again");
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
        // Made once and kept: approving someone again reuses the code on their card.
        checkInToken: guest.checkInToken ?? generateCheckInToken(),
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
    if (table.cardType === AccessCardType.PHYSICAL) {
      throw new GuestError(
        "TABLE_FULL",
        `Table ${tableNumber} uses physical cards, so no one is seated there online. Choose a digital table, or make table ${tableNumber} digital first.`,
      );
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
  attendance: Attendance;
  hosts: (HostOccupancy & { pending: number; byStatus: Record<GuestStatus, number> })[];
};

export async function getDashboardCounts(): Promise<DashboardCounts> {
  const [hosts, byHostAndStatus, byTable, checkedIn] = await Promise.all([
    getHosts(),
    prisma.guest.groupBy({ by: ["invitedBy", "status"], _count: { _all: true } }),
    approvedByTable(prisma),
    prisma.guest.count({ where: { status: GuestStatus.APPROVED, checkedInAt: { not: null } } }),
  ]);

  const byStatus = Object.fromEntries(
    Object.values(GuestStatus).map((status) => [status, 0]),
  ) as Record<GuestStatus, number>;
  const count = (hostId: string, status: GuestStatus) =>
    byHostAndStatus.find((row) => row.invitedBy === hostId && row.status === status)?._count
      ._all ?? 0;

  for (const row of byHostAndStatus) byStatus[row.status] += row._count._all;

  return {
    attendance: attendanceOf(byStatus.APPROVED, checkedIn),
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

// --- Tables ---

/**
 * Makes a table physical (printed cards, no one seated online) or digital
 * (emailed cards, seats for approvals). Making a table physical is refused
 * while approved guests are seated there: move them first. Runs under the
 * host's seating lock, so an approval can't take a seat at the same moment.
 * `changed` is false when the table already had that type.
 */
export async function setTableCardType(
  tableNumber: number,
  cardType: AccessCardType,
): Promise<{ hostName: string; changed: boolean }> {
  return prisma.$transaction(async (tx) => {
    const found = await tx.table.findUnique({ where: { number: tableNumber }, select: { hostId: true } });
    if (!found) throw new GuestError("UNKNOWN_TABLE", `There is no table ${tableNumber}.`);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`seating:${found.hostId}`}))`;

    const table = await tx.table.findUniqueOrThrow({
      where: { number: tableNumber },
      include: { host: { select: { name: true } } },
    });
    if (table.cardType === cardType) return { hostName: table.host.name, changed: false };

    if (cardType === AccessCardType.PHYSICAL) {
      const seated = await tx.guest.count({ where: { tableNumber, status: GuestStatus.APPROVED } });
      if (seated > 0) {
        throw new GuestError(
          "TABLE_FULL",
          `${seated === 1 ? "1 approved guest is" : `${seated} approved guests are`} seated at table ${tableNumber}. Move them to another table before making it physical.`,
        );
      }
    }
    await tx.table.update({ where: { number: tableNumber }, data: { cardType } });
    return { hostName: table.host.name, changed: true };
  });
}

/**
 * Why a guest can't be seated with a host, and what the admin can do about it:
 * a host with only physical tables needs another host or a digital table; a
 * host whose digital seats are taken needs one freed, or a physical table made
 * digital.
 */
function noSeatError(occupancy: HostOccupancy, consequence: string, then: string): GuestError {
  const { name, digitalCapacity, physicalSeats } = occupancy;
  if (digitalCapacity === 0) {
    return new GuestError(
      "HOST_FULL",
      `All of ${name}'s tables use physical cards, ${consequence}. Move the guest to another host, or make one of ${name}'s tables digital (Host capacity on the dashboard), ${then}.`,
    );
  }
  const physicalHint = physicalSeats > 0 ? `, or make one of ${name}'s physical tables digital` : "";
  return occupancy.remaining === 0
    ? new GuestError(
        "HOST_FULL",
        `${name} has no digital places left, ${consequence}. Cancel another invitation to free a place${physicalHint}, ${then}.`,
      )
    : new GuestError(
        "TABLE_FULL",
        `Every digital table for ${name} is full, ${consequence}. Cancel another invitation to free a seat${physicalHint}, ${then}.`,
      );
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
