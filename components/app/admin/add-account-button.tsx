"use client";

import { useState, useTransition } from "react";
import { Loader2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import {
  PasswordField,
  UsernameField,
} from "@/components/app/admin/account-fields";
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
  createAdminUserAction,
  createCheckInUserAction,
} from "@/lib/actions/staff-accounts";
import { ROLE, type Role } from "@/lib/roles";
import {
  parseNewAccount,
  type AccountFieldErrors,
} from "@/lib/validation/account";

function isRedirectError(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

const COPY = {
  [ROLE.CHECK_IN]: {
    button: "Add check-in user",
    title: "Add a check-in user",
    description:
      "They sign in with this username and password and can only check guests in. Share the password with them yourself; it is never shown again.",
  },
  [ROLE.ADMIN]: {
    button: "Add admin",
    title: "Add an admin",
    description:
      "Add an admin who can manage guests, send cards, see help requests, and add or disable staff accounts, including other admins. Share the password with them yourself; it is never shown again.",
  },
} satisfies Record<
  Role,
  { button: string; title: string; description: string }
>;

/** Adds a staff account with the given role. */
export function AddAccountButton({ role }: { role: Role }) {
  const [open, setOpen] = useState(false);
  const copy = COPY[role];
  return (
    <>
      <Button
        size="sm"
        variant={role === ROLE.ADMIN ? "outline" : "default"}
        onClick={() => setOpen(true)}
      >
        <UserPlus aria-hidden /> {copy.button}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{copy.title}</DialogTitle>
            <DialogDescription>{copy.description}</DialogDescription>
          </DialogHeader>
          {/* Mounted only while open, so it starts empty every time. */}
          {open && <AddForm role={role} onDone={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function AddForm({ role, onDone }: { role: Role; onDone: () => void }) {
  const prefix = role === ROLE.ADMIN ? "new-admin" : "new-check-in";
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
      document
        .getElementById(
          `${prefix}-${parsed.fieldErrors.username ? "username" : "password"}`,
        )
        ?.focus();
      return;
    }
    setErrors({});
    startTransition(async () => {
      try {
        const create =
          role === ROLE.ADMIN ? createAdminUserAction : createCheckInUserAction;
        const result = await create(parsed.data);
        if (!result.ok) {
          if (result.fieldErrors) setErrors(result.fieldErrors);
          else setFormError(result.message);
          return;
        }
        toast.success(result.message);
        onDone();
      } catch (error) {
        if (isRedirectError(error)) return;
        setFormError(
          "We couldn't reach the server. Check your connection and try again.",
        );
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {formError && (
        <p
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {formError}
        </p>
      )}
      <UsernameField
        id={`${prefix}-username`}
        value={values.username}
        onChange={(username) => setValues((v) => ({ ...v, username }))}
        error={errors.username}
        disabled={pending}
      />
      <PasswordField
        id={`${prefix}-password`}
        label="Password"
        value={values.password}
        onChange={(password) => setValues((v) => ({ ...v, password }))}
        error={errors.password}
        disabled={pending}
      />
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onDone}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {COPY[role].button}
        </Button>
      </DialogFooter>
    </form>
  );
}
