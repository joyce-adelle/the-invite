"use client";

import { useState } from "react";
import { Loader2, Settings2 } from "lucide-react";

import { useHostAction } from "@/components/app/admin/hosts/use-host-action";
import Field from "@/components/common/field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { updateEventSettingsAction } from "@/lib/actions/hosts";

/** Edits how many tables the event has and how many seats each has. */
export function TableSettingsButton({ maxTables, seatsPerTable }: { maxTables: number; seatsPerTable: number }) {
  const [open, setOpen] = useState(false);
  const { pending, run } = useHostAction();
  const [values, setValues] = useState({ maxTables: String(maxTables), seatsPerTable: String(seatsPerTable) });

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          setValues({ maxTables: String(maxTables), seatsPerTable: String(seatsPerTable) });
          setOpen(true);
        }}
      >
        <Settings2 aria-hidden /> Table settings
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Table settings</DialogTitle>
            <DialogDescription>
              Tables are numbered from 1. New tables start unassigned and digital. You can only lower the
              number once the tables above it are unassigned and unused, and only lower the seats while no
              table has more approved guests than that. Every host&apos;s guest count follows its tables.
            </DialogDescription>
          </DialogHeader>
          <form
            noValidate
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              run(
                () =>
                  updateEventSettingsAction({
                    maxTables: Number(values.maxTables),
                    seatsPerTable: Number(values.seatsPerTable),
                  }),
                () => setOpen(false),
              );
            }}
          >
            <div className="grid grid-cols-2 gap-4">
              <Field
                id="max-tables"
                label="Number of tables"
                input={
                  <Input
                    id="max-tables"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={500}
                    value={values.maxTables}
                    onChange={(event) => setValues((v) => ({ ...v, maxTables: event.target.value }))}
                    disabled={pending}
                  />
                }
              />
              <Field
                id="seats-per-table"
                label="Seats per table"
                input={
                  <Input
                    id="seats-per-table"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={50}
                    value={values.seatsPerTable}
                    onChange={(event) => setValues((v) => ({ ...v, seatsPerTable: event.target.value }))}
                    disabled={pending}
                  />
                }
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="animate-spin" aria-hidden />}
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
