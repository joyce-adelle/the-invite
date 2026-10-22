"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Pencil, Trash2 } from "lucide-react";

import { ConfirmDialog } from "@/components/app/admin/confirm-dialog";
import { NameDialog } from "@/components/app/admin/hosts/name-dialog";
import { useHostAction } from "@/components/app/admin/hosts/use-host-action";
import { Button } from "@/components/ui/button";
import { deleteHostAction, renameHostAction, setHostAcceptingRequestsAction } from "@/lib/actions/hosts";

/** Rename, show or hide on the public page, and delete (only when the host is empty). */
export function HostActions({
  host,
}: {
  host: { id: string; name: string; acceptingRequests: boolean; guestRecords: number; tables: number };
}) {
  const [dialog, setDialog] = useState<"rename" | "hide" | "delete" | null>(null);
  const { pending, run } = useHostAction();
  const router = useRouter();
  const canDelete = host.guestRecords === 0 && host.tables === 0;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" onClick={() => setDialog("rename")} disabled={pending}>
        <Pencil aria-hidden /> Rename
      </Button>
      {host.acceptingRequests ? (
        <Button size="sm" variant="outline" onClick={() => setDialog("hide")} disabled={pending}>
          <EyeOff aria-hidden /> Hide from public page
        </Button>
      ) : (
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => run(() => setHostAcceptingRequestsAction(host.id, true))}
        >
          <Eye aria-hidden /> Show on public page
        </Button>
      )}
      <Button
        size="sm"
        variant="outline"
        className="text-destructive"
        onClick={() => setDialog("delete")}
        disabled={pending || !canDelete}
        title={canDelete ? undefined : "Only a host with no guests and no tables can be deleted"}
      >
        <Trash2 aria-hidden /> Delete
      </Button>

      <NameDialog
        open={dialog === "rename"}
        onOpenChange={(open) => setDialog(open ? "rename" : null)}
        title={`Rename ${host.name}`}
        description="Cards made from now on show the new name under Guest Type; cards already sent keep the old one. The web address doesn't change."
        submitLabel="Rename"
        initialName={host.name}
        pending={pending}
        onSubmit={(name) => run(() => renameHostAction(host.id, name), () => setDialog(null))}
      />
      <ConfirmDialog
        open={dialog === "hide"}
        onOpenChange={(open) => setDialog(open ? "hide" : null)}
        title={`Hide ${host.name}?`}
        description="It disappears from the public page and its link stops taking requests. Its guests, cards, tables and check-ins are all kept, and admins can still add guests to it. You can show it again at any time."
        confirmLabel="Hide host"
        cancelLabel="Keep it visible"
        onConfirm={() => run(() => setHostAcceptingRequestsAction(host.id, false))}
      />
      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={(open) => setDialog(open ? "delete" : null)}
        title={`Delete ${host.name}?`}
        description="It has no guests and no tables, so nothing else is lost. This can't be undone."
        confirmLabel="Delete host"
        cancelLabel="Keep host"
        onConfirm={() => run(() => deleteHostAction(host.id), () => router.push("/admin/hosts"))}
      />
    </div>
  );
}
