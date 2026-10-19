import "server-only";

import QRCode from "qrcode";
import { checkInPath } from "@/lib/check-in/check-in-path";
import { randomBytes } from "node:crypto";

export {
  CHECK_IN_TOKEN_PATTERN,
  checkInPath,
  isCheckInToken,
  safeReturnPath,
} from "@/lib/check-in/check-in-path";

// Making the check-in token and the QR code that carries it. (Recognizing a
// token and its page address are in lib/check-in-path.ts, which browser code may use.) The token is a secret in
// its own right: random, unrelated to the guest's name, email, id or place in
// any sequence, and the same for the life of the invitation.

/** 18 random bytes = 144 bits, written as 24 URL-safe characters. */
const TOKEN_BYTES = 18;

export function generateCheckInToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/**
 * The address the QR code opens: the app's public origin (BETTER_AUTH_URL, the
 * same setting the sign-in cookies use) plus the check-in path. Throws when it
 * isn't set, so a card is never made with a QR code that goes nowhere.
 */
export function checkInUrl(token: string): string {
  const base = process.env.BETTER_AUTH_URL?.trim();
  if (!base)
    throw new Error(
      "BETTER_AUTH_URL is not set, so the check-in QR code can't be made.",
    );
  let origin: URL;
  try {
    origin = new URL(base);
  } catch {
    throw new Error(
      "BETTER_AUTH_URL is not a valid URL, so the check-in QR code can't be made.",
    );
  }
  if (origin.protocol !== "https:" && origin.protocol !== "http:") {
    throw new Error(
      "BETTER_AUTH_URL must be an http(s) address, so the check-in QR code can't be made.",
    );
  }
  return new URL(checkInPath(token), origin).toString();
}

/** Pixels per QR module: large enough that the picture stays sharp when it is scaled up in a PDF. */
const MODULE_PIXELS = 12;

/** Modules of white around the code. Four is what the QR standard asks for. */
const QUIET_ZONE_MODULES = 4;

/**
 * The QR code for a URL as a black-on-white PNG with its quiet zone included.
 * Error correction M survives a scuffed print or a phone screen at an angle.
 * The same URL always gives the same bytes, so the card and the email carry
 * identical pictures.
 */
export async function createCheckInQr(url: string): Promise<Buffer> {
  return QRCode.toBuffer(url, {
    type: "png",
    errorCorrectionLevel: "M",
    margin: QUIET_ZONE_MODULES,
    scale: MODULE_PIXELS,
    color: { dark: "#000000", light: "#ffffff" },
  });
}
