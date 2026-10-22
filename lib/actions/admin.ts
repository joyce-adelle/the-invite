"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin-session";
import { isGuestError } from "@/lib/data/errors";
import { GuestStatus } from "@/types/guest";
import { cancelGuest, createGuest, rejectGuest, updateGuestDetails } from "@/lib/data/guests";
import { getHost } from "@/lib/data/hosts";
import { resolveSupportRequest } from "@/lib/data/support";
import { deliveryMessage, resendMessage } from "@/lib/delivery-messages";
import { approveInvitation, moveInvitationTable, resendAccessCard } from "@/lib/invitations";
import { parseInvitationRequest, type InvitationRequestFieldErrors } from "@/lib/validation/invitation";

// Every admin mutation goes through here. Server actions are public POST
// endpoints, so each one checks the session itself and validates its input.

/** `notice` marks a success that didn't do the whole job, so the UI shouldn't celebrate it. */
export type AdminActionResult =
  | { ok: true; message: string; notice?: boolean }
  | { ok: false; message: string; fieldErrors?: InvitationRequestFieldErrors };

const guestIdSchema = z.uuid();
const tableNumberSchema = z.number().int().positive();

const NOT_FOUND = "That guest could not be found.";
const SUPPORT_NOT_FOUND = "That help request could not be found.";
const UNKNOWN_HOST = "Choose which host this guest is invited by.";
const GENERIC_ERROR = "Something went wrong on our side. Please try again.";

type Outcome = string | { message: string; notice: true } | { ok: false; message: string };

/** Runs a change, refreshes the dashboard and turns the outcome (or an expected failure) into a result. */
async function settle(operation: () => Promise<Outcome>): Promise<AdminActionResult> {
  try {
    const outcome = await operation();
    revalidatePath("/admin");
    if (typeof outcome === "string") return { ok: true, message: outcome };
    return "ok" in outcome ? outcome : { ok: true, ...outcome };
  } catch (error) {
    // Refresh either way: a failure often means the list was out of date.
    revalidatePath("/admin");
    if (isGuestError(error)) {
      if (error.code === "GUEST_NOT_FOUND") return { ok: false, message: NOT_FOUND };
      if (error.code === "UNKNOWN_HOST") return { ok: false, message: UNKNOWN_HOST };
      return { ok: false, message: error.message };
    }
    console.error("Admin action failed", error);
    return { ok: false, message: GENERIC_ERROR };
  }
}

async function run(
  id: unknown,
  operation: (id: string) => Promise<Outcome>,
): Promise<AdminActionResult> {
  await requireAdmin();

  const parsed = guestIdSchema.safeParse(id);
  if (!parsed.success) return { ok: false, message: NOT_FOUND };

  return settle(() => operation(parsed.data));
}

/**
 * Adds a guest on an admin's behalf, as a PENDING request. Unlike the public
 * form, a name that is already taken is allowed: two guests can share a name.
 * It takes no capacity until the guest is approved.
 */
export async function createGuestAction(input: {
  name: string;
  email: string;
  hostId: string;
}): Promise<AdminActionResult> {
  await requireAdmin();

  const parsed = parseInvitationRequest({ name: input?.name, email: input?.email });
  if (!parsed.success) {
    return { ok: false, message: "Please check the highlighted fields.", fieldErrors: parsed.fieldErrors };
  }
  const hostId = typeof input?.hostId === "string" && input.hostId.length <= 64 ? input.hostId : "";
  if (!hostId) return { ok: false, message: UNKNOWN_HOST };

  return settle(async () => {
    const guest = await createGuest({ ...parsed.data, invitedBy: hostId });
    return `${guest.name} was added as a pending request. Approve them from the list when you're ready.`;
  });
}

/**
 * Corrects a guest's name, email or host, whatever their status. Moving an
 * approved guest to another host seats them there (or fails with the reason).
 * Either way the card they hold no longer matches, so the result says to send
 * it again.
 */
