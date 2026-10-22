import "server-only";

import { AccessCardType, GuestStatus, Prisma, type PrismaClient } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";

// Managing hosts and tables (/admin/hosts). The rules:
//   - Tables are numbered 1 to EventSettings.maxTables, every number has a row,
//     and each is given to one host or to none.
//   - A host's capacity (everyone it may bring) is always its tables' seats
//     added up: every change here recalculates it in the same transaction.
//   - A table where approved guests are seated never changes host, and is
//     never removed: move the guests first. Nobody is re-hosted behind an
//     admin's back.
//   - Changes take the seating lock of every host they touch (the same lock
//     approvals take), so an approval can't seat someone at a table that is
//     being moved at the same moment.

type Tx = Prisma.TransactionClient;
type Client = PrismaClient | Tx;

export type HostAdminErrorCode = "NOT_FOUND" | "NAME_TAKEN" | "INVALID" | "IN_USE" | "TABLE_BUSY" | "TABLE_NOT_FOUND";

export class HostAdminError extends Error {
  name = "HostAdminError";
  constructor(
    readonly code: HostAdminErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export const HOST_NAME_MIN = 2;
export const HOST_NAME_MAX = 60;
export const MAX_TABLES_LIMIT = 500;
export const SEATS_LIMIT = 50;

export type EventSettings = { maxTables: number; seatsPerTable: number };

/** The settings row, or the defaults (80 tables of 10) if it has never been written. */
export async function getEventSettings(client: Client = prisma): Promise<EventSettings> {
  const row = await client.eventSettings.findUnique({ where: { id: 1 } });
  return row ? { maxTables: row.maxTables, seatsPerTable: row.seatsPerTable } : { maxTables: 80, seatsPerTable: 10 };
}

// --- Reading ---

export type TableSummary = {
  number: number;
  cardType: AccessCardType;
  capacity: number;
  /** Approved guests seated here. */
  seated: number;
};

export type HostSummary = {
  id: string;
  name: string;
  acceptingRequests: boolean;
  capacity: number;
  physicalSeats: number;
  tables: TableSummary[];
  guests: { pending: number; approved: number; rejected: number; cancelled: number; checkedIn: number };
};

export type HostsOverview = {
  settings: EventSettings;
  hosts: HostSummary[];
  unassigned: TableSummary[];
};

const seatedByTable = async (client: Client) =>
  new Map(
    (
      await client.guest.groupBy({
        by: ["tableNumber"],
        where: { status: GuestStatus.APPROVED, tableNumber: { not: null } },
        _count: { _all: true },
      })
    ).map((row) => [row.tableNumber!, row._count._all]),
  );

/** Every host with its tables and guest numbers, and the tables nobody has. */
export async function getHostsOverview(): Promise<HostsOverview> {
  const [settings, hosts, tables, seated, byStatus, checkedIn] = await Promise.all([
    getEventSettings(),
    prisma.host.findMany({ orderBy: { name: "asc" } }),
    prisma.table.findMany({ orderBy: { number: "asc" } }),
    seatedByTable(prisma),
    prisma.guest.groupBy({ by: ["invitedBy", "status"], _count: { _all: true } }),
    prisma.guest.groupBy({
      by: ["invitedBy"],
      where: { status: GuestStatus.APPROVED, checkedInAt: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const summary = (table: (typeof tables)[number]): TableSummary => ({
    number: table.number,
    cardType: table.cardType,
    capacity: table.capacity,
    seated: seated.get(table.number) ?? 0,
  });
  const count = (hostId: string, status: GuestStatus) =>
    byStatus.find((row) => row.invitedBy === hostId && row.status === status)?._count._all ?? 0;

  return {
    settings,
    hosts: hosts.map((host) => {
      const own = tables.filter((table) => table.hostId === host.id).map(summary);
      return {
        id: host.id,
        name: host.name,
        acceptingRequests: host.acceptingRequests,
        capacity: host.capacity,
        physicalSeats: own.filter((t) => t.cardType === AccessCardType.PHYSICAL).reduce((sum, t) => sum + t.capacity, 0),
        tables: own,
        guests: {
          pending: count(host.id, GuestStatus.PENDING),
          approved: count(host.id, GuestStatus.APPROVED),
          rejected: count(host.id, GuestStatus.REJECTED),
          cancelled: count(host.id, GuestStatus.CANCELLED),
          checkedIn: checkedIn.find((row) => row.invitedBy === host.id)?._count._all ?? 0,
        },
      };
    }),
    unassigned: tables.filter((table) => table.hostId === null).map(summary),
  };
}

/** One host's summary, or null. */
export async function getHostSummary(id: string): Promise<{ host: HostSummary; overview: HostsOverview } | null> {
  const overview = await getHostsOverview();
  const host = overview.hosts.find((h) => h.id === id);
  return host ? { host, overview } : null;
}

// --- Hosts ---

function cleanName(name: unknown): string {
  const clean = typeof name === "string" ? name.normalize("NFC").replace(/\s+/g, " ").trim() : "";
  if (clean.length < HOST_NAME_MIN || clean.length > HOST_NAME_MAX) {
    throw new HostAdminError("INVALID", `A host's name needs ${HOST_NAME_MIN} to ${HOST_NAME_MAX} characters.`);
  }
  if (/[\p{Cc}\p{Cf}]/u.test(clean)) throw new HostAdminError("INVALID", "A host's name can't contain control characters.");
  return clean;
}

/** A stable id from a name: "Kikelomo's Guests" → "kikelomos-guests". */
export function slugify(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .replace(/-+$/g, "") || "host"
  );
}

async function assertNameFree(tx: Tx, name: string, exceptId?: string) {
  const taken = await tx.host.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, ...(exceptId && { id: { not: exceptId } }) },
    select: { id: true },
  });
  if (taken) throw new HostAdminError("NAME_TAKEN", `There's already a host called "${name}".`);
}

/** Recalculates a host's capacity from its tables. Call inside the transaction that changed them. */
async function syncCapacity(tx: Tx, hostId: string) {
  const { _sum } = await tx.table.aggregate({ where: { hostId }, _sum: { capacity: true } });
  await tx.host.update({ where: { id: hostId }, data: { capacity: _sum.capacity ?? 0 } });
}

/** Takes the seating locks of these hosts, in a fixed order so two changes can't wait on each other. */
async function lockHosts(tx: Tx, hostIds: (string | null | undefined)[]) {
  for (const id of [...new Set(hostIds.filter((h): h is string => !!h))].sort()) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`seating:${id}`}))`;
  }
}

/** A new host with no tables, taking requests. Its id is made from the name and never changes. */
export async function createHost(name: unknown): Promise<{ id: string; name: string }> {
  const clean = cleanName(name);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('hosts'))`;
    await assertNameFree(tx, clean);
    const base = slugify(clean);
    let id = base;
    for (let n = 2; await tx.host.findUnique({ where: { id }, select: { id: true } }); n++) id = `${base}-${n}`;
    await tx.host.create({ data: { id, name: clean, capacity: 0 } });
    return { id, name: clean };
  });
}

