"use client";

import { useState, useTransition } from "react";
import { Ban, KeyRound, Loader2, MoreHorizontal, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { PasswordField } from "@/components/app/admin/account-fields";
import { ConfirmDialog } from "@/components/app/admin/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  resetStaffAccountPasswordAction,
  setStaffAccountDisabledAction,
  type StaffAccountActionResult,
} from "@/lib/actions/staff-accounts";
import { ROLE, type Role } from "@/lib/roles";
import { parsePassword } from "@/lib/validation/account";

function isRedirectError(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

const OFFLINE = "We couldn't reach the server. Check your connection and try again.";

const DISABLE_EFFECT: Record<Role, string> = {
  [ROLE.CHECK_IN]: "can't sign in or check anyone in",
  [ROLE.ADMIN]: "can't sign in or use the admin area",
};

/**
 * Disable or re-enable a staff account, or give it a new password. The page
 * only offers this for accounts the server will allow: not the default admin,
 * and not your own.
 */
export function AccountActions({
  user,
}: {
  user: { id: string; username: string; disabled: boolean; role: Role };
}) {
  const [busy, startTransition] = useTransition();
  const [dialog, setDialog] = useState<"disable" | "password" | null>(null);

  function setDisabled(disabled: boolean) {
    startTransition(async () => {
      try {
        const result = await setStaffAccountDisabledAction(user.id, disabled);
        if (result.ok) toast.success(result.message);
        else toast.error(result.message, { duration: 8000 });
      } catch (error) {
        if (!isRedirectError(error)) toast.error(OFFLINE, { duration: 8000 });
      }
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon-sm" disabled={busy} aria-label={`Actions for ${user.username}`}>
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <MoreHorizontal aria-hidden />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setDialog("password")}>
            <KeyRound aria-hidden /> Reset password
          </DropdownMenuItem>
          {user.disabled ? (
            <DropdownMenuItem onSelect={() => setDisabled(false)}>
              <RotateCcw aria-hidden /> Enable account
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem variant="destructive" onSelect={() => setDialog("disable")}>
              <Ban aria-hidden /> Disable account
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={dialog === "disable"}
        onOpenChange={(open) => setDialog(open ? "disable" : null)}
        title={`Disable ${user.username}?`}
        description={`They are signed out everywhere straight away and ${DISABLE_EFFECT[user.role]} until you enable the account again. Everything they already did, such as check-ins, is kept.`}
        confirmLabel="Disable account"
        cancelLabel="Keep active"
        onConfirm={() => setDisabled(true)}
      />

      <Dialog open={dialog === "password"} onOpenChange={(open) => setDialog(open ? "password" : null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset {user.username}&apos;s password</DialogTitle>
            <DialogDescription>
              The old password stops working and they are signed out everywhere. Share the new one with
              them yourself.
            </DialogDescription>
          </DialogHeader>
          {dialog === "password" && <ResetForm userId={user.id} onDone={() => setDialog(null)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function ResetForm({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parsePassword(password);
    if (!parsed.success) {
      setError(parsed.error);
      document.getElementById("reset-check-in-password")?.focus();
      return;
    }
    setError(undefined);
    startTransition(async () => {
      let result: StaffAccountActionResult;
      try {
        result = await resetStaffAccountPasswordAction(userId, parsed.data);
      } catch (error) {
        if (!isRedirectError(error)) setError(OFFLINE);
        return;
      }
      if (!result.ok) {
        setError(result.fieldErrors?.password ?? result.message);
        return;
      }
      toast.success(result.message);
      onDone();
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      <PasswordField
        id="reset-check-in-password"
        label="New password"
        value={password}
        onChange={setPassword}
        error={error}
        disabled={pending}
      />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          Set new password
        </Button>
      </DialogFooter>
    </form>
  );
}
