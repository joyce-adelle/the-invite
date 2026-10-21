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
 * @param approved APPROVED guests invited by this host.
 * @param approvedByTable APPROVED guests seated at each table number.
 */
export function hostOccupancy(
  host: HostWithTables,
  approved: number,
  approvedByTable: ReadonlyMap<number, number>,
): HostOccupancy {
  return {
    hostId: host.id,
    name: host.name,
    capacity: host.capacity,
    approved,
    remaining: Math.max(0, host.capacity - approved),
    tables: host.tables.map((table) => {
      const occupied = approvedByTable.get(table.number) ?? 0;
      return {
        number: table.number,
        capacity: table.capacity,
        occupied,
        remaining: Math.max(0, table.capacity - occupied),
      };
    }),
  };
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
