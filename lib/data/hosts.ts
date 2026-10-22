import "server-only";

import { prisma } from "@/lib/prisma";
import type { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { HostWithTables, PublicHost } from "@/types/hosts";

// Reading hosts and their tables. Hosts are seeded, then managed by admins on
// /admin/hosts (lib/data/host-admin.ts).

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

// --- Public reads ---

/** Hosts on the public page: only those taking requests. A hidden host is "not found" to the public. */
export function getPublicHosts(): Promise<PublicHost[]> {
  return prisma.host.findMany({
    where: { acceptingRequests: true },
    select: { id: true, name: true },
    orderBy: { id: "asc" },
  });
}

export function getPublicHost(id: string): Promise<PublicHost | null> {
  return prisma.host.findFirst({ where: { id, acceptingRequests: true }, select: { id: true, name: true } });
}

/** A host's name, hidden or not: what an access card prints under "Guest Type". */
export async function getHostName(id: string): Promise<string | null> {
  return (await prisma.host.findUnique({ where: { id }, select: { name: true } }))?.name ?? null;
}
