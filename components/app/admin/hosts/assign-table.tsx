"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { useHostAction } from "@/components/app/admin/hosts/use-host-action";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { assignTableAction } from "@/lib/actions/hosts";

const NOBODY = "__none__";

/** Gives one table to a host chosen from a list (or, with `allowNone`, to nobody). */
export function AssignTableToHost({
  tableNumber,
  hosts,
  currentHostId,
  allowNone = false,
  label = "Give to",
}: {
  tableNumber: number;
  hosts: { id: string; name: string }[];
  currentHostId?: string | null;
  allowNone?: boolean;
  label?: string;
}) {
  const [choice, setChoice] = useState<string>("");
  const { pending, run } = useHostAction();
  const options = hosts.filter((h) => h.id !== currentHostId);

  return (
    <div className="flex items-center justify-end gap-2">
      <Select value={choice} onValueChange={setChoice} disabled={pending}>
        <SelectTrigger size="sm" className="w-44" aria-label={`${label}: table ${tableNumber}`}>
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent>
          {allowNone && <SelectItem value={NOBODY}>Unassigned (give it up)</SelectItem>}
          {options.map((host) => (
            <SelectItem key={host.id} value={host.id}>
              {host.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        variant="outline"
        disabled={!choice || pending}
        onClick={() =>
          run(
            () => assignTableAction(tableNumber, choice === NOBODY ? null : choice),
            () => setChoice(""),
          )
        }
      >
        {pending && <Loader2 className="animate-spin" aria-hidden />}
        Move
      </Button>
    </div>
  );
}

/** Gives one of the free tables to this host. */
export function AddTableToHost({ hostId, free }: { hostId: string; free: { number: number; cardType: string }[] }) {
  const [choice, setChoice] = useState<string>("");
  const { pending, run } = useHostAction();

  if (free.length === 0) {
    return <p className="text-sm text-muted-foreground">No free tables. Give one up from another host, or add tables in Table settings.</p>;
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={choice} onValueChange={setChoice} disabled={pending}>
        <SelectTrigger size="sm" className="w-56" aria-label="Free table to add">
          <SelectValue placeholder={`Choose a free table (${free.length})`} />
        </SelectTrigger>
        <SelectContent>
          {free.map((table) => (
            <SelectItem key={table.number} value={String(table.number)}>
              Table {table.number} · {table.cardType === "PHYSICAL" ? "physical" : "digital"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        disabled={!choice || pending}
        onClick={() => run(() => assignTableAction(Number(choice), hostId), () => setChoice(""))}
      >
        {pending && <Loader2 className="animate-spin" aria-hidden />}
        Add table
      </Button>
    </div>
  );
}
