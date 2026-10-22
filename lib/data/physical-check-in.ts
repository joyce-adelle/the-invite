import "server-only";

import { AccessCardType, GuestStatus, Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";

// Checking in guests with printed (physical) cards. They have no names or QR
// codes in the app, so door staff count them per table: they read the host
// ("Guest Type") and table number off the card, the app confirms the table is
// that host's and uses physical cards, and they record how many arrived.
//
// A table's arrivals are its entries that haven't been undone, and never more
// than its seats. Recording and undoing take the host's seating lock (the same
// one approvals and table moves take), so two phones adding at once can't
// overshoot, and the table can't be moved or switched mid-count.

type Tx = Prisma.TransactionClient;

export type ArrivalEntry = {
  id: string;
  count: number;
  recordedAt: Date;
  /** The username of whoever recorded it. */
  recordedBy: string;
  undoneAt: Date | null;
  undoneBy: string | null;
};

export type PhysicalTableView = {
  tableNumber: number;
  hostId: string;
  hostName: string;
  capacity: number;
  arrived: number;
  /** Newest first. */
  entries: ArrivalEntry[];
};

/** Why a card's table can't be counted, so staff know what to check. */
export type TableProblem =
  | { outcome: "not-found"; tableNumber: number }
  /** The table is another host's, or nobody's: the card doesn't match. */
  | { outcome: "wrong-host"; tableNumber: number; hostName: string; actualHostName: string | null }
  /** A digital table: its guests have QR codes to scan instead. */
  | { outcome: "digital"; tableNumber: number; hostName: string };

export type LookupResult = { outcome: "ok"; table: PhysicalTableView } | TableProblem;

export type RecordResult =
  | { outcome: "recorded"; table: PhysicalTableView; added: number }
  | { outcome: "too-many"; table: PhysicalTableView; remaining: number }
  | TableProblem;

export type UndoResult =
  | { outcome: "undone"; table: PhysicalTableView }
  | { outcome: "already-undone"; table: PhysicalTableView }
  | { outcome: "not-found" };

const username = (user: { displayUsername: string | null; username: string | null; name: string }) =>
  user.displayUsername ?? user.username ?? user.name;
const userSelect = { select: { displayUsername: true, username: true, name: true } } as const;

async function lockSeating(tx: Tx, hostId: string | null) {
  if (hostId) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`seating:${hostId}`}))`;
}

/** The table, checked against the host on the card. */
async function check(tx: Tx, hostId: string, tableNumber: number): Promise<LookupResult> {
  const [table, host] = await Promise.all([
    tx.table.findUnique({ where: { number: tableNumber }, include: { host: { select: { id: true, name: true } } } }),
    tx.host.findUnique({ where: { id: hostId }, select: { name: true } }),
  ]);
  if (!table || !host) return { outcome: "not-found", tableNumber };
  if (table.hostId !== hostId) {
    return { outcome: "wrong-host", tableNumber, hostName: host.name, actualHostName: table.host?.name ?? null };
  }
  if (table.cardType !== AccessCardType.PHYSICAL) return { outcome: "digital", tableNumber, hostName: host.name };
  return { outcome: "ok", table: await view(tx, tableNumber) };
}

async function view(client: Tx | typeof prisma, tableNumber: number): Promise<PhysicalTableView> {
  const table = await client.table.findUniqueOrThrow({
    where: { number: tableNumber },
    include: {
      host: { select: { id: true, name: true } },
      physicalArrivals: {
        orderBy: { recordedAt: "desc" },
        take: 20,
        include: { recorder: userSelect, undoer: userSelect },
      },
    },
  });
  const { _sum } = await client.physicalArrival.aggregate({
    where: { tableNumber, undoneAt: null },
    _sum: { count: true },
  });
  return {
    tableNumber,
    hostId: table.host?.id ?? "",
    hostName: table.host?.name ?? "",
    capacity: table.capacity,
    arrived: _sum.count ?? 0,
    entries: table.physicalArrivals.map((entry) => ({
      id: entry.id,
      count: entry.count,
      recordedAt: entry.recordedAt,
      recordedBy: username(entry.recorder),
      undoneAt: entry.undoneAt,
      undoneBy: entry.undoer ? username(entry.undoer) : null,
    })),
  };
}

/** Looks a card's table up: is it this host's, and physical? */
export async function lookupPhysicalTable(hostId: string, tableNumber: number): Promise<LookupResult> {
  return prisma.$transaction((tx) => check(tx, hostId, tableNumber));
}

/**
 * Records that `count` more guests arrived for this table. Refused (nothing
 * recorded) if the card doesn't match the table, or if it would take the table
 * past its seats. `userId` must come from the verified session.
 */
export async function recordPhysicalArrivals(
  hostId: string,
  tableNumber: number,
  count: number,
  userId: string,
): Promise<RecordResult> {
  if (!Number.isInteger(count) || count < 1) throw new Error("Record at least one arrival.");
  return prisma.$transaction(async (tx) => {
    const found = await tx.table.findUnique({ where: { number: tableNumber }, select: { hostId: true } });
    await lockSeating(tx, found?.hostId ?? null);

    const checked = await check(tx, hostId, tableNumber);
    if (checked.outcome !== "ok") return checked;
    const remaining = checked.table.capacity - checked.table.arrived;
    if (count > remaining) return { outcome: "too-many", table: checked.table, remaining };

    await tx.physicalArrival.create({ data: { tableNumber, count, recordedBy: userId } });
    return { outcome: "recorded", table: await view(tx, tableNumber), added: count };
  });
}

/** Undoes one entry (a mistake), keeping it as history. */
export async function undoPhysicalArrival(id: string, userId: string): Promise<UndoResult> {
  return prisma.$transaction(async (tx) => {
    const entry = await tx.physicalArrival.findUnique({
      where: { id },
      select: { tableNumber: true, table: { select: { hostId: true } } },
    });
    if (!entry) return { outcome: "not-found" };
    await lockSeating(tx, entry.table.hostId);

    const { count } = await tx.physicalArrival.updateMany({
      where: { id, undoneAt: null },
      data: { undoneAt: new Date(), undoneBy: userId },
    });
    const table = await view(tx, entry.tableNumber);
    return count === 1 ? { outcome: "undone", table } : { outcome: "already-undone", table };
  });
}

/** Arrivals counted at a table that haven't been undone. Used to protect it from changes. */
export async function physicalArrivalsAt(tx: Tx, tableNumber: number): Promise<number> {
  const { _sum } = await tx.physicalArrival.aggregate({ where: { tableNumber, undoneAt: null }, _sum: { count: true } });
  return _sum.count ?? 0;
}

// --- Progress ---

export type Progress = { expected: number; arrived: number };

export type TableProgress = Progress & { number: number; cardType: AccessCardType };

export type HostProgress = {
  id: string;
  name: string;
  digital: Progress;
  physical: Progress;
  tables: TableProgress[];
};

export type RecentArrival =
  | { kind: "qr"; at: Date; guestName: string; hostName: string; tableNumber: number | null; by: string }
  | { kind: "physical"; at: Date; count: number; hostName: string; tableNumber: number; by: string; undone: boolean };

export type CheckInProgress = {
  generatedAt: Date;
  digital: Progress;
  physical: Progress;
  hosts: HostProgress[];
  /** Only for admins: who arrived most recently. Never given to check-in accounts. */
  recent: RecentArrival[] | null;
};

const add = (a: Progress, b: Progress): Progress => ({ expected: a.expected + b.expected, arrived: a.arrived + b.arrived });
const ZERO: Progress = { expected: 0, arrived: 0 };

/**
 * Arrivals against expectations: digital guests are the approved ones (arrived
 * once checked in), physical ones are a physical table's seats (arrived as
 * counted). Counts only, unless `withRecent`, which adds names and is for
 * admins alone.
 */
export async function getCheckInProgress({ withRecent }: { withRecent: boolean }): Promise<CheckInProgress> {
  const [hosts, approved, physical] = await Promise.all([
    prisma.host.findMany({
      where: { tables: { some: {} } },
      orderBy: { name: "asc" },
      include: { tables: { orderBy: { number: "asc" }, select: { number: true, cardType: true, capacity: true } } },
    }),
    prisma.guest.groupBy({
      by: ["tableNumber"],
      where: { status: GuestStatus.APPROVED, tableNumber: { not: null } },
      _count: { _all: true, checkedInAt: true },
    }),
    prisma.physicalArrival.groupBy({ by: ["tableNumber"], where: { undoneAt: null }, _sum: { count: true } }),
  ]);
  const approvedAt = new Map(approved.map((row) => [row.tableNumber!, { expected: row._count._all, arrived: row._count.checkedInAt }]));
  const physicalAt = new Map(physical.map((row) => [row.tableNumber, row._sum.count ?? 0]));

  const hostRows: HostProgress[] = hosts.map((host) => {
    const tables: TableProgress[] = host.tables.map((table) =>
      table.cardType === AccessCardType.PHYSICAL
        ? { number: table.number, cardType: table.cardType, expected: table.capacity, arrived: physicalAt.get(table.number) ?? 0 }
        : { number: table.number, cardType: table.cardType, ...(approvedAt.get(table.number) ?? ZERO) },
    );
    const sum = (type: AccessCardType) => tables.filter((t) => t.cardType === type).reduce(add, ZERO);
    const { expected: de, arrived: da } = sum(AccessCardType.DIGITAL);
    const { expected: pe, arrived: pa } = sum(AccessCardType.PHYSICAL);
    return { id: host.id, name: host.name, digital: { expected: de, arrived: da }, physical: { expected: pe, arrived: pa }, tables };
  });

  return {
    generatedAt: new Date(),
    digital: hostRows.map((h) => h.digital).reduce(add, ZERO),
    physical: hostRows.map((h) => h.physical).reduce(add, ZERO),
    hosts: hostRows,
    recent: withRecent ? await recentArrivals() : null,
  };
}

async function recentArrivals(limit = 15): Promise<RecentArrival[]> {
  const [qr, physical] = await Promise.all([
    prisma.guest.findMany({
      where: { checkedInAt: { not: null } },
      orderBy: { checkedInAt: "desc" },
      take: limit,
      select: { name: true, tableNumber: true, checkedInAt: true, host: { select: { name: true } }, checkedInByAdmin: userSelect },
    }),
    prisma.physicalArrival.findMany({
      orderBy: { recordedAt: "desc" },
      take: limit,
      include: { table: { select: { host: { select: { name: true } } } }, recorder: userSelect },
    }),
  ]);
  return [
    ...qr.map(
      (g): RecentArrival => ({
        kind: "qr",
        at: g.checkedInAt!,
        guestName: g.name,
        hostName: g.host.name,
        tableNumber: g.tableNumber,
        by: g.checkedInByAdmin ? username(g.checkedInByAdmin) : "",
      }),
    ),
    ...physical.map(
      (p): RecentArrival => ({
        kind: "physical",
        at: p.recordedAt,
        count: p.count,
        hostName: p.table.host?.name ?? "",
        tableNumber: p.tableNumber,
        by: username(p.recorder),
        undone: p.undoneAt !== null,
      }),
    ),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, limit);
}

/** Every host, hidden or not, for staff choosing the one on a printed card. */
export function listHostsForCards(): Promise<{ id: string; name: string }[]> {
  return prisma.host.findMany({
    where: { tables: { some: { cardType: AccessCardType.PHYSICAL } } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}
