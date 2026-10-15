"use server";

import { createSupportRequest } from "@/lib/data/support";
import { parseSupportRequest } from "@/lib/validation/support";
import type { SupportRequestState } from "@/types/support";

const SAVE_FAILED = "We couldn't send your message. Please try again.";

/**
 * Public: no session, so everything is validated here. The response never
 * depends on whether the name or email belongs to a guest, and database
 * errors are logged, never shown.
 */
export async function submitSupportRequest(
  _previous: SupportRequestState,
  formData: FormData,
): Promise<SupportRequestState> {
  const parsed = parseSupportRequest({
    name: formData.get("name"),
    email: formData.get("email"),
    issueType: formData.get("issueType"),
    message: formData.get("message"),
  });
  if (!parsed.success) return { status: "error", fieldErrors: parsed.fieldErrors };

  try {
    await createSupportRequest(parsed.data);
    return { status: "success" };
  } catch (error) {
    console.error("Support request failed", error);
    return { status: "error", message: SAVE_FAILED };
  }
}