export async function updateGuestAction(
  id: string,
  input: { name: string; email: string; hostId?: string },
): Promise<AdminActionResult> {
  await requireAdmin();

  const parsed = parseInvitationRequest({ name: input?.name, email: input?.email });
  if (!parsed.success) {
    return { ok: false, message: "Please check the highlighted fields.", fieldErrors: parsed.fieldErrors };
  }
  const hostId = input?.hostId;
  if (hostId !== undefined && (typeof hostId !== "string" || !hostId || hostId.length > 64)) {
    return { ok: false, message: UNKNOWN_HOST };
  }

  return run(id, async (guestId) => {
    const { guest, changed } = await updateGuestDetails(guestId, { ...parsed.data, invitedBy: hostId });
    if (!changed.name && !changed.email && !changed.host) return `No changes to save for ${guest.name}.`;

    const host = changed.host ? await getHost(guest.invitedBy) : null;
    const moved = host
      ? guest.status === GuestStatus.APPROVED
        ? ` They now belong to ${host.name} and are seated at table ${guest.tableNumber}.`
        : ` They now belong to ${host.name}.`
      : "";
    if (guest.status === GuestStatus.APPROVED) {
      return {
        message: `${guest.name}'s details were updated.${moved} The card they were sent has the old details, so use “Send access card” to email them a new one.`,
        notice: true,
      };
    }
    return `${guest.name}'s details were updated.${moved}`;
  });
}

export async function approveGuestAction(id: string): Promise<AdminActionResult> {
  return run(id, async (guestId) => {
    const { guest, delivery } = await approveInvitation(guestId);
    return deliveryMessage(
      `${guest.name} approved and seated at table ${guest.tableNumber}`,
      delivery,
      guest.email,
    );
  });
}

export async function rejectGuestAction(id: string): Promise<AdminActionResult> {
  return run(id, async (guestId) => {
    const guest = await rejectGuest(guestId);
    return `${guest.name}'s request was rejected. No email was sent.`;
  });
}

export async function cancelGuestAction(id: string): Promise<AdminActionResult> {
  return run(id, async (guestId) => {
    const guest = await cancelGuest(guestId);
    return `${guest.name}'s invitation was cancelled.`;
  });
}

export async function changeGuestTableAction(
  id: string,
  tableNumber: number,
): Promise<AdminActionResult> {
  const table = tableNumberSchema.safeParse(tableNumber);
  if (!table.success) {
    await requireAdmin();
    return { ok: false, message: "Choose a valid table." };
  }
  return run(id, async (guestId) => {
    const { guest, delivery } = await moveInvitationTable(guestId, table.data);
    if (!delivery) return `${guest.name} is already at table ${guest.tableNumber}.`;
    return deliveryMessage(`${guest.name} moved to table ${guest.tableNumber}`, delivery, guest.email);
  });
}

/** Sends an approved guest their access card, including when it was sent before. */
export async function resendAccessCardAction(id: string): Promise<AdminActionResult> {
  return run(id, async (guestId) => {
    const { guest, delivery } = await resendAccessCard(guestId);
    const result = resendMessage(guest, delivery);
    // A failed email changes nothing else, so it is a plain failure.
    return result.ok ? result.message : result;
  });
}

/** Marks a help request resolved. Resolving one that is already resolved succeeds quietly. */
export async function resolveSupportRequestAction(id: string): Promise<AdminActionResult> {
  await requireAdmin();

  const parsed = guestIdSchema.safeParse(id);
  if (!parsed.success) return { ok: false, message: SUPPORT_NOT_FOUND };

  try {
    const request = await resolveSupportRequest(parsed.data);
    // The header's notification count lives in the layout, so refresh from there down.
    revalidatePath("/admin", "layout");
    if (!request) return { ok: false, message: SUPPORT_NOT_FOUND };
    return { ok: true, message: `Request from ${request.name} marked as resolved.` };
  } catch (error) {
    console.error("Resolving support request failed", error);
    return { ok: false, message: GENERIC_ERROR };
  }
}
