"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AdminGuest } from "@/types/guest";
import type { TableOccupancy } from "@/types/hosts";

export function ChangeTableDialog({
  open,
  onOpenChange,
  guest,
  tables,
  busy,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  guest: AdminGuest;
  tables: TableOccupancy[];
  busy: boolean;
  onSubmit: (tableNumber: number) => void;
}) {
  const [selected, setSelected] = useState(String(guest.tableNumber ?? ""));
  const unchanged = selected === String(guest.tableNumber);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setSelected(String(guest.tableNumber ?? ""));
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Change table</DialogTitle>
          <DialogDescription>
            Move {guest.name} to another of {guest.hostName}&apos;s tables. They are sent a new
            access card for the new table.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor={`table-${guest.id}`}>Table</Label>
          <Select value={selected} onValueChange={setSelected} disabled={busy}>
            <SelectTrigger id={`table-${guest.id}`} className="w-full">
              <SelectValue placeholder="Choose a table" />
            </SelectTrigger>
            <SelectContent>
              {tables.map((table) => {
                const current = table.number === guest.tableNumber;
                const physical = table.cardType === "PHYSICAL";
                const detail = current
                  ? "current"
                  : physical
                    ? "physical cards"
                    : table.remaining === 0
                      ? "full"
                      : `${table.remaining} free`;
                return (
                  <SelectItem
                    key={table.number}
                    value={String(table.number)}
                    disabled={table.remaining === 0 && !current}
                  >
                    Table {table.number} · {physical ? `${table.capacity} seats` : `${table.occupied}/${table.capacity} seated`} · {detail}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            onClick={() => onSubmit(Number(selected))}
            disabled={busy || unchanged || !selected}
          >
            {busy && <Loader2 className="animate-spin" aria-hidden />}
            Move guest
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
