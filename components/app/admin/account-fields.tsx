"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import Field from "@/components/common/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, USERNAME_MAX_LENGTH } from "@/lib/validation/account";

/** A new password, shown or hidden, so an admin can read back what they typed before passing it on. */
export function PasswordField({
  id,
  label,
  value,
  onChange,
  error,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
}) {
  const [shown, setShown] = useState(false);
  return (
    <Field
      id={id}
      label={label}
      error={error}
      input={
        <div className="relative">
          <Input
            id={id}
            name="password"
            type={shown ? "text" : "password"}
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            maxLength={MAX_PASSWORD_LENGTH}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : `${id}-hint`}
            disabled={disabled}
            className="pr-11"
            required
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => setShown((s) => !s)}
            disabled={disabled}
            aria-label={shown ? "Hide password" : "Show password"}
            aria-pressed={shown}
            className="absolute top-1/2 right-1.5 -translate-y-1/2 text-muted-foreground"
          >
            {shown ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
          </Button>
          {!error && (
            <p id={`${id}-hint`} className="mt-1.5 text-xs text-muted-foreground">
              At least {MIN_PASSWORD_LENGTH} characters.
            </p>
          )}
        </div>
      }
    />
  );
}

export function UsernameField({
  id,
  value,
  onChange,
  error,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  disabled?: boolean;
}) {
  return (
    <Field
      id={id}
      label="Username"
      error={error}
      input={
        <Input
          id={id}
          name="username"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={USERNAME_MAX_LENGTH}
          placeholder="e.g. door.north"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          disabled={disabled}
          required
        />
      }
    />
  );
}
