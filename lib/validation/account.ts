import { z } from "zod";

// Rules for usernames and passwords, for every account: shared by the check-in
// account forms (instant feedback), their server actions (the check that
// counts), the seed's admin account (lib/admin-account.ts) and Better Auth's
// own minimum (lib/auth.ts). Safe to import from client components.

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;
/** Better Auth's username plugin rules: letters, numbers, underscores and dots. Not case sensitive. */
export const USERNAME_PATTERN = /^[a-zA-Z0-9_.]+$/;

export const MIN_PASSWORD_LENGTH = 8;
/** Better Auth's own maximum. */
export const MAX_PASSWORD_LENGTH = 128;

export const usernameSchema = z
  .string()
  .trim()
  .min(1, "Enter a username.")
  .min(USERNAME_MIN_LENGTH, `A username needs at least ${USERNAME_MIN_LENGTH} characters.`)
  .max(USERNAME_MAX_LENGTH, `A username can be at most ${USERNAME_MAX_LENGTH} characters.`)
  .regex(USERNAME_PATTERN, "Use only letters, numbers, underscores (_) and dots (.).");

export const passwordSchema = z
  .string()
  .min(1, "Enter a password.")
  .min(MIN_PASSWORD_LENGTH, `A password needs at least ${MIN_PASSWORD_LENGTH} characters.`)
  .max(MAX_PASSWORD_LENGTH, `A password can be at most ${MAX_PASSWORD_LENGTH} characters.`);

export const newAccountSchema = z.object({ username: usernameSchema, password: passwordSchema });

export type NewAccountInput = z.infer<typeof newAccountSchema>;
export type AccountField = keyof NewAccountInput;
export type AccountFieldErrors = Partial<Record<AccountField, string>>;

/** Validates raw values; returns the cleaned input or the first message per field. */
export function parseNewAccount(raw: { username: unknown; password: unknown }):
  | { success: true; data: NewAccountInput }
  | { success: false; fieldErrors: AccountFieldErrors } {
  const result = newAccountSchema.safeParse({
    username: typeof raw.username === "string" ? raw.username : "",
    password: typeof raw.password === "string" ? raw.password : "",
  });
  if (result.success) return { success: true, data: result.data };
  const fieldErrors: AccountFieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as AccountField;
    fieldErrors[field] ??= issue.message;
  }
  return { success: false, fieldErrors };
}

/** Just a new password, for a reset. */
export function parsePassword(raw: unknown): { success: true; data: string } | { success: false; error: string } {
  const result = passwordSchema.safeParse(typeof raw === "string" ? raw : "");
  return result.success ? { success: true, data: result.data } : { success: false, error: result.error.issues[0].message };
}
