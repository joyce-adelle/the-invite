"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireSuperAdmin } from "@/lib/admin-session";
import {
  assignTable,
  createHost,
  deleteHost,
  HostAdminError,
  renameHost,
  setHostAcceptingRequests,
  updateEventSettings,
} from "@/lib/data/host-admin";
import { isGuestError } from "@/lib/data/errors";
import { setTableCardType } from "@/lib/data/guests";
import { AccessCardType } from "@/lib/generated/prisma/enums";

// Host and table management (/admin/hosts), for super admins only. Server
// actions are public POST endpoints, so each one checks for a signed-in, active
// super admin itself before
// anything else, and validates its input. The rules live in
// lib/data/host-admin.ts.

export type HostActionResult =
  | { ok: true; message: string; hostId?: string }
  | { ok: false; message: string };

const hostIdSchema = z.string().min(1).max(64);
const tableSchema = z.number().int().positive();
const GENERIC_ERROR = "Something went wrong on our side. Please try again.";

async function settle(operation: () => Promise<{ message: string; hostId?: string }>): Promise<HostActionResult> {
  try {
    const result = await operation();
    // The dashboard's capacity cards, the public page and every host page can change.
    revalidatePath("/admin", "layout");
    revalidatePath("/");
    return { ok: true, ...result };
  } catch (error) {
    revalidatePath("/admin", "layout");
    if (error instanceof HostAdminError || isGuestError(error)) return { ok: false, message: error.message };
    console.error("Host action failed", error instanceof Error ? error.name : "unknown error");
    return { ok: false, message: GENERIC_ERROR };
  }
}

export async function createHostAction(name: string): Promise<HostActionResult> {
  await requireSuperAdmin();
  return settle(async () => {
    const host = await createHost(name);
    return { message: `${host.name} was added. Give it some tables to seat its guests.`, hostId: host.id };
  });
}

export async function renameHostAction(id: string, name: string): Promise<HostActionResult> {
  await requireSuperAdmin();
  const hostId = hostIdSchema.safeParse(id);
  if (!hostId.success) return { ok: false, message: "That host could not be found." };
  return settle(async () => {
    const host = await renameHost(hostId.data, name);
    return {
      message: host.changed ? `Renamed to ${host.name}. Cards made from now on show the new name.` : "The name is unchanged.",
    };
  });
}

export async function setHostAcceptingRequestsAction(id: string, accepting: boolean): Promise<HostActionResult> {
  await requireSuperAdmin();
  const hostId = hostIdSchema.safeParse(id);
  if (!hostId.success || typeof accepting !== "boolean") return { ok: false, message: "That host could not be found." };
  return settle(async () => {
    const { name } = await setHostAcceptingRequests(hostId.data, accepting);
    return {
      message: accepting
        ? `${name} is on the public page and taking requests again.`
        : `${name} is hidden from the public page. Its guests and tables are kept.`,
    };
  });
}

export async function deleteHostAction(id: string): Promise<HostActionResult> {
  await requireSuperAdmin();
  const hostId = hostIdSchema.safeParse(id);
  if (!hostId.success) return { ok: false, message: "That host could not be found." };
  return settle(async () => {
    const { name } = await deleteHost(hostId.data);
    return { message: `${name} was deleted.` };
  });
}

/** Gives a table to a host, or with null, to nobody. */
export async function assignTableAction(tableNumber: number, hostId: string | null): Promise<HostActionResult> {
  await requireSuperAdmin();
  const table = tableSchema.safeParse(tableNumber);
  const host = hostId === null ? { success: true as const, data: null } : hostIdSchema.safeParse(hostId);
  if (!table.success || !host.success) return { ok: false, message: "Choose a valid table and host." };
  return settle(async () => {
    const { to, changed } = await assignTable(table.data, host.data);
    if (!changed) return { message: `Table ${table.data} is already there.` };
    return { message: to ? `Table ${table.data} now belongs to ${to}.` : `Table ${table.data} is now unassigned.` };
  });
}

export async function setTableTypeAction(tableNumber: number, cardType: string): Promise<HostActionResult> {
  await requireSuperAdmin();
  const table = tableSchema.safeParse(tableNumber);
  const type = z.enum(AccessCardType).safeParse(cardType);
  if (!table.success || !type.success) return { ok: false, message: "Choose a valid table and card type." };
  return settle(async () => {
    const { changed } = await setTableCardType(table.data, type.data);
    const kind = type.data === AccessCardType.PHYSICAL ? "physical" : "digital";
    return { message: changed ? `Table ${table.data} now uses ${kind} cards.` : `Table ${table.data} already uses ${kind} cards.` };
  });
}

export async function updateEventSettingsAction(input: { maxTables: number; seatsPerTable: number }): Promise<HostActionResult> {
  await requireSuperAdmin();
  return settle(async () => {
    const settings = await updateEventSettings({ maxTables: input?.maxTables, seatsPerTable: input?.seatsPerTable });
    return { message: `There are now ${settings.maxTables} tables of ${settings.seatsPerTable} seats.` };
  });
}
