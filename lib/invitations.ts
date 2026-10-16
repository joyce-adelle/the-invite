import "server-only";

import { sendAccessCard } from "@/lib/access-card";
import { GuestError } from "@/lib/data/errors";
import {
  approveGuest,
  getGuest,
  updateCardStatus,
  updateGuestTable,
} from "@/lib/data/guests";
import { CardStatus, GuestStatus, type Guest } from "@/types/guest";
import { CardDelivery, InvitationResult } from "@/types/invitation";

// Invitation business flows: a seating decision followed by delivering the
// access card. The seating rules themselves (status checks, capacity, table
// allocation, locking) live in lib/data/guests.ts; this layer only decides
// what happens next and records how the delivery went.
//
// Delivery can fail without undoing the decision: an approved guest stays
// approved and a moved guest stays moved, with the card marked FAILED so an
// admin can resend it.

type SendCard = typeof sendAccessCard;

/**
 * Sends the card, then records SENT or FAILED. The card is never marked SENT
 * before the send has succeeded.
 */
async function deliverAccessCard(guest: Guest, send: SendCard): Promise<InvitationResult> {
  let delivery: CardDelivery;
  try {
    await send(guest);
    delivery = { status: "SENT" };
  } catch (error) {
    console.error(`Sending the access card for guest ${guest.id} failed`, error);
    const message = error instanceof Error && error.message ? error.message : "an unknown error";
    delivery = { status: "FAILED", reason: message.slice(0, 240) };
  }
  const updated = await updateCardStatus(
    guest.id,
    delivery.status === "SENT" ? CardStatus.SENT : CardStatus.FAILED,
  );
  return { guest: updated, delivery };
}

/**
 * Approves a PENDING guest (table and capacity rules apply, see approveGuest),
 * then emails their card. If the approval is refused nothing is sent.
 */
export async function approveInvitation(
  id: string,
  send: SendCard = sendAccessCard,
): Promise<InvitationResult> {
  return deliverAccessCard(await approveGuest(id), send);
}

/**
 * Moves an approved guest to another table, then emails them a new card for
 * it. Returns `delivery: null` when they were already at that table, in which
 * case nothing changed and nothing is sent.
 */
export async function moveInvitationTable(
  id: string,
  tableNumber: number,
  send: SendCard = sendAccessCard,
): Promise<{ guest: Guest; delivery: CardDelivery | null }> {
  const { guest, moved } = await updateGuestTable(id, tableNumber);
  if (!moved) return { guest, delivery: null };
  return deliverAccessCard(guest, send);
}

/** Sends an approved guest their card again, including when it was sent before. */
export async function resendAccessCard(
  id: string,
  send: SendCard = sendAccessCard,
): Promise<InvitationResult> {
  const guest = await getGuest(id);
  if (!guest) throw new GuestError("GUEST_NOT_FOUND", `No guest with id ${id}.`);
  if (guest.status !== GuestStatus.APPROVED) {
    throw new GuestError("INVALID_STATUS", "Only approved guests have an access card.");
  }
  return deliverAccessCard(guest, send);
}
