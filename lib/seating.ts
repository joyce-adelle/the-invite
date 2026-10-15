// Capacity and table occupancy, derived from configuration plus counts of
// APPROVED guests. Pure functions, so the admin UI can use them too.

import type { Host } from "@/config/event";

export type TableOccupancy = {
  number: number;
  capacity: number;
  occupied: number;
  remaining: number;
};

export type HostOccupancy = {
  hostId: string;
  name: string;
  capacity: number;
  approved: number;
  remaining: number;
  tables: TableOccupancy[];
};

/**
 * @param approved APPROVED guests invited by this host.
 * @param approvedByTable APPROVED guests seated at each table number.
 */
export function hostOccupancy(
  host: Host,
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

/** First table, in configured order, with a free seat; null if none. */
export function nextAvailableTable(occupancy: HostOccupancy): number | null {
  return occupancy.tables.find((table) => table.remaining > 0)?.number ?? null;
}
