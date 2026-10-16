import type { InvitationSupportRequest } from "@/lib/generated/prisma/browser";
import type { SupportRequestFieldErrors } from "@/lib/validation/support";

export type SupportRequest = InvitationSupportRequest;
export { SupportIssueType, SupportRequestStatus } from "@/lib/generated/prisma/enums";

export type SupportRequestState =
  | { status: "idle" }
  | { status: "success" }
  | {
      status: "error";
      /** The request couldn't be saved; the form stays filled in so the guest can retry. */
      message?: string;
      fieldErrors?: SupportRequestFieldErrors;
    };