/** Renames a host. Its id stays the same; cards made from now on print the new name. */
export async function renameHost(id: string, name: unknown): Promise<{ id: string; name: string; changed: boolean }> {
  const clean = cleanName(name);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('hosts'))`;
    const host = await tx.host.findUnique({ where: { id }, select: { name: true } });
    if (!host) throw new HostAdminError("NOT_FOUND", "That host could not be found.");
    if (host.name === clean) return { id, name: clean, changed: false };
    await assertNameFree(tx, clean, id);
    await tx.host.update({ where: { id }, data: { name: clean } });
    return { id, name: clean, changed: true };
  });
}

/** Shows or hides a host on the public page. Its guests and tables are untouched either way. */
export async function setHostAcceptingRequests(id: string, accepting: boolean): Promise<{ name: string }> {
  try {
    return await prisma.host.update({ where: { id }, data: { acceptingRequests: accepting }, select: { name: true } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      throw new HostAdminError("NOT_FOUND", "That host could not be found.");
    }
    throw error;
  }
}

/** Deletes a host, only when it has no guests at all and no tables, so nothing is lost. */
export async function deleteHost(id: string): Promise<{ name: string }> {
  return prisma.$transaction(async (tx) => {
    await lockHosts(tx, [id]);
    const host = await tx.host.findUnique({
      where: { id },
      select: { name: true, _count: { select: { guests: true, tables: true } } },
    });
    if (!host) throw new HostAdminError("NOT_FOUND", "That host could not be found.");
    if (host._count.guests > 0) {
      throw new HostAdminError(
        "IN_USE",
        `${host.name} has ${host._count.guests} guest record${host._count.guests === 1 ? "" : "s"}, so it can't be deleted. Hide it from the public page instead.`,
      );
    }
    if (host._count.tables > 0) {
      throw new HostAdminError("IN_USE", `${host.name} still has tables. Give them up first.`);
    }
    await tx.host.delete({ where: { id } });
    return { name: host.name };
  });
}

// --- Tables ---

/**
 * Gives a table to a host, or (with null) to nobody. Refused while approved
 * guests are seated there: move them to other tables first. Both hosts'
 * capacities are recalculated. The table keeps its card type.
 */
