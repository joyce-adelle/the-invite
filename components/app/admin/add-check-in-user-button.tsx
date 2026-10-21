"use client";

import { useState, useTransition } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { PasswordField, UsernameField } from "@/components/app/admin/account-fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createCheckInUserAction } from "@/lib/actions/check-in-users";
import { parseNewAccount, type AccountFieldErrors } from "@/lib/validation/account";

function isRedirectError(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

export function AddCheckInUserButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <UserPlus aria-hidden /> Add check-in user
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add a check-in user</DialogTitle>
            <DialogDescription>
              They sign in with this username and password and can only check guests in. Share the
              password with them yourself; it is never shown again.
            </DialogDescription>
          </DialogHeader>
          {/* Mounted only while open, so it starts empty every time. */}
          {open && <AddForm onDone={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function AddForm({ onDone }: { onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState({ username: "", password: "" });
  const [errors, setErrors] = useState<AccountFieldErrors>({});
  const [formError, setFormError] = useState<string>();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(undefined);
    const parsed = parseNewAccount(values);
    if (!parsed.success) {
      setErrors(parsed.fieldErrors);
      document.getElementById(parsed.fieldErrors.username ? "new-check-in-username" : "new-check-in-password")?.focus();
      return;
    }
    setErrors({});
    startTransition(async () => {
      try {
        const result = await createCheckInUserAction(parsed.data);
        if (!result.ok) {
          if (result.fieldErrors) setErrors(result.fieldErrors);
          else setFormError(result.message);
          return;
        }
        toast.success(result.message);
        onDone();
      } catch (error) {
        if (isRedirectError(error)) return;
        setFormError("We couldn't reach the server. Check your connection and try again.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {formError && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {formError}
        </p>
      )}
      <UsernameField
        id="new-check-in-username"
        value={values.username}
        onChange={(username) => setValues((v) => ({ ...v, username }))}
        error={errors.username}
        disabled={pending}
      />
      <PasswordField
        id="new-check-in-password"
        label="Password"
        value={values.password}
        onChange={(password) => setValues((v) => ({ ...v, password }))}
        error={errors.password}
        disabled={pending}
      />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          Add check-in user
        </Button>
      </DialogFooter>
    </form>
  );
}
