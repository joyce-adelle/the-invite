"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { CircleCheck, Loader2 } from "lucide-react";

import Field from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { submitSupportRequest } from "@/lib/actions/support";
import { SUPPORT_ISSUES } from "@/lib/support";
import {
  parseSupportRequest,
  SUPPORT_EMAIL_MAX_LENGTH,
  SUPPORT_FIELDS,
  SUPPORT_MESSAGE_MAX_LENGTH,
  SUPPORT_NAME_MAX_LENGTH,
  type SupportRequestField,
  type SupportRequestFieldErrors,
} from "@/lib/validation/support";
import { cn } from "@/lib/utils";
import { SupportIssueType, type SupportRequestState } from "@/types/support";

const initialState: SupportRequestState = { status: "idle" };

// Field ids are prefixed because this sits on the same page as the
// registration form, which already uses "name" and "email".
const ID = {
  name: "support-name",
  email: "support-email",
  issueType: "support-issue",
  message: "support-message",
} as const satisfies Record<SupportRequestField, string>;

/**
 * "Need help with your invitation?": a small contact form for guests who have
 * a problem registering or haven't received their card. It doesn't need an
 * existing registration. Collapsed by default so it stays discreet; pass
 * `defaultOpen` where the guest is likely to need it straight away.
 */
