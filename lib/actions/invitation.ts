"use server";

import { redirect, RedirectType } from "next/navigation";

import { handleInvitationRequest } from "@/lib/invitation-request";
import type { InvitationRequestState } from "@/types/invitation";

export async function submitInvitationRequest(
  _previous: InvitationRequestState,
  formData: FormData,
): Promise<InvitationRequestState> {
  const outcome = await handleInvitationRequest(formData);
  if ("state" in outcome) return outcome.state;

  // A saved request replaces the form in the history so Back doesn't return to
  // it; a duplicate name keeps it, so Back lets the guest fix what they typed.
  const { hostId, page } = outcome.goto;
  redirect(`/invite/${hostId}/${page}`, page === "received" ? RedirectType.replace : RedirectType.push);
}
