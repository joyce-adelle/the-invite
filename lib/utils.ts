import { HostOccupancy, HostWithTables } from "@/types/hosts";

export { cn } from "cn";

/** Whether the email is in ADMIN_EMAILS (comma-separated). */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const admins = (process.env.ADMIN_EMAILS ?? "").split(",").map(normalizeEmail);
  return admins.includes(normalizeEmail(email));
}

/** The form every email is stored and compared in. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Trims and collapses runs of whitespace, so "Ada   Lovelace " and "Ada Lovelace" match. */
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
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
