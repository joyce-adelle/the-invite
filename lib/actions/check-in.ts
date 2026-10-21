"use server";

import type { CheckInActionResult } from "@/types/check-in";
import { checkInGuest } from "@/lib/data/check-in";
import { getAdminSession } from "@/lib/admin-session";
import { isCheckInToken } from "@/lib/check-in/check-in-path";
import { revalidatePath } from "next/cache";

/**
 * Lets the guest behind a QR code in. This is a public POST endpoint, so it
 * proves who is asking itself: a valid token alone authorizes nothing. The
 * admin recorded as having checked the guest in is the one in the verified
 * session, never anything the browser sends, and the guest's status and any
 * earlier check-in are decided by the database (lib/data/check-in.ts).
 */
export async function confirmCheckInAction(token: string): Promise<CheckInActionResult> {
  const session = await getAdminSession();
  if (!session) return { outcome: "unauthorized" };

  if (!isCheckInToken(token)) return { outcome: "not-found" };

  try {
    const result = await checkInGuest(token, session.user.id);
    // The dashboard's attendance numbers and list changed.
    if (result.outcome === "checked-in") revalidatePath("/admin");
    return result;
  } catch (error) {
    // Name only: a database error's message can quote the token it was given.
    console.error("Check-in failed", error instanceof Error ? error.name : "unknown error");
    return { outcome: "error", message: "We couldn't record the check-in. Nothing was saved, so please try again." };
  }
}
