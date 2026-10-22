"use client";

import { useState, useTransition } from "react";
import { Loader2, Table2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { setTableCardTypeAction } from "@/lib/actions/admin";
import type { TableOccupancy } from "@/types/hosts";

function isRedirectError(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

/**
 * A host's tables, each physical (printed cards, seats counted as taken) or
 * digital (seats for approved online requests), with a switch between the two.
 * The server refuses to make a table physical while guests are seated there.
 */
export function HostTablesDialog({ hostName, tables }: { hostName: string; tables: TableOccupancy[] }) {
  const [open, setOpen] = useState(false);
  const [busyTable, setBusyTable] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  function switchTo(table: TableOccupancy) {
    const next = table.cardType === "PHYSICAL" ? "DIGITAL" : "PHYSICAL";
    setBusyTable(table.number);
    startTransition(async () => {
      try {
        const result = await setTableCardTypeAction(table.number, next);
        if (result.ok) toast.success(result.message);
        else toast.error(result.message, { duration: 8000 });
      } catch (error) {
        if (!isRedirectError(error)) {
          toast.error("We couldn't reach the server. Check your connection and try again.", { duration: 8000 });
        }
      } finally {
        setBusyTable(null);
      }
    });
  }

  return (
    <>
      <Button variant="ghost" size="sm" className="-ml-2 h-7 px-2 text-xs" onClick={() => setOpen(true)}>
        <Table2 aria-hidden /> Tables
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tables for {hostName}</DialogTitle>
            <DialogDescription>
              Physical tables use printed cards, so their seats count as taken and no online request is
              seated there. Make a table digital to give its seats to approved requests.
            </DialogDescription>
          </DialogHeader>
          {tables.length === 0 ? (
            <p className="text-sm text-muted-foreground">This host has no tables.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {tables.map((table) => {
                const physical = table.cardType === "PHYSICAL";
                const busy = pending && busyTable === table.number;
                return (
                  <li key={table.number} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="font-medium tabular-nums">Table {table.number}</span>
                      <Badge variant={physical ? "outline" : "secondary"}>{physical ? "Physical" : "Digital"}</Badge>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {physical ? `${table.capacity} seats` : `${table.occupied}/${table.capacity} seated`}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => switchTo(table)}
                        disabled={pending}
                        aria-label={`Make table ${table.number} ${physical ? "digital" : "physical"}`}
                      >
                        {busy && <Loader2 className="animate-spin" aria-hidden />}
                        Make {physical ? "digital" : "physical"}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
