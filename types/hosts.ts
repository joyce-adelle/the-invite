import type { Host, Table } from "@/lib/generated/prisma/browser";

/** What the public site may know about a host: no capacity, no tables. */
export type PublicHost = { id: string; name: string };

export type HostWithTables = Host & { tables: Table[] };

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