// Expected failures from guest operations. Callers switch on `code` to show
// the right message; anything else (e.g. the database being unreachable) is
// an unexpected error and propagates unchanged.

export type GuestErrorCode =
  | "GUEST_NOT_FOUND"
  /** No host with that id exists. */
  | "UNKNOWN_HOST"
  /** The operation isn't allowed from the guest's current status. */
  | "INVALID_STATUS"
  /** The host has no approved-guest capacity left. */
  | "HOST_FULL"
  /** The requested (or every) table for the host is full. */
  | "TABLE_FULL"
  /** The table number isn't one of the guest's host's tables. */
  | "UNKNOWN_TABLE";

export class GuestError extends Error {
  name = "GuestError";

  constructor(
    readonly code: GuestErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export function isGuestError(error: unknown, code?: GuestErrorCode): error is GuestError {
  return error instanceof GuestError && (code === undefined || error.code === code);
}
