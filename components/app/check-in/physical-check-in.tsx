"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { BadgeCheck, Loader2, Minus, Plus, ShieldAlert, Undo2 } from "lucide-react";

import { formatDateTime } from "@/components/app/admin/date-cell";
import Field from "@/components/common/field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  lookupPhysicalTableAction,
  recordPhysicalArrivalsAction,
  undoPhysicalArrivalAction,
} from "@/lib/actions/physical-check-in";
import type { PhysicalTableView } from "@/lib/data/physical-check-in";
import { cn } from "@/lib/utils";

type Notice = { tone: "success" | "error"; text: string; signIn?: boolean };

function isRedirectError(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

const OFFLINE = "We couldn't reach the server, so nothing was recorded. Check your connection and try again.";

/** Explains a result that isn't a table to count, in words for the door. */
function problemText(result: { outcome: string } & Record<string, unknown>): Notice {
  switch (result.outcome) {
    case "not-found":
      return { tone: "error", text: `There is no table ${result.tableNumber}. Check the number on the card.` };
    case "wrong-host":
      return {
        tone: "error",
        text: result.actualHostName
          ? `Table ${result.tableNumber} belongs to ${result.actualHostName}, not ${result.hostName}. Check the card, and ask an administrator if it looks wrong.`
          : `Table ${result.tableNumber} isn't given to any host. Check the card with an administrator.`,
      };
    case "digital":
      return {
        tone: "error",
        text: `Table ${result.tableNumber} uses QR cards. Scan the guest's QR code instead (Scan QR).`,
      };
    case "unauthorized":
      return { tone: "error", text: "Your session has expired. Sign in again to continue.", signIn: true };
    case "invalid":
    case "error":
      return { tone: "error", text: String(result.message) };
    default:
      return { tone: "error", text: "Something went wrong. Please try again." };
  }
}

/**
 * Counting in guests with printed cards: choose the host on the card ("Guest
 * Type"), type its table number, then record how many arrived. Everything shown
 * comes from the server's answer.
 */
export function PhysicalCheckIn({ hosts }: { hosts: { id: string; name: string }[] }) {
  const [hostId, setHostId] = useState("");
  const [tableInput, setTableInput] = useState("");
  const [table, setTable] = useState<PhysicalTableView | null>(null);
  const [count, setCount] = useState(1);
  const [notice, setNotice] = useState<Notice>();
  const [pending, startTransition] = useTransition();

  const remaining = table ? table.capacity - table.arrived : 0;

  function call<T extends { outcome: string }>(action: () => Promise<T>, handle: (result: T) => void) {
    setNotice(undefined);
    startTransition(async () => {
      try {
        handle(await action());
      } catch (error) {
        if (!isRedirectError(error)) setNotice({ tone: "error", text: OFFLINE });
      }
    });
  }

  function find(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const number = Number(tableInput);
    if (!hostId || !Number.isInteger(number) || number < 1) {
      setNotice({ tone: "error", text: "Choose the host on the card and enter its table number." });
      return;
    }
    call(
      () => lookupPhysicalTableAction(hostId, number),
      (result) => {
        if (result.outcome === "ok") {
          setTable(result.table);
          setCount(1);
        } else {
          setTable(null);
          setNotice(problemText(result));
        }
      },
    );
  }

  function record() {
    if (!table) return;
    call(
      () => recordPhysicalArrivalsAction(table.hostId, table.tableNumber, count),
      (result) => {
        if (result.outcome === "recorded") {
          setTable(result.table);
          setCount(1);
          setNotice({
            tone: "success",
            text: `${result.added} arrival${result.added === 1 ? "" : "s"} recorded for table ${result.table.tableNumber}.`,
          });
        } else if (result.outcome === "too-many") {
          setTable(result.table);
          setCount(Math.max(1, Math.min(count, result.remaining)));
          setNotice({
            tone: "error",
            text:
              result.remaining === 0
                ? `Table ${result.table.tableNumber} is already full: all ${result.table.capacity} have arrived. Nothing was recorded.`
                : `Only ${result.remaining} more can arrive for table ${result.table.tableNumber}. Nothing was recorded.`,
          });
        } else {
          setNotice(problemText(result));
        }
      },
    );
  }

  function undo(id: string) {
    call(
      () => undoPhysicalArrivalAction(id),
      (result) => {
        if (result.outcome === "undone") {
          setTable(result.table);
          setNotice({ tone: "success", text: "That entry was undone." });
        } else if (result.outcome === "already-undone") {
          setTable(result.table);
          setNotice({ tone: "error", text: "Someone already undid that entry." });
        } else {
          setNotice(problemText(result));
        }
      },
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gold/30 border-t-gold bg-card/90 p-6 shadow-md backdrop-blur-sm sm:p-8">
        <h1 className="font-display text-3xl font-medium text-primary">Printed cards</h1>
        <p className="mt-2 text-sm text-pretty text-muted-foreground">
          Read the <span className="font-medium text-foreground">Guest Type</span> and{" "}
          <span className="font-medium text-foreground">Table No.</span> on the card.
        </p>

        <form onSubmit={find} noValidate className="mt-6 grid gap-4 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="card-host">Guest Type</Label>
            <Select
              value={hostId}
              onValueChange={(next) => {
                setHostId(next);
                setTable(null);
              }}
              disabled={pending}
            >
              <SelectTrigger id="card-host" className="w-full">
                <SelectValue placeholder="Choose the host" />
              </SelectTrigger>
              <SelectContent>
                {hosts.map((host) => (
                  <SelectItem key={host.id} value={host.id}>
                    {host.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Field
            id="card-table"
            label="Table No."
            input={
              <Input
                id="card-table"
                inputMode="numeric"
                pattern="[0-9]*"
                value={tableInput}
                onChange={(event) => {
                  setTableInput(event.target.value.replace(/\D/g, "").slice(0, 5));
                  setTable(null);
                }}
                disabled={pending}
              />
            }
          />
          <Button type="submit" disabled={pending}>
            {pending && !table && <Loader2 className="animate-spin" aria-hidden />}
            Check card
          </Button>
        </form>

        {hosts.length === 0 && (
          <p className="mt-4 text-sm text-muted-foreground">No host has printed-card tables.</p>
        )}
      </div>

      <div aria-live="polite">
        {notice && (
          <div
            role={notice.tone === "error" ? "alert" : "status"}
            className={cn(
              "flex gap-3 rounded-xl border p-4 text-sm",
              notice.tone === "success"
                ? "border-success/30 bg-success/10 text-success"
                : "border-destructive/30 bg-destructive/10 text-destructive",
            )}
          >
            {notice.tone === "success" ? (
              <BadgeCheck className="mt-0.5 size-5 shrink-0" aria-hidden />
            ) : (
              <ShieldAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
            )}
            <p>
              {notice.text}
              {notice.signIn && (
                <>
                  {" "}
                  <Link
                    href={`/admin/login?next=${encodeURIComponent("/check-in")}`}
                    className="font-medium underline underline-offset-4"
                  >
                    Sign in
                  </Link>
                </>
              )}
            </p>
          </div>
        )}
      </div>

      {table && (
        <div className="rounded-2xl border bg-card/90 p-6 shadow-sm backdrop-blur-sm sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{table.hostName}</p>
              <h2 className="mt-1 text-2xl font-semibold">Table {table.tableNumber}</h2>
            </div>
            {remaining === 0 ? <Badge variant="success">All arrived</Badge> : <Badge variant="outline">Printed cards</Badge>}
          </div>

          <div className="mt-5">
            <div className="flex items-baseline justify-between text-sm">
              <span>
                <strong className="text-2xl font-semibold tabular-nums">{table.arrived}</strong>
                <span className="text-muted-foreground"> of {table.capacity} arrived</span>
              </span>
              <span className="text-muted-foreground tabular-nums">{remaining} to come</span>
            </div>
            <div
              role="progressbar"
              aria-label={`Table ${table.tableNumber} arrivals`}
              aria-valuemin={0}
              aria-valuemax={table.capacity}
              aria-valuenow={table.arrived}
              className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
            >
              <div className="h-full rounded-full bg-success" style={{ width: `${(table.arrived / table.capacity) * 100}%` }} />
            </div>
          </div>

          {remaining > 0 && (
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium">Arriving now</span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setCount((c) => Math.max(1, c - 1))}
                  disabled={pending || count <= 1}
                  aria-label="One fewer"
                >
                  <Minus aria-hidden />
                </Button>
                <span className="w-8 text-center text-xl font-semibold tabular-nums" aria-live="polite">
                  {count}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setCount((c) => Math.min(remaining, c + 1))}
                  disabled={pending || count >= remaining}
                  aria-label="One more"
                >
                  <Plus aria-hidden />
                </Button>
              </div>
              <Button onClick={record} disabled={pending} className="ml-auto">
                {pending && <Loader2 className="animate-spin" aria-hidden />}
                Record {count} arrival{count === 1 ? "" : "s"}
              </Button>
            </div>
          )}

          {table.entries.length > 0 && (
            <div className="mt-8">
              <h3 className="text-sm font-medium">Entries for this table</h3>
              <ul className="mt-2 divide-y rounded-lg border text-sm">
                {table.entries.map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className={cn(entry.undoneAt && "text-muted-foreground line-through")}>
                      <strong className="tabular-nums">+{entry.count}</strong> · {formatDateTime(entry.recordedAt)} ·{" "}
                      {entry.recordedBy}
                    </span>
                    {entry.undoneAt ? (
                      <span className="text-xs text-muted-foreground">Undone by {entry.undoneBy}</span>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => undo(entry.id)}
                        disabled={pending}
                        aria-label={`Undo ${entry.count} arrival${entry.count === 1 ? "" : "s"} at ${formatDateTime(entry.recordedAt)}`}
                      >
                        <Undo2 aria-hidden /> Undo
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
