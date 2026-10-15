import "server-only";

import type { Guest } from "@/types/guest";

// Access-card delivery. The PDF and the email are still placeholders; the
// flows that call them (lib/invitations.ts) are real.

/**
 * Emails the guest their access card, whatever its current card status.
 * Resolves once the email has been accepted for delivery and throws if it
 * wasn't, so callers record SENT or FAILED from the outcome.
 *
 * SIMULATED for now: nothing is generated or sent, and it always succeeds.
 * `simulated` lets the UI say so. Replace the body with PDF generation plus
 * Resend, and return `{ simulated: false }`.
 */
export async function sendAccessCard(guest: Guest): Promise<{ simulated: boolean }> {
  console.info(
    `[simulated email] access card for guest ${guest.id}, table ${guest.tableNumber ?? "none"}`,
  );
  return { simulated: true };
}

/** The guest's access card as PDF bytes, or null while generation isn't built yet. */
export async function createAccessCardPdf(guest: Guest): Promise<Uint8Array | null> {
  void guest;
  // TODO: overlay the guest's name and table onto the template (config/event.ts).
  return null;
}
