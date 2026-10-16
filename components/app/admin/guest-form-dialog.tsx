"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createGuestAction,
  updateGuestAction,
  type AdminActionResult,
} from "@/lib/actions/admin";
import {
  EMAIL_MAX_LENGTH,
  NAME_MAX_LENGTH,
  parseInvitationRequest,
  type InvitationRequestField,
  type InvitationRequestFieldErrors,
} from "@/lib/validation/invitation";
import type { AdminGuest } from "@/types/guest";

type Host = { id: string; name: string };

type Props =
  | {
      mode: "create";
      open: boolean;
      onOpenChange: (open: boolean) => void;
      hosts: Host[];
      /** Preselected, e.g. the host the dashboard is filtered to. */
      defaultHostId?: string;
    }
  | {
      mode: "edit";
      open: boolean;
      onOpenChange: (open: boolean) => void;
      guest: AdminGuest;
    };

function isRedirectError(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

/**
 * Adds a guest (`create`) or corrects one's name and email (`edit`). The form
 * is only mounted while the dialog is open, so it starts fresh every time.
 */
export function GuestFormDialog(props: Props) {
  const { open, onOpenChange } = props;
  const editing = props.mode === "edit";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit guest details" : "Add a guest"}</DialogTitle>
          <DialogDescription>
            {props.mode === "edit"
              ? props.guest.status === "APPROVED"
                ? `Correct ${props.guest.name}'s name or email. The card they were sent will no longer match, so you'll need to send it again.`
                : `Correct ${props.guest.name}'s name or email. ${props.guest.hostName} stays as their host.`
              : "Adds the guest as a pending request, as if they had asked for an invitation. Two guests can share a name. Approve them from the list to seat them."}
          </DialogDescription>
        </DialogHeader>
        <GuestForm {...props} />
      </DialogContent>
    </Dialog>
  );
}

function GuestForm(props: Props) {
  const { onOpenChange } = props;
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState(
    props.mode === "edit"
      ? { name: props.guest.name, email: props.guest.email }
      : { name: "", email: "" },
  );
  const [hostId, setHostId] = useState(props.mode === "create" ? (props.defaultHostId ?? "") : "");
  const [hostError, setHostError] = useState<string>();
  const [errors, setErrors] = useState<InvitationRequestFieldErrors>({});
  const [formError, setFormError] = useState<string>();

  const idPrefix = props.mode === "edit" ? `edit-${props.guest.id}` : "add-guest";

  function validateField(field: InvitationRequestField, next = values) {
    const result = parseInvitationRequest(next);
    const message = result.success ? undefined : result.fieldErrors[field];
    setErrors((current) => ({ ...current, [field]: message }));
  }

  function handleChange(field: InvitationRequestField, value: string) {
    const next = { ...values, [field]: value };
    setValues(next);
    // Once a field is showing an error, re-check as it is fixed.
    if (errors[field]) validateField(field, next);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(undefined);

    const result = parseInvitationRequest(values);
    const missingHost = props.mode === "create" && !hostId;
    setHostError(missingHost ? "Choose a host." : undefined);
    if (!result.success || missingHost) {
      setErrors(result.success ? {} : result.fieldErrors);
      const first = (["name", "email"] as const).find(
        (field) => !result.success && result.fieldErrors[field],
      );
      document.getElementById(first ? `${idPrefix}-${first}` : `${idPrefix}-host`)?.focus();
      return;
    }

    startTransition(async () => {
      try {
        const outcome: AdminActionResult =
          props.mode === "edit"
            ? await updateGuestAction(props.guest.id, result.data)
            : await createGuestAction({ ...result.data, hostId });

        if (!outcome.ok) {
          // The server's per-field messages show against their fields.
          if (outcome.fieldErrors) setErrors(outcome.fieldErrors);
          setFormError(outcome.message);
          return;
        }
        if (outcome.notice) toast.warning(outcome.message, { duration: 12000 });
        else toast.success(outcome.message);
        onOpenChange(false);
      } catch (error) {
        // An expired session redirects to the login page, which is already under way.
        if (isRedirectError(error)) return;
        setFormError("We couldn't reach the server. Check your connection and try again.");
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

      <Field
        id={`${idPrefix}-name`}
        label="Full name"
        error={errors.name}
        input={
          <Input
            id={`${idPrefix}-name`}
            name="name"
            autoComplete="off"
            placeholder="As it should appear on the card"
            maxLength={NAME_MAX_LENGTH * 2}
            value={values.name}
            onChange={(event) => handleChange("name", event.target.value)}
            onBlur={() => values.name && validateField("name")}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? `${idPrefix}-name-error` : undefined}
            disabled={pending}
            required
          />
        }
      />

      <Field
        id={`${idPrefix}-email`}
        label="Email address"
        error={errors.email}
        input={
          <Input
            id={`${idPrefix}-email`}
            name="email"
            type="email"
            autoComplete="off"
            inputMode="email"
            placeholder="guest@example.com"
            maxLength={EMAIL_MAX_LENGTH * 2}
            value={values.email}
            onChange={(event) => handleChange("email", event.target.value)}
            onBlur={() => values.email && validateField("email")}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? `${idPrefix}-email-error` : undefined}
            disabled={pending}
            required
          />
        }
      />

      {props.mode === "create" && (
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-host`}>Invited by</Label>
          <Select
            value={hostId}
            onValueChange={(next) => {
              setHostId(next);
              setHostError(undefined);
            }}
            disabled={pending}
          >
            <SelectTrigger
              id={`${idPrefix}-host`}
              className="w-full"
              aria-invalid={hostError ? true : undefined}
              aria-describedby={hostError ? `${idPrefix}-host-error` : undefined}
            >
              <SelectValue placeholder="Choose a host" />
            </SelectTrigger>
            <SelectContent>
              {props.hosts.map((host) => (
                <SelectItem key={host.id} value={host.id}>
                  {host.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hostError && (
            <p id={`${idPrefix}-host-error`} role="alert" className="text-sm text-destructive">
              {hostError}
            </p>
          )}
        </div>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {props.mode === "edit" ? "Save changes" : "Add guest"}
        </Button>
      </DialogFooter>
    </form>
  );
}
