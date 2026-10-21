"use client";

import { Eye, EyeOff, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import Field from "@/components/common/field";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { useState } from "react";

const INVALID_CREDENTIALS = "Incorrect username or password.";
const TOO_MANY_ATTEMPTS =
  "Too many attempts. Please wait a minute and try again.";
const GENERIC_ERROR = "We couldn't sign you in. Please try again.";

/** `next` is an address already checked by the server (safeReturnPath); without one, sign-in goes to the dashboard. */
export function LoginForm({ next }: { next?: string }) {
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string>();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const username = String(form.get("username") ?? "").trim();
    const password = String(form.get("password") ?? "");

    if (!username || !password) {
      setError(INVALID_CREDENTIALS);
      return;
    }

    setPending(true);
    setError(undefined);
    try {
      const { error } = await authClient.signIn.username({
        username,
        password,
        callbackURL: next ?? "/admin",
      });
      if (error) {
        setError(
          error.status === 429
            ? TOO_MANY_ATTEMPTS
            : error.status && error.status < 500
              ? INVALID_CREDENTIALS
              : GENERIC_ERROR,
        );
        setPending(false);
        return;
      }
      // Better Auth is now loading the callbackURL; the form stays disabled until it does.
    } catch {
      setError(GENERIC_ERROR);
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      {error && (
        <p
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      <Field
        id="username"
        label="Username"
        input={
          <Input
            id="username"
            name="username"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            required
            disabled={pending}
            className="h-11 bg-card px-3.5"
          />
        }
      />

      <Field
        id="password"
        label="Password"
        input={
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              disabled={pending}
              className="h-11 bg-card px-3.5 pr-11"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setShowPassword((shown) => !shown)}
              disabled={pending}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-pressed={showPassword}
              className="absolute top-1/2 right-1.5 -translate-y-1/2 text-muted-foreground"
            >
              {showPassword ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
            </Button>
          </div>
        }
      />

      <Button
        type="submit"
        size="lg"
        className="h-11 w-full text-base"
        disabled={pending}
      >
        {pending && <Loader2 className="animate-spin" aria-hidden />}
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
