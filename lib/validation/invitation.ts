import { z } from "zod";

// Shared by the request form (instant feedback) and the server action
// (the check that actually counts). Safe to import from client components.

export const NAME_MIN_LENGTH = 2;
export const NAME_MAX_LENGTH = 80;
// RFC 5321 limit for an address.
export const EMAIL_MAX_LENGTH = 254;

// Letters in any script, plus the punctuation real names use.
const NAME_PATTERN = /^\p{L}[\p{L}\p{M} '’.-]*$/u;

export const invitationRequestSchema = z.object({
  name: z
    .string()
    .min(1, "Please enter your full name.")
    .min(NAME_MIN_LENGTH, "Please enter your full name.")
    .max(NAME_MAX_LENGTH, `Your name can be at most ${NAME_MAX_LENGTH} characters.`)
    .regex(NAME_PATTERN, "Please use letters, spaces, hyphens, apostrophes or full stops only."),
  email: z.email("Please enter a valid email address.")
    .min(1, "Please enter your email address.")
    .max(EMAIL_MAX_LENGTH, "That email address is too long."),
});

export type InvitationRequestInput = z.infer<typeof invitationRequestSchema>;
export type InvitationRequestField = keyof InvitationRequestInput;
export type InvitationRequestFieldErrors = Partial<Record<InvitationRequestField, string>>;

/** Validates raw form values; returns the cleaned input or the first message per field. */
export function parseInvitationRequest(
  raw: Record<InvitationRequestField, unknown>,
):
  | { success: true; data: InvitationRequestInput }
  | { success: false; fieldErrors: InvitationRequestFieldErrors } {
  const result = invitationRequestSchema.safeParse({
    name: typeof raw.name === "string" ? raw.name : "",
    email: typeof raw.email === "string" ? raw.email : "",
  });
  if (result.success) return { success: true, data: result.data };

  const fieldErrors: InvitationRequestFieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as InvitationRequestField;
    fieldErrors[field] ??= issue.message;
  }
  return { success: false, fieldErrors };
}
