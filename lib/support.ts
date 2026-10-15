import { SupportIssueType } from "@/types/support";

// Wording for the help form and the admin views. Safe to import anywhere.

/** In the order shown in the form's select. `form` is what the guest sees; `short` suits badges. */
export const SUPPORT_ISSUES: readonly { value: SupportIssueType; form: string; short: string }[] = [
  {
    value: SupportIssueType.CARD_NOT_RECEIVED,
    form: "I registered but haven't received my access card.",
    short: "Card not received",
  },
  {
    value: SupportIssueType.UNABLE_TO_REGISTER,
    form: "I'm unable to register.",
    short: "Unable to register",
  },
  {
    value: SupportIssueType.DETAILS_INCORRECT,
    form: "My registration details may be incorrect.",
    short: "Details incorrect",
  },
  { value: SupportIssueType.OTHER, form: "Other.", short: "Other" },
];

export const SUPPORT_ISSUE_SHORT_LABELS = Object.fromEntries(
  SUPPORT_ISSUES.map((issue) => [issue.value, issue.short]),
) as Record<SupportIssueType, string>;
