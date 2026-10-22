"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { NameDialog } from "@/components/app/admin/hosts/name-dialog";
import { useHostAction } from "@/components/app/admin/hosts/use-host-action";
import { Button } from "@/components/ui/button";
import { createHostAction } from "@/lib/actions/hosts";

/** Adds a host, then opens its page so tables can be given to it. */
export function AddHostButton() {
  const [open, setOpen] = useState(false);
  const { pending, run } = useHostAction();
  const router = useRouter();

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus aria-hidden /> Add host
      </Button>
      <NameDialog
        open={open}
        onOpenChange={setOpen}
        title="Add a host"
        description="It appears on the public page straight away, but can only seat guests once it has tables. Its web address is made from this name and stays the same if you rename it later."
        submitLabel="Add host"
        pending={pending}
        onSubmit={(name) =>
          run(
            () => createHostAction(name),
            (result) => {
              setOpen(false);
              if (result.hostId) router.push(`/admin/hosts/${result.hostId}`);
            },
          )
        }
      />
    </>
  );
}
