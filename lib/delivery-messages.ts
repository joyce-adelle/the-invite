import type { CardDelivery } from "@/types/invitation";

// What an admin reads after a card email. The guest stays approved (or moved)
// whatever happens to the email, so a failed send says exactly that, gives the
// reason Resend or the app reported, and says how to try again.

/** After an approval or a table change, which also did something else first. */
export function deliveryMessage(
  done: string,
  delivery: CardDelivery,
  email: string,
): string | { message: string; notice: true } {
  if (delivery.status === "FAILED") {
    return {
      message: `${done}, but the access card could not be emailed: ${delivery.reason}. Their card is marked failed; use “Resend access card” to try again.`,
      notice: true,
    };
  }
  return `${done}. Access card emailed to ${email}.`;
}

/** After an explicit resend, where a failed email is the whole result. */
export function resendMessage(
  guest: { name: string; email: string },
  delivery: CardDelivery,
): { ok: true; message: string } | { ok: false; message: string } {
  if (delivery.status === "FAILED") {
    return {
      ok: false,
      message: `The access card for ${guest.name} could not be emailed: ${delivery.reason}. Their card is marked failed; you can try again.`,
    };
  }
  return { ok: true, message: `Access card emailed to ${guest.email}.` };
}
