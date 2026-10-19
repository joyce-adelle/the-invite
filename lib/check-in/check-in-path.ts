// The shape of a check-in token and the page it opens. No secrets and no Node
// APIs here, so the check-in page's browser code can use it; making and
// reading tokens is in lib/check-in.ts (server only).

export const CHECK_IN_TOKEN_PATTERN = /^[A-Za-z0-9_-]{24}$/;

/** Anything that isn't shaped like a token can be turned away without a database lookup. */
export function isCheckInToken(value: unknown): value is string {
  return typeof value === "string" && CHECK_IN_TOKEN_PATTERN.test(value);
}

export function checkInPath(token: string): string {
  return `/check-in/${token}`;
}

/**
 * Where sign-in may send an admin back to (?next=…): only a check-in address,
 * exactly as this app makes them. Anything else, such as another site or
 * another page, is ignored, so the login page can't be used as an open redirect.
 */
export function safeReturnPath(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/check-in/")) return null;
  return isCheckInToken(value.slice("/check-in/".length)) ? value : null;
}
