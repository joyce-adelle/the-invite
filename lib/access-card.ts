import "server-only";

import type { Guest } from "@/types/guest";

// Placeholders for the access-card features. The admin dashboard already calls
// these, so building the real thing means filling them in and nothing else.

/**
 * Emails the guest their access card, whatever its current card status.
 * Returns whether an email actually went out.
 */
export async function sendAccessCard(guest: Guest): Promise<boolean> {
  void guest;
  // TODO: generate the PDF, send it with Resend, then record the result with
  // updateCardStatus(guest.id, CardStatus.SENT | CardStatus.FAILED).
  return false;
}

/** The guest's access card as PDF bytes, or null while generation isn't built yet. */
export async function createAccessCardPdf(guest: Guest): Promise<Uint8Array | null> {
  void guest;
  // TODO: overlay the guest's name and table onto the template (config/event.ts).
  return null;
}
