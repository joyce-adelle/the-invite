import "server-only";

import { prisma } from "@/lib/prisma";
import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import type { HostWithTables } from "@/lib/seating";

// Hosts and tables are seeded (prisma/seed.ts) and read-only in the app.

type Client = PrismaClient | Prisma.TransactionClient;

// Tables are filled in ascending number order when guests are approved.
const withTables = {
  tables: { orderBy: { number: "asc" } },
} satisfies Prisma.HostInclude;

export function getHosts(client: Client = prisma): Promise<HostWithTables[]> {
  return client.host.findMany({ include: withTables, orderBy: { id: "asc" } });
}

export function getHost(id: string, client: Client = prisma): Promise<HostWithTables | null> {
  return client.host.findUnique({ where: { id }, include: withTables });
}
