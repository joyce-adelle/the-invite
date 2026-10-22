import type { AccessCardType, Host, Table } from "@/lib/generated/prisma/browser";

export type { AccessCardType };

/** What the public site may know about a host: no capacity, no tables. */
export type PublicHost = { id: string; name: string };

export type HostWithTables = Host & { tables: Table[] };

export type TableOccupancy = {
    number: number;
    capacity: number;
    cardType: AccessCardType;
    /** Approved guests seated here. Always 0 at a physical table, which no one is seated at online. */
    occupied: number;
    /** Seats left for an approval. A physical table has none: its seats are taken by printed cards. */
    remaining: number;
};

export type HostOccupancy = {
    hostId: string;
    name: string;
    /** Every guest the host may bring, physical cards included. */
    capacity: number;
    /** Seats at the host's physical tables, already taken by printed cards. */
    physicalSeats: number;
    /** Places that online requests can be approved into: everyone but the physical cards. Seats still come from digital tables. */
    digitalCapacity: number;
    approved: number;
    /** Digital places left for approvals. */
    remaining: number;
    tables: TableOccupancy[];
};
