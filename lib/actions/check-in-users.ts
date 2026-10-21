"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { requireAdmin } from "@/lib/admin-session";
import {
  CheckInUserError,
  createAdminUser,
  createCheckInUser,
  resetCheckInUserPassword,
  setCheckInUserDisabled,
} from "@/lib/check-in-users";
import { parseNewAccount, parsePassword, type AccountFieldErrors } from "@/lib/validation/account";

// Staff account management: check-in accounts, and creating admins. Server actions are public POST endpoints, so
// each one checks for a signed-in admin itself before anything else, and
// validates its input. A check-in account calling these is redirected by
// requireAdmin(), and Better Auth would refuse it anyway (lib/check-in-users.ts).

export type CheckInUserActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string; fieldErrors?: AccountFieldErrors };

const idSchema = z.string().min(1).max(64);
const NOT_FOUND = "That check-in account could not be found.";
const GENERIC_ERROR = "Something went wrong on our side. Please try again.";
const PAGE = "/admin/accounts";

async function settle(operation: () => Promise<string>): Promise<CheckInUserActionResult> {
  try {
    const message = await operation();
    revalidatePath(PAGE);
    return { ok: true, message };
  } catch (error) {
    revalidatePath(PAGE);
    if (error instanceof CheckInUserError) {
      return {
        ok: false,
        message: error.message,
        ...(error.code === "USERNAME_TAKEN" && { fieldErrors: { username: error.message } }),
      };
    }
    console.error("Check-in account action failed", error instanceof Error ? error.name : "unknown error");
    return { ok: false, message: GENERIC_ERROR };
  }
}

export async function createCheckInUserAction(input: { username: string; password: string }): Promise<CheckInUserActionResult> {
  await requireAdmin();

  const parsed = parseNewAccount({ username: input?.username, password: input?.password });
  if (!parsed.success) {
    return { ok: false, message: "Please check the highlighted fields.", fieldErrors: parsed.fieldErrors };
  }
  return settle(async () => {
    const user = await createCheckInUser(await headers(), parsed.data);
    return `Check-in account "${user.username}" was created. They can sign in now.`;
  });
}

/** Makes another admin. Only an admin can, and Better Auth checks that too. */
export async function createAdminUserAction(input: { username: string; password: string }): Promise<CheckInUserActionResult> {
  await requireAdmin();

  const parsed = parseNewAccount({ username: input?.username, password: input?.password });
  if (!parsed.success) {
    return { ok: false, message: "Please check the highlighted fields.", fieldErrors: parsed.fieldErrors };
  }
  return settle(async () => {
    const user = await createAdminUser(await headers(), parsed.data);
    return `Admin "${user.username}" was created. They can sign in now.`;
  });
}

export async function setCheckInUserDisabledAction(id: string, disabled: boolean): Promise<CheckInUserActionResult> {
  await requireAdmin();

  const userId = idSchema.safeParse(id);
  if (!userId.success || typeof disabled !== "boolean") return { ok: false, message: NOT_FOUND };
  return settle(async () => {
    const user = await setCheckInUserDisabled(await headers(), userId.data, disabled);
    return disabled
      ? `"${user.username}" is disabled and has been signed out everywhere.`
      : `"${user.username}" can sign in again.`;
  });
}

export async function resetCheckInUserPasswordAction(id: string, password: string): Promise<CheckInUserActionResult> {
  await requireAdmin();

  const userId = idSchema.safeParse(id);
  if (!userId.success) return { ok: false, message: NOT_FOUND };
  const parsed = parsePassword(password);
  if (!parsed.success) return { ok: false, message: parsed.error, fieldErrors: { password: parsed.error } };
  return settle(async () => {
    const user = await resetCheckInUserPassword(await headers(), userId.data, parsed.data);
    return `"${user.username}" has a new password and has been signed out everywhere.`;
  });
}
