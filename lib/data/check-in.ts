import "server-only";

import { generateCheckInToken, isCheckInToken } from "@/lib/check-in/check-in";
import { GuestError } from "@/lib/data/errors";
import { GuestStatus, Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeEmail } from "@/lib/utils";
import type { CheckInOutcome, CheckInView } from "@/types/check-in";

// Check-in at the door. The server decides everything here: who the guest is
// (from the token alone), whether they may enter (their current status), and
// whether they already did. Nothing the browser sends can say otherwise.

const select = {
  name: true,
  tableNumber: true,
  status: true,
  checkedInAt: true,
  checkedInBy: true,
  host: { select: { name: true } },
} satisfies Prisma.GuestSelect;

function toView({ host, ...guest }: Prisma.GuestGetPayload<{ select: typeof select }>): CheckInView {
  return { ...guest, hostName: host.name };
}

/** The guest behind a token, or null for a token that doesn't belong to anyone. */
export async function getCheckInView(token: string): Promise<CheckInView | null> {
  if (!isCheckInToken(token)) return null;
  const guest = await prisma.guest.findUnique({ where: { checkInToken: token }, select });
  return guest ? toView(guest) : null;
}

/**
 * Lets a guest in, once. The whole decision is one conditional UPDATE: it only
 * matches an APPROVED guest whose check-in fields are both still empty, and it
 * fills both in the same statement. Two admins confirming at the same moment
 * race on that row; the database lets one through, and the other finds it no
 * longer matches and is told the guest already checked in, with the first
 * admin's details, which are never overwritten.
 *
 * `adminEmail` must come from the verified session, never from the request.
 */
export async function checkInGuest(token: string, adminEmail: string): Promise<CheckInOutcome> {
  const by = normalizeEmail(adminEmail);
  if (!by) throw new Error("A check-in has to name the admin who did it.");
  if (!isCheckInToken(token)) return { outcome: "not-found" };

  const { count } = await prisma.guest.updateMany({
    where: { checkInToken: token, status: GuestStatus.APPROVED, checkedInAt: null, checkedInBy: null },
    data: { checkedInAt: new Date(), checkedInBy: by },
  });

  const row = await prisma.guest.findUnique({ where: { checkInToken: token }, select });
  if (!row) return { outcome: "not-found" };
  const guest = toView(row);

  if (count === 1) return { outcome: "checked-in", guest };
  if (guest.status !== GuestStatus.APPROVED) return { outcome: "not-eligible", guest };
  if (guest.checkedInAt) return { outcome: "already-checked-in", guest };
  // Approved and not checked in, yet nothing was updated: the guest changed under us
  // (say, cancelled and approved again). Better to fail than to claim a check-in.
  throw new Error("The check-in could not be recorded. Please try again.");
}

/**
 * The guest's check-in token, made on the spot for an approved guest who has
 * none yet (someone approved before QR codes existed). An existing token is
 * never replaced, however many times or at once this is called: the
 * conditional update only fills an empty column.
 */
export async function ensureCheckInToken(guestId: string): Promise<string> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const guest = await prisma.guest.findUnique({
      where: { id: guestId },
      select: { checkInToken: true, status: true },
    });
    if (!guest) throw new GuestError("GUEST_NOT_FOUND", `No guest with id ${guestId}.`);
    if (guest.checkInToken) return guest.checkInToken;
    if (guest.status !== GuestStatus.APPROVED) {
      throw new GuestError("INVALID_STATUS", "Only approved guests have a check-in code.");
    }

    try {
      await prisma.guest.updateMany({
        where: { id: guestId, status: GuestStatus.APPROVED, checkInToken: null },
        data: { checkInToken: generateCheckInToken() },
      });
    } catch (error) {
      // A random collision with another guest's token: pick another.
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
    }
    // Read again: if another request filled it first, theirs is the one to use.
  }
  throw new Error(`Could not make a check-in code for guest ${guestId}.`);
}
