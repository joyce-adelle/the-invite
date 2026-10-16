import "server-only";

import { createGuestRequest } from "@/lib/data/guests";
import { getPublicHost } from "@/lib/data/hosts";
import { isGuestError } from "@/lib/data/errors";
import { parseInvitationRequest } from "@/lib/validation/invitation";
import type { InvitationRequestState } from "@/types/invitation";

// What a public invitation request leads to. Kept apart from the server action
// (lib/actions/invitation.ts) so it can be tested without a browser request:
// the action only turns a `goto` into a redirect.

const GENERIC_ERROR = "Something went wrong on our side. Please try again in a moment.";
const UNKNOWN_HOST = "We couldn't find that invitation. Please go back and choose again.";

export type RequestOutcome =
  /** Stay on the form and show this. */
  | { state: Extract<InvitationRequestState, { status: "error" }> }
  /**
   * Go to a page of its own. `received`: the request was saved. `help`: the
   * name is already registered, which looks the same whatever that guest's
   * status, so nothing about them is revealed.
   */
  | { goto: { hostId: string; page: "received" | "help" } };

export async function handleInvitationRequest(formData: FormData): Promise<RequestOutcome> {
  const parsed = parseInvitationRequest({
    name: formData.get("name"),
    email: formData.get("email"),
  });
  if (!parsed.success) return { state: { status: "error", fieldErrors: parsed.fieldErrors } };

  // The id comes from the browser, so treat it as untrusted: it must match a
  // configured host exactly.
  const hostId = formData.get("hostId");
  const host =
    typeof hostId === "string" && hostId.length <= 64 ? await getPublicHost(hostId) : null;
  if (!host) return { state: { status: "error", message: UNKNOWN_HOST } };

  try {
    await createGuestRequest({ ...parsed.data, invitedBy: host.id });
    return { goto: { hostId: host.id, page: "received" } };
  } catch (error) {
    if (isGuestError(error, "DUPLICATE_NAME")) return { goto: { hostId: host.id, page: "help" } };
    if (isGuestError(error, "HOST_FULL")) return { state: { status: "error", hostFull: true } };
    if (isGuestError(error, "UNKNOWN_HOST")) return { state: { status: "error", message: UNKNOWN_HOST } };
    console.error("Invitation request failed", error);
    return { state: { status: "error", message: GENERIC_ERROR } };
  }
}
