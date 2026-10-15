"use client";

import { useState, useTransition } from "react";
import {
  ArrowRightLeft,
  Ban,
  Check,
  Loader2,
  MailPlus,
  MoreHorizontal,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { ChangeTableDialog } from "@/components/app/admin/change-table-dialog";
import { ConfirmDialog } from "@/components/app/admin/confirm-dialog";
import { DownloadCardButton } from "@/components/app/admin/download-card-button";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  approveGuestAction,
  cancelGuestAction,
  changeGuestTableAction,
  rejectGuestAction,
  resendAccessCardAction,
  type AdminActionResult,
} from "@/lib/actions/admin";
import { CardStatus, GuestStatus, type AdminGuest } from "@/types/guest";
import type { TableOccupancy } from "@/types/hosts";

type OpenDialog = "reject" | "cancel" | "table" | null;

function isRedirectError(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

/**
 * Row actions. Only the buttons that make sense for the guest's current status
 * are shown, and every result (success or failure) is reported in a toast.
 */
export function GuestActions({
  guest,
  tables,
}: {
  guest: AdminGuest;
  tables: TableOccupancy[];
}) {
  const [busy, startTransition] = useTransition();
  const [running, setRunning] = useState<string | null>(null);
  const [dialog, setDialog] = useState<OpenDialog>(null);

  function perform(
    name: string,
    action: () => Promise<AdminActionResult>,
    onSuccess?: () => void,
  ) {
    setRunning(name);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          toast.error(result.message, { duration: 8000 });
          return;
        }
        if (result.notice) toast.info(result.message);
        else toast.success(result.message);
        onSuccess?.();
      } catch (error) {
        // An expired session makes the action redirect to the login page. The
        // router is already navigating there, so there's nothing to report.
        if (isRedirectError(error)) return;
        toast.error(
          "We couldn't reach the server. Check your connection and try again.",
          {
            duration: 8000,
          },
        );
      } finally {
        setRunning(null);
      }
    });
  }

  if (guest.status === GuestStatus.APPROVED) {
    return (
      <div className="flex items-center justify-end gap-2">
        <DownloadCardButton guest={guest} disabled={busy} />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={busy}
              aria-label={`Actions for ${guest.name}`}
            >
              {busy ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <MoreHorizontal aria-hidden />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setDialog("table")}>
              <ArrowRightLeft aria-hidden /> Change table
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                perform("resend", () => resendAccessCardAction(guest.id))
              }
            >
              <MailPlus aria-hidden />
              {guest.cardStatus === CardStatus.NOT_SENT
                ? "Send access card"
                : "Resend access card"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => setDialog("cancel")}
            >
              <Ban aria-hidden /> Cancel invitation
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <ChangeTableDialog
          open={dialog === "table"}
          onOpenChange={(open) => setDialog(open ? "table" : null)}
          guest={guest}
          tables={tables}
          busy={busy}
          onSubmit={(tableNumber) =>
            perform(
              "table",
              () => changeGuestTableAction(guest.id, tableNumber),
              () => setDialog(null),
            )
          }
        />

        <ConfirmDialog
          open={dialog === "cancel"}
          onOpenChange={(open) => setDialog(open ? "cancel" : null)}
          title={`Cancel ${guest.name}'s invitation?`}
          description="Their seat and place with the host are freed straight away, and the table can go to someone else. The record is kept, you can approve them again later, and they are not emailed."
          confirmLabel="Cancel invitation"
          cancelLabel="Keep invitation"
          onConfirm={() => perform("cancel", () => cancelGuestAction(guest.id))}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:justify-end">
      <Button
        size="sm"
        onClick={() => perform("approve", () => approveGuestAction(guest.id))}
        disabled={busy}
      >
        {running === "approve" ? (
          <Loader2 className="animate-spin" aria-hidden />
        ) : (
          <Check aria-hidden />
        )}
        Approve
      </Button>

      {guest.status === GuestStatus.PENDING && (
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDialog("reject")}
            disabled={busy}
          >
            {running === "reject" ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <X aria-hidden />
            )}
            Reject
          </Button>
          <ConfirmDialog
            open={dialog === "reject"}
            onOpenChange={(open) => setDialog(open ? "reject" : null)}
            title={`Reject ${guest.name}'s request?`}
            description="No email is sent to them. You can still approve the request later."
            confirmLabel="Reject request"
            cancelLabel="Go back"
            onConfirm={() => perform("reject", () => rejectGuestAction(guest.id))}
          />
        </>
      )}
    </div>
  );
}
