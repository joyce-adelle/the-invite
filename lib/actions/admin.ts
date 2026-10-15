"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin-session";
import { sendAccessCard } from "@/lib/access-card";
import { GuestError, isGuestError } from "@/lib/data/errors";
import {
  approveGuest,
  cancelGuest,
  getGuest,
  rejectGuest,
  updateGuestTable,
} from "@/lib/data/guests";
import { GuestStatus, type Guest } from "@/types/guest";

// Every admin mutation goes through here. Server actions are public POST
// endpoints, so each one checks the session itself and validates its input.

/** `notice` marks a success that didn't do the whole job, so the UI shouldn't celebrate it. */
export type AdminActionResult =
  | { ok: true; message: string; notice?: boolean }
  | { ok: false; message: string };

const guestIdSchema = z.uuid();
const tableNumberSchema = z.number().int().positive();

const NOT_FOUND = "That guest could not be found.";
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

export async function approveGuestAction(id: string): Promise<AdminActionResult> {
  return run(id, async (guestId) => {
    const guest: Guest = await approveGuest(guestId);
    return `${guest.name} approved and seated at table ${guest.tableNumber}.`;
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
    const guest = await updateGuestTable(guestId, table.data);
    return `${guest.name} moved to table ${guest.tableNumber}.`;
  });
}

/** Sends an approved guest their access card, including when it was sent before. */
export async function resendAccessCardAction(id: string): Promise<AdminActionResult> {
  return run(id, async (guestId) => {
    const guest = await getGuest(guestId);
    if (!guest) throw new GuestError("GUEST_NOT_FOUND", NOT_FOUND);
    if (guest.status !== GuestStatus.APPROVED) {
      throw new GuestError("INVALID_STATUS", "Only approved guests have an access card.");
    }

    if (await sendAccessCard(guest)) return `Access card sent to ${guest.email}.`;
    return {
      message: "Sending access cards isn't set up yet, so no email was sent.",
      notice: true,
    };
  });
}