export async function assignTable(
  tableNumber: number,
  hostId: string | null,
): Promise<{ from: string | null; to: string | null; changed: boolean }> {
  return prisma.$transaction(async (tx) => {
    const found = await tx.table.findUnique({ where: { number: tableNumber }, select: { hostId: true } });
    if (!found) throw new HostAdminError("TABLE_NOT_FOUND", `There is no table ${tableNumber}.`);
    await lockHosts(tx, [found.hostId, hostId]);

    const table = await tx.table.findUniqueOrThrow({
      where: { number: tableNumber },
      include: { host: { select: { name: true } } },
    });
    const target = hostId ? await tx.host.findUnique({ where: { id: hostId }, select: { name: true } }) : null;
    if (hostId && !target) throw new HostAdminError("NOT_FOUND", "That host could not be found.");
    if (table.hostId === hostId) return { from: table.host?.name ?? null, to: target?.name ?? null, changed: false };

    const seated = await tx.guest.count({ where: { tableNumber, status: GuestStatus.APPROVED } });
    if (seated > 0) {
      throw new HostAdminError(
        "TABLE_BUSY",
        `${seated === 1 ? "1 approved guest is" : `${seated} approved guests are`} seated at table ${tableNumber}. Move them to another of ${table.host?.name ?? "the host"}'s tables first.`,
      );
    }

    await tx.table.update({ where: { number: tableNumber }, data: { hostId } });
    if (table.hostId) await syncCapacity(tx, table.hostId);
    if (hostId) await syncCapacity(tx, hostId);
    return { from: table.host?.name ?? null, to: target?.name ?? null, changed: true };
  });
}

/**
 * Changes how many tables there are and how many seats each has. More tables
 * appear unassigned and digital; fewer is refused while a table above the new
 * limit belongs to a host or has ever had a guest. Fewer seats is refused while
 * a table has more approved guests than that. Every host's capacity follows.
 */
export async function updateEventSettings(input: { maxTables: unknown; seatsPerTable: unknown }): Promise<EventSettings> {
  const maxTables = Number(input.maxTables);
  const seatsPerTable = Number(input.seatsPerTable);
  if (!Number.isInteger(maxTables) || maxTables < 1 || maxTables > MAX_TABLES_LIMIT) {
    throw new HostAdminError("INVALID", `The number of tables must be a whole number from 1 to ${MAX_TABLES_LIMIT}.`);
  }
  if (!Number.isInteger(seatsPerTable) || seatsPerTable < 1 || seatsPerTable > SEATS_LIMIT) {
    throw new HostAdminError("INVALID", `Seats per table must be a whole number from 1 to ${SEATS_LIMIT}.`);
  }

  return prisma.$transaction(
    async (tx) => {
      // Every host's seating is affected, so hold all of them still.
      const hosts = await tx.host.findMany({ select: { id: true } });
      await lockHosts(tx, hosts.map((h) => h.id));

      const beyond = await tx.table.findMany({
        where: { number: { gt: maxTables } },
        select: { number: true, hostId: true, _count: { select: { guests: true } } },
      });
      const inUse = beyond.filter((t) => t.hostId !== null || t._count.guests > 0).map((t) => t.number);
      if (inUse.length > 0) {
        throw new HostAdminError(
          "TABLE_BUSY",
          `Table${inUse.length === 1 ? "" : "s"} ${inUse.join(", ")} ${inUse.length === 1 ? "is" : "are"} still in use, so there can't be fewer than ${Math.max(...inUse)} tables. Give ${inUse.length === 1 ? "it" : "them"} up first.`,
        );
      }

      const crowded = await tx.guest.groupBy({
        by: ["tableNumber"],
        where: { status: GuestStatus.APPROVED, tableNumber: { not: null } },
        _count: { _all: true },
        having: { tableNumber: { _count: { gt: seatsPerTable } } },
      });
      if (crowded.length > 0) {
        throw new HostAdminError(
          "TABLE_BUSY",
          `Table ${crowded[0].tableNumber} already has ${crowded[0]._count._all} approved guests, more than ${seatsPerTable} seats. Move some first.`,
        );
      }

      await tx.table.deleteMany({ where: { number: { gt: maxTables } } });
      const existing = new Set((await tx.table.findMany({ select: { number: true } })).map((t) => t.number));
      const missing = Array.from({ length: maxTables }, (_, i) => i + 1).filter((n) => !existing.has(n));
      if (missing.length > 0) {
        await tx.table.createMany({ data: missing.map((number) => ({ number, capacity: seatsPerTable, hostId: null })) });
      }
      await tx.table.updateMany({ data: { capacity: seatsPerTable } });
      for (const host of hosts) await syncCapacity(tx, host.id);

      await tx.eventSettings.upsert({
        where: { id: 1 },
        create: { id: 1, maxTables, seatsPerTable },
        update: { maxTables, seatsPerTable },
      });
      return { maxTables, seatsPerTable };
    },
    { timeout: 20_000 },
  );
}
