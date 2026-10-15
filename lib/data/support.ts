import "server-only";

import { prisma } from "@/lib/prisma";
import { SupportRequestStatus } from "@/lib/generated/prisma/client";
import { normalizeEmail } from "@/lib/utils";
import type { SupportRequestInput } from "@/lib/validation/support";
import type { SupportRequest } from "@/types/support";

// Persistence for the public "Need help?" form. All Prisma access for support
// requests goes through this module. Nothing here looks at guests: the sender
// may not have registered, and nothing may reveal whether they have.

/** Saves a validated request as OPEN. Input must come from `parseSupportRequest`. */
export function createSupportRequest(input: SupportRequestInput): Promise<SupportRequest> {
  return prisma.invitationSupportRequest.create({
    data: {
      name: input.name,
      email: normalizeEmail(input.email),
      issueType: input.issueType,
      message: input.message,
    },
  });
}

/** Newest first. `limit` guards the admin page against a flood of requests. */
export function getSupportRequests(
  filter: { status?: SupportRequestStatus } = {},
  limit = 200,
): Promise<SupportRequest[]> {
  return prisma.invitationSupportRequest.findMany({
    where: filter,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: limit,
  });
}

export async function getSupportCounts(): Promise<Record<SupportRequestStatus | "all", number>> {
  const rows = await prisma.invitationSupportRequest.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  const counts = { OPEN: 0, RESOLVED: 0, all: 0 };
  for (const row of rows) {
    counts[row.status] = row._count._all;
    counts.all += row._count._all;
  }
  return counts;
}

/** What the admin notification bell shows: the open total and the latest few. */
export async function getSupportNotifications(
  latest = 5,
): Promise<{ open: number; latest: SupportRequest[] }> {
  const [open, requests] = await Promise.all([
    prisma.invitationSupportRequest.count({ where: { status: SupportRequestStatus.OPEN } }),
    getSupportRequests({ status: SupportRequestStatus.OPEN }, latest),
  ]);
  return { open, latest: requests };
}

/**
 * Marks a request RESOLVED. Resolving one that is already resolved is a no-op
 * success, so a double click or a stale page can't fail. Returns null if the
 * request doesn't exist.
 */
export async function resolveSupportRequest(id: string): Promise<SupportRequest | null> {
  await prisma.invitationSupportRequest.updateMany({
    where: { id, status: SupportRequestStatus.OPEN },
    data: { status: SupportRequestStatus.RESOLVED },
  });
  return prisma.invitationSupportRequest.findUnique({ where: { id } });
}
