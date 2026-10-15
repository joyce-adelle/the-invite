"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin-session";
import { isGuestError } from "@/lib/data/errors";
import { cancelGuest, rejectGuest } from "@/lib/data/guests";
import { resolveSupportRequest } from "@/lib/data/support";
import {
  approveInvitation,
  moveInvitationTable,
  resendAccessCard,
  type CardDelivery,
} from "@/lib/invitations";

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
  operation: (id: string) => Promise<string | { message: string; notice: true }>,
): Promise<AdminActionResult> {
  await requireAdmin();

  const parsed = guestIdSchema.safeParse(id);
  if (!parsed.success) return { ok: false, message: NOT_FOUND };

  try {
    const outcome = await operation(parsed.data);
    revalidatePath("/admin");
    return typeof outcome === "string"
      ? { ok: true, message: outcome }
      : { ok: true, ...outcome };
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

/** Words a card delivery outcome for the toast; a failed send is a notice, not a success. */
function withDelivery(
  done: string,
  delivery: CardDelivery,
): string | { message: string; notice: true } {
  if (delivery.status === "FAILED") {
    return {
      message: `${done}, but the access card couldn't be sent. Use “Resend access card” to try again.`,
      notice: true,
    };
  }
  return `${done}. Access card sent${delivery.simulated ? " (simulated)" : ""}.`;
}

export async function approveGuestAction(id: string): Promise<AdminActionResult> {
  return run(id, async (guestId) => {
    const { guest, delivery } = await approveInvitation(guestId);
    return withDelivery(`${guest.name} approved and seated at table ${guest.tableNumber}`, delivery);
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
    return withDelivery(`${guest.name} moved to table ${guest.tableNumber}`, delivery);
  });
}

/** Sends an approved guest their access card, including when it was sent before. */
export async function resendAccessCardAction(id: string): Promise<AdminActionResult> {
  return run(id, async (guestId) => {
    const { guest, delivery } = await resendAccessCard(guestId);
    if (delivery.status === "FAILED") {
      return {
        message: `The access card for ${guest.name} couldn't be sent. Please try again.`,
        notice: true,
      };
    }
    return `Access card sent to ${guest.email}${delivery.simulated ? " (simulated)" : ""}.`;
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
