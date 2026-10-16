"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin-session";
import { isGuestError } from "@/lib/data/errors";
import { cancelGuest, rejectGuest } from "@/lib/data/guests";
import { resolveSupportRequest } from "@/lib/data/support";
import { deliveryMessage, resendMessage } from "@/lib/delivery-messages";
import { approveInvitation, moveInvitationTable, resendAccessCard } from "@/lib/invitations";

// Every admin mutation goes through here. Server actions are public POST
// endpoints, so each one checks the session itself and validates its input.

/** `notice` marks a success that didn't do the whole job, so the UI shouldn't celebrate it. */
export type AdminActionResult =
  | { ok: true; message: string; notice?: boolean }
  | { ok: false; message: string };

const guestIdSchema = z.uuid();
const tableNumberSchema = z.number().int().positive();

const NOT_FOUND = "That guest could not be found.";
const SUPPORT_NOT_FOUND = "That help request could not be found.";
const GENERIC_ERROR = "Something went wrong on our side. Please try again.";

async function run(
  id: unknown,
  operation: (
    id: string,
  ) => Promise<string | { message: string; notice: true } | { ok: false; message: string }>,
): Promise<AdminActionResult> {
  await requireAdmin();

  const parsed = guestIdSchema.safeParse(id);
  if (!parsed.success) return { ok: false, message: NOT_FOUND };

  try {
    const outcome = await operation(parsed.data);
    revalidatePath("/admin");
    if (typeof outcome === "string") return { ok: true, message: outcome };
    return "ok" in outcome ? outcome : { ok: true, ...outcome };
  } catch (error) {
    // Refresh either way: a failure often means the list was out of date.
    revalidatePath("/admin");
    if (isGuestError(error)) {
      return { ok: false, message: error.code === "GUEST_NOT_FOUND" ? NOT_FOUND : error.message };
    }
    console.error("Admin action failed", error);
    return { ok: false, message: GENERIC_ERROR };
  }
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
