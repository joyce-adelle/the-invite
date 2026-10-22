"use client";

import { Loader2 } from "lucide-react";

import { useHostAction } from "@/components/app/admin/hosts/use-host-action";
import { Button } from "@/components/ui/button";
import { setTableTypeAction } from "@/lib/actions/hosts";

/** Switches a table between physical and digital cards. The server refuses physical while guests are seated. */
export function TableTypeButton({ tableNumber, cardType }: { tableNumber: number; cardType: "PHYSICAL" | "DIGITAL" }) {
  const { pending, run } = useHostAction();
  const next = cardType === "PHYSICAL" ? "DIGITAL" : "PHYSICAL";
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      onClick={() => run(() => setTableTypeAction(tableNumber, next))}
      aria-label={`Make table ${tableNumber} ${next === "PHYSICAL" ? "physical" : "digital"}`}
    >
      {pending && <Loader2 className="animate-spin" aria-hidden />}
      Make {next === "PHYSICAL" ? "physical" : "digital"}
    </Button>
  );
}
