import { z } from "zod";

import { SupportIssueType } from "@/types/support";

// Shared by the help form (instant feedback) and the server action (the check
// that actually counts). Safe to import from client components.

export const SUPPORT_NAME_MIN_LENGTH = 2;
export const SUPPORT_NAME_MAX_LENGTH = 80;
export const SUPPORT_EMAIL_MAX_LENGTH = 254;
export const SUPPORT_MESSAGE_MAX_LENGTH = 2000;

// Control characters (except tab and newline, which a message may contain),
// zero-width and bidi override characters used to disguise text.
const UNWANTED = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F​-‏‪-‮⁦-⁩﻿]/g;

/** Plain text only: composed form, no control characters, Unix line endings, no outer whitespace. */
function cleanText(value: string): string {
  return value.normalize("NFC").replace(/\r\n?/g, "\n").replace(UNWANTED, "").trim();
}

const name = z
  .string()
  .transform((value) => cleanText(value).replace(/\s+/g, " "))
  .pipe(
    z
      .string()
      .min(1, "Please enter your name.")
      .min(SUPPORT_NAME_MIN_LENGTH, "Please enter your name.")
      .max(SUPPORT_NAME_MAX_LENGTH, `Your name can be at most ${SUPPORT_NAME_MAX_LENGTH} characters.`),
  );

const email = z
  .string()
  .transform((value) => cleanText(value))
  .pipe(
    z
      .string()
      .min(1, "Please enter your email address.")
      .max(SUPPORT_EMAIL_MAX_LENGTH, "That email address is too long.")
      .pipe(z.email("Please enter a valid email address.")),
  );

const issueType = z.enum(SupportIssueType, { error: "Please choose what you need help with." });

const message = z
  .string()
  .transform((value) => cleanText(value))
  .pipe(
    z
      .string()
      .max(SUPPORT_MESSAGE_MAX_LENGTH, `Your message can be at most ${SUPPORT_MESSAGE_MAX_LENGTH} characters.`),
  );

export const supportRequestSchema = z
  .object({ name, email, issueType, message })
  .superRefine((value, context) => {
    // "Other" gives us nothing to go on without an explanation.
    if (value.issueType === SupportIssueType.OTHER && value.message === "") {
      context.addIssue({
        code: "custom",
        path: ["message"],
        message: "Please tell us a little about what you need.",
      });
    }
  });

export type SupportRequestInput = z.infer<typeof supportRequestSchema>;
export type SupportRequestField = keyof SupportRequestInput;
export type SupportRequestFieldErrors = Partial<Record<SupportRequestField, string>>;

export const SUPPORT_FIELDS: readonly SupportRequestField[] = ["name", "email", "issueType", "message"];

/** Validates raw form values; returns the cleaned input or the first message per field. */
export function parseSupportRequest(
  raw: Record<SupportRequestField, unknown>,
):
  | { success: true; data: SupportRequestInput }
  | { success: false; fieldErrors: SupportRequestFieldErrors } {
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  const result = supportRequestSchema.safeParse({
    name: text(raw.name),
    email: text(raw.email),
    issueType: text(raw.issueType),
    message: text(raw.message),
  });
  if (result.success) return { success: true, data: result.data };

  const fieldErrors: SupportRequestFieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as SupportRequestField;
    fieldErrors[field] ??= issue.message;
  }
  return { success: false, fieldErrors };
}
