import { normalizeEmail } from "@/lib/guest";

export { cn } from "cn";

/** Whether the email is in ADMIN_EMAILS (comma-separated). */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const admins = (process.env.ADMIN_EMAILS ?? "").split(",").map(normalizeEmail);
  return admins.includes(normalizeEmail(email));
}
