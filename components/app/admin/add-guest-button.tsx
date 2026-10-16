"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";

import { GuestFormDialog } from "@/components/app/admin/guest-form-dialog";
import { Button } from "@/components/ui/button";

export function AddGuestButton({
  hosts,
  defaultHostId,
}: {
  hosts: { id: string; name: string }[];
  defaultHostId?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <UserPlus aria-hidden /> Add guest
      </Button>
      <GuestFormDialog
        mode="create"
        open={open}
        onOpenChange={setOpen}
        hosts={hosts}
        defaultHostId={defaultHostId}
      />
    </>
  );
}
