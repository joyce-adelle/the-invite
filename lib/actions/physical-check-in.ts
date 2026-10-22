"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getCheckInSession } from "@/lib/admin-session";
import {
  lookupPhysicalTable,
  recordPhysicalArrivals,
  undoPhysicalArrival,
  type LookupResult,
  type RecordResult,
  type UndoResult,
} from "@/lib/data/physical-check-in";

// Counting in guests with printed cards. Public POST endpoints, so each checks
// for an active admin or check-in account itself before anything else; the
// person recorded is the one in that verified session, never the browser's say.

type Failure = { outcome: "unauthorized" } | { outcome: "invalid"; message: string } | { outcome: "error"; message: string };

const hostIdSchema = z.string().min(1).max(64);
const tableSchema = z.number().int().positive().max(100_000);
const countSchema = z.number().int().min(1).max(100);
const GENERIC_ERROR = "We couldn't record that. Nothing was saved, so please try again.";

async function guarded<T>(operation: (userId: string) => Promise<T>): Promise<T | Failure> {
  const session = await getCheckInSession();
  if (!session) return { outcome: "unauthorized" };
  try {
    return await operation(session.user.id);
  } catch (error) {
    console.error("Physical check-in failed", error instanceof Error ? error.name : "unknown error");
    return { outcome: "error", message: GENERIC_ERROR };
  }
}

/** Is this table the host's, and does it use printed cards? Shows its count so far. */
export async function lookupPhysicalTableAction(hostId: string, tableNumber: number): Promise<LookupResult | Failure> {
  const session = await getCheckInSession();
  if (!session) return { outcome: "unauthorized" };
  const host = hostIdSchema.safeParse(hostId);
  const table = tableSchema.safeParse(tableNumber);
  if (!host.success || !table.success) return { outcome: "invalid", message: "Choose the host and enter the table number on the card." };
  return guarded(() => lookupPhysicalTable(host.data, table.data));
}

/** Records that `count` more printed-card guests arrived for this table. */
export async function recordPhysicalArrivalsAction(
  hostId: string,
  tableNumber: number,
  count: number,
): Promise<RecordResult | Failure> {
  const session = await getCheckInSession();
  if (!session) return { outcome: "unauthorized" };
  const host = hostIdSchema.safeParse(hostId);
  const table = tableSchema.safeParse(tableNumber);
  const many = countSchema.safeParse(count);
  if (!host.success || !table.success || !many.success) {
    return { outcome: "invalid", message: "Enter how many guests arrived, at least 1." };
  }
  return guarded(async (userId) => {
    const result = await recordPhysicalArrivals(host.data, table.data, many.data, userId);
    if (result.outcome === "recorded") revalidatePath("/check-in/progress");
    return result;
  });
}

/** Undoes one entry that was a mistake. */
export async function undoPhysicalArrivalAction(id: string): Promise<UndoResult | Failure> {
  const session = await getCheckInSession();
  if (!session) return { outcome: "unauthorized" };
  const entry = z.uuid().safeParse(id);
  if (!entry.success) return { outcome: "not-found" };
  return guarded(async (userId) => {
    const result = await undoPhysicalArrival(entry.data, userId);
    if (result.outcome === "undone") revalidatePath("/check-in/progress");
    return result;
  });
}
