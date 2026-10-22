"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { requireAdmin, requireSuperAdmin } from "@/lib/admin-session";
import { ROLE, type CreatableRole } from "@/lib/roles";
import {
  createStaffAccount,
  resetStaffAccountPassword,
  setStaffAccountDisabled,
  StaffAccountError,
} from "@/lib/staff-accounts";
import { parseNewAccount, parsePassword, type AccountFieldErrors } from "@/lib/validation/account";

// Staff account management. Server actions are public POST endpoints, so each
// one checks for a signed-in, active admin itself before anything else, and
// validates its input. A check-in account calling these is redirected by
// requireAdmin(), and Better Auth would refuse it anyway (lib/staff-accounts.ts).

export type StaffAccountActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string; fieldErrors?: AccountFieldErrors };

const idSchema = z.string().min(1).max(64);
const NOT_FOUND = "That account could not be found.";
const GENERIC_ERROR = "Something went wrong on our side. Please try again.";
const PAGE = "/admin/accounts";

const ROLE_NAME: Record<CreatableRole, string> = { [ROLE.ADMIN]: "Admin", [ROLE.CHECK_IN]: "Check-in account" };

async function settle(operation: () => Promise<string>): Promise<StaffAccountActionResult> {
  try {
    const message = await operation();
    revalidatePath(PAGE);
    return { ok: true, message };
  } catch (error) {
    revalidatePath(PAGE);
    if (error instanceof StaffAccountError) {
      return {
        ok: false,
        message: error.message,
        ...(error.code === "USERNAME_TAKEN" && { fieldErrors: { username: error.message } }),
      };
    }
    console.error("Staff account action failed", error instanceof Error ? error.name : "unknown error");
    return { ok: false, message: GENERIC_ERROR };
  }
}

async function create(role: CreatableRole, input: { username: string; password: string }): Promise<StaffAccountActionResult> {
  const parsed = parseNewAccount({ username: input?.username, password: input?.password });
  if (!parsed.success) {
    return { ok: false, message: "Please check the highlighted fields.", fieldErrors: parsed.fieldErrors };
  }
  return settle(async () => {
    const account = await createStaffAccount(await headers(), parsed.data, role);
    return `${ROLE_NAME[role]} "${account.username}" was created. They can sign in now.`;
  });
}

/** Makes a check-in account. */
export async function createCheckInUserAction(input: { username: string; password: string }): Promise<StaffAccountActionResult> {
  await requireAdmin();
  return create(ROLE.CHECK_IN, input);
}

/** Makes another admin. Only a super admin can (checked again in lib/staff-accounts.ts). */
export async function createAdminUserAction(input: { username: string; password: string }): Promise<StaffAccountActionResult> {
  await requireSuperAdmin();
  return create(ROLE.ADMIN, input);
}

/**
 * Disables or re-enables a staff account: a check-in account for any admin, an
 * admin only for a super admin, a super admin or your own account never.
 */
export async function setStaffAccountDisabledAction(id: string, disabled: boolean): Promise<StaffAccountActionResult> {
  await requireAdmin();

  const userId = idSchema.safeParse(id);
  if (!userId.success || typeof disabled !== "boolean") return { ok: false, message: NOT_FOUND };
  return settle(async () => {
    const account = await setStaffAccountDisabled(await headers(), userId.data, disabled);
    return disabled
      ? `"${account.username}" is disabled and has been signed out everywhere.`
      : `"${account.username}" can sign in again.`;
  });
}

/** Gives a staff account a new password, under the same rules as disabling. */
export async function resetStaffAccountPasswordAction(id: string, password: string): Promise<StaffAccountActionResult> {
  await requireAdmin();

  const userId = idSchema.safeParse(id);
  if (!userId.success) return { ok: false, message: NOT_FOUND };
  const parsed = parsePassword(password);
  if (!parsed.success) return { ok: false, message: parsed.error, fieldErrors: { password: parsed.error } };
  return settle(async () => {
    const account = await resetStaffAccountPassword(await headers(), userId.data, parsed.data);
    return `"${account.username}" has a new password and has been signed out everywhere.`;
  });
}