export function SupportForm({
  defaultOpen = false,
  initialName = "",
  initialEmail = "",
  className,
}: {
  defaultOpen?: boolean;
  /** Typed into the registration form already; saves the guest typing them again. */
  initialName?: string;
  initialEmail?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  // Changing the key starts a fresh form (used by "Send another message").
  const [formKey, setFormKey] = useState(0);

  return (
    <section aria-labelledby="support-heading" className={cn("text-left", className)}>
      <h2 id="support-heading" className="text-base font-medium">
        Need help with your invitation?
      </h2>
      <p className="mt-1 text-sm text-pretty text-muted-foreground">
        If you have a question about your registration or access card, send us a message and our
        team will assist you.
      </p>

      {open ? (
        <div id="support-form-region" className="mt-5">
          <SupportFormBody
            key={formKey}
            initialName={initialName}
            initialEmail={initialEmail}
            onSendAnother={() => setFormKey((key) => key + 1)}
          />
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3"
          aria-expanded={false}
          aria-controls="support-form-region"
          onClick={() => setOpen(true)}
        >
          Contact us
        </Button>
      )}
    </section>
  );
}

function SupportFormBody({
  initialName,
  initialEmail,
  onSendAnother,
}: {
  initialName: string;
  initialEmail: string;
  onSendAnother: () => void;
}) {
  const [state, formAction, pending] = useActionState(submitSupportRequest, initialState);
  const [values, setValues] = useState({
    name: initialName,
    email: initialEmail,
    issueType: "",
    message: "",
  });
  const [errors, setErrors] = useState<SupportRequestFieldErrors>({});
  const successRef = useRef<HTMLDivElement>(null);

  // Take the server's field errors in when a new result arrives.
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state.status === "error") setErrors(state.fieldErrors ?? {});
  }

  // The form disappears on success, so move focus to the confirmation for
  // keyboard and screen-reader users.
  const succeeded = state.status === "success";
  useEffect(() => {
    if (succeeded) successRef.current?.focus();
  }, [succeeded]);

  if (succeeded) {
    return (
      <div
        ref={successRef}
        tabIndex={-1}
        role="status"
        className="flex items-start gap-3 rounded-lg bg-secondary px-4 py-3 text-sm outline-none"
      >
        <CircleCheck className="mt-0.5 size-4 shrink-0 text-olive" aria-hidden />
        <div className="space-y-2">
          <p className="text-secondary-foreground">
            Your message has been received. We will review it and get back to you.
          </p>
          <button
            type="button"
            onClick={onSendAnother}
            className="text-primary underline underline-offset-4 outline-none hover:text-primary/80 focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            Send another message
          </button>
        </div>
      </div>
    );
  }

  function validateField(field: SupportRequestField, next = values) {
    const result = parseSupportRequest(next);
    const message = result.success ? undefined : result.fieldErrors[field];
    setErrors((current) => ({ ...current, [field]: message }));
  }

  function handleChange(field: SupportRequestField, value: string) {
    const next = { ...values, [field]: value };
    setValues(next);
    // Once a field is showing an error, re-check as they fix it. Switching
    // the issue also changes whether the message is needed.
    if (errors[field]) validateField(field, next);
    if (field === "issueType" && errors.message) validateField("message", next);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const result = parseSupportRequest(values);
    if (!result.success) {
      // Stops the server action; the server re-validates everything anyway.
      event.preventDefault();
      setErrors(result.fieldErrors);
      const first = SUPPORT_FIELDS.find((field) => result.fieldErrors[field]);
      if (first) document.getElementById(ID[first])?.focus();
    }
  }

  const saveError = state.status === "error" ? state.message : undefined;
  const messageRequired = values.issueType === SupportIssueType.OTHER;

  return (
    <form action={formAction} onSubmit={handleSubmit} noValidate className="space-y-4">
      {saveError && (
        <p
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {saveError}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id={ID.name}
          label="Your name"
          error={errors.name}
          input={
            <Input
              id={ID.name}
              name="name"
              type="text"
              autoComplete="name"
              maxLength={SUPPORT_NAME_MAX_LENGTH * 2}
              value={values.name}
              onChange={(event) => handleChange("name", event.target.value)}
              onBlur={() => values.name && validateField("name")}
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? `${ID.name}-error` : undefined}
              className="h-10 bg-card"
              required
            />
          }
        />
        <Field
          id={ID.email}
          label="Your email address"
          error={errors.email}
          input={
            <Input
              id={ID.email}
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              maxLength={SUPPORT_EMAIL_MAX_LENGTH * 2}
              value={values.email}
              onChange={(event) => handleChange("email", event.target.value)}
              onBlur={() => values.email && validateField("email")}
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={errors.email ? `${ID.email}-error` : undefined}
              className="h-10 bg-card"
              required
            />
          }
        />
      </div>

      <Field
        id={ID.issueType}
        label="What do you need help with?"
        error={errors.issueType}
        input={
          <>
            {/* The select is a custom control, so the form gets its value from here. */}
            <input type="hidden" name="issueType" value={values.issueType} />
            <Select
              value={values.issueType}
              onValueChange={(value) => handleChange("issueType", value)}
            >
              <SelectTrigger
                id={ID.issueType}
                aria-invalid={errors.issueType ? true : undefined}
                aria-describedby={errors.issueType ? `${ID.issueType}-error` : undefined}
                // The options are sentences: let the chosen one wrap instead of being cut off.
                className="w-full min-w-0 bg-card text-left whitespace-normal data-[size=default]:h-auto data-[size=default]:min-h-10 *:data-[slot=select-value]:line-clamp-2"
              >
                <SelectValue placeholder="Choose one" />
              </SelectTrigger>
              <SelectContent position="popper" className="w-(--radix-select-trigger-width)">
                {SUPPORT_ISSUES.map((issue) => (
                  <SelectItem key={issue.value} value={issue.value} className="items-start">
                    {issue.form}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        }
      />

      <Field
        id={ID.message}
        label={messageRequired ? "Message" : "Message (optional)"}
        error={errors.message}
        input={
          <Textarea
            id={ID.message}
            name="message"
            rows={4}
            maxLength={SUPPORT_MESSAGE_MAX_LENGTH}
            placeholder="Tell us what happened so we can help quickly."
            value={values.message}
            onChange={(event) => handleChange("message", event.target.value)}
            onBlur={() => values.message && validateField("message")}
            aria-invalid={errors.message ? true : undefined}
            aria-describedby={errors.message ? `${ID.message}-error` : undefined}
            className="bg-card"
          />
        }
      />

      <Button type="submit" className="w-full sm:w-auto" disabled={pending}>
        {pending && <Loader2 className="animate-spin" aria-hidden />}
        {pending ? "Sending…" : saveError ? "Try again" : "Send message"}
      </Button>
    </form>
  );
}
