import { GuestStatus } from "@/types/guest";
import type { CheckInView } from "@/types/check-in";

// What the check-in page should offer for a guest. Pure, so the server page and
// the confirm button agree, and it can be tested.

export type CheckInState =
  /** Approved and not yet in: offer the confirm button. */
  | { kind: "ready" }
  | { kind: "checked-in" }
  /** Can't be let in, and why, for the person at the door. */
  | { kind: "not-eligible"; reason: string };

const REASONS: Record<Exclude<GuestStatus, "APPROVED">, string> = {
  PENDING: "This invitation is still pending: it hasn't been approved.",
  REJECTED: "This invitation request was rejected.",
  CANCELLED: "This invitation was cancelled.",
};

export function checkInState(guest: Pick<CheckInView, "status" | "checkedInAt">): CheckInState {
  if (guest.status !== GuestStatus.APPROVED) {
    return { kind: "not-eligible", reason: REASONS[guest.status] };
  }
  return guest.checkedInAt ? { kind: "checked-in" } : { kind: "ready" };
}
