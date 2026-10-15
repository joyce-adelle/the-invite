"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";

import { submitInvitationRequest } from "@/lib/actions/invitation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  EMAIL_MAX_LENGTH,
  NAME_MAX_LENGTH,
  parseInvitationRequest,
  type InvitationRequestField,
  type InvitationRequestFieldErrors,
} from "@/lib/validation/invitation";
import Field from "@/components/common/field";
import { InvitationRequestState } from "@/types/invitation";
import { RequestConfirmation } from "./request-confirmation";
import { HostUnavailable } from "./host-unavailable";

const initialState: InvitationRequestState = { status: "idle" };

export function RequestForm({ hostId }: { hostId: string }) {
  const [state, formAction, pending] = useActionState(
    submitInvitationRequest,
    initialState,
  );
  const [values, setValues] = useState({ name: "", email: "" });
  const [errors, setErrors] = useState<InvitationRequestFieldErrors>({});

  // Take the server's field errors in when a new result arrives.
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state.status === "error") setErrors(state.fieldErrors ?? {});
  }

  if (state.status === "success") return <RequestConfirmation />;
  if (state.status === "error" && state.hostFull) return <HostUnavailable />;

  function validateField(field: InvitationRequestField, next = values) {
    const result = parseInvitationRequest(next);
    const message = result.success ? undefined : result.fieldErrors[field];
    setErrors((current) => ({ ...current, [field]: message }));
  }

  function handleChange(field: InvitationRequestField, value: string) {
    const next = { ...values, [field]: value };
    setValues(next);
    // Once a field is showing an error, re-check as they fix it.
    if (errors[field]) validateField(field, next);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const result = parseInvitationRequest(values);
    if (!result.success) {
      // Stops the server action; the server re-validates everything anyway.
      event.preventDefault();
      setErrors(result.fieldErrors);
      const first = (["name", "email"] as const).find(
        (field) => result.fieldErrors[field],
      );
      if (first) document.getElementById(first)?.focus();
    }
  }

  const formError = state.status === "error" ? state.message : undefined;

  return (
    <form
      action={formAction}
      onSubmit={handleSubmit}
      noValidate
      className="space-y-6"
    >
      <input type="hidden" name="hostId" value={hostId} />

      {formError && (
        <p
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {formError}
        </p>
      )}

      <Field
        id="name"
        label="Full name"
        error={errors.name}
        input={
          <Input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            placeholder="As it should appear on your card"
            maxLength={NAME_MAX_LENGTH * 2}
            value={values.name}
            onChange={(event) => handleChange("name", event.target.value)}
            onBlur={() => values.name && validateField("name")}
            aria-invalid={errors.name ? true : undefined}
            aria-describedby={errors.name ? "name-error" : undefined}
            className="h-11 bg-card px-3.5"
            required
          />
        }
      />

      <Field
        id="email"
        label="Email address"
        error={errors.email}
        input={
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="you@example.com"
            maxLength={EMAIL_MAX_LENGTH * 2}
            value={values.email}
            onChange={(event) => handleChange("email", event.target.value)}
            onBlur={() => values.email && validateField("email")}
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? "email-error" : undefined}
            className="h-11 bg-card px-3.5"
            required
          />
        }
      />

      <div className="space-y-3">
        <Button
          type="submit"
          size="lg"
          className="h-11 w-full text-base"
          disabled={pending}
        >
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          {pending ? "Sending your request…" : "Request my invitation"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Each invitation admits one guest.
        </p>
      </div>
    </form>
  );
}
