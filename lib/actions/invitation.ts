"use server";

import { InvitationRequestState } from "@/types/invitation";
import { createGuestRequest } from "@/lib/data/guests";
import { getPublicHost } from "@/lib/data/hosts";
import { isGuestError } from "@/lib/data/errors";
import {
  parseInvitationRequest,
} from "@/lib/validation/invitation";

const GENERIC_ERROR = "Something went wrong on our side. Please try again in a moment.";
const UNKNOWN_HOST = "We couldn't find that invitation. Please go back and choose again.";

export async function submitInvitationRequest(
  _previous: InvitationRequestState,
  formData: FormData,
): Promise<InvitationRequestState> {
  const parsed = parseInvitationRequest({
    name: formData.get("name"),
    email: formData.get("email"),
  });
  if (!parsed.success) return { status: "error", fieldErrors: parsed.fieldErrors };

  // The id comes from the browser, so treat it as untrusted: it must match a
  // configured host exactly.
  const hostId = formData.get("hostId");
  const host =
    typeof hostId === "string" && hostId.length <= 64 ? await getPublicHost(hostId) : null;
  if (!host) return { status: "error", message: UNKNOWN_HOST };

  try {
    await createGuestRequest({ ...parsed.data, invitedBy: host.id });
    return { status: "success" };
  } catch (error) {
    if (isGuestError(error, "DUPLICATE_NAME")) return { status: "duplicate" };
    if (isGuestError(error, "HOST_FULL")) return { status: "error", hostFull: true };
    if (isGuestError(error, "UNKNOWN_HOST")) return { status: "error", message: UNKNOWN_HOST };
    console.error("Invitation request failed", error);
    return { status: "error", message: GENERIC_ERROR };
  }
}
