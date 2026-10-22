import { HostOccupancy, HostWithTables } from "@/types/hosts";

import { Attendance } from "@/types/check-in";

export { cn } from "cn";

/** The form every email is stored and compared in. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * The comparison key behind `Guest.normalizedName`: lowercase letters and digits only,
 * so "Jane O'Doe" and "JANE ODOE" match. Never use it for the display `name`.
 */
export function normalizeName(name: string): string {
  return name
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

/**
 * Who is seated where, and what's left for approvals. A physical table's seats
 * are already taken by printed cards, so it counts as full and approvals only
 * ever use digital tables.
 *
 * @param approved APPROVED guests invited by this host.
 * @param approvedByTable APPROVED guests seated at each table number.
 */
export function hostOccupancy(
  host: HostWithTables,
  approved: number,
  approvedByTable: ReadonlyMap<number, number>,
): HostOccupancy {
  const physical = host.tables.filter((table) => table.cardType === "PHYSICAL");
  const physicalSeats = physical.reduce((sum, table) => sum + table.capacity, 0);
  const digitalCapacity = Math.max(0, host.capacity - physicalSeats);

  return {
    hostId: host.id,
    name: host.name,
    capacity: host.capacity,
    physicalSeats,
    digitalCapacity,
    approved,
    remaining: Math.max(0, digitalCapacity - approved),
    tables: host.tables.map((table) => {
      const occupied = approvedByTable.get(table.number) ?? 0;
      return {
        number: table.number,
        capacity: table.capacity,
        cardType: table.cardType,
        occupied,
        remaining: table.cardType === "PHYSICAL" ? 0 : Math.max(0, table.capacity - occupied),
      };
    }),
  };
}

/**
 * Whether a host takes new requests from the public site. That's measured
 * against everyone the host may bring, physical cards included, so a host with
 * only physical tables still takes requests: an admin decides at approval
 * (moving the guest to another host, or making a table digital).
 */
export function acceptsRequests(occupancy: Pick<HostOccupancy, "capacity" | "approved">): boolean {
  return occupancy.capacity > occupancy.approved;
}

/** First table, in the order given, with a free seat; null if none. */
export function nextAvailableTable(occupancy: HostOccupancy): number | null {
  return occupancy.tables.find((table) => table.remaining > 0)?.number ?? null;
}

export function attendanceOf(approved: number, checkedIn: number): Attendance {
  return {
    approved,
    checkedIn,
    notCheckedIn: Math.max(0, approved - checkedIn),
    percent: approved > 0 ? Math.round((checkedIn / approved) * 100) : 0,
  };
}
