// Guest model shared by server code and UI. Safe to import from client
// components: the type import is erased and the enums are plain objects, so
// no Prisma runtime code reaches the browser.

export type { Guest } from "@/lib/generated/prisma/browser";
export { CardStatus, GuestStatus } from "@/lib/generated/prisma/enums";

/** The form every email is stored and compared in. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
