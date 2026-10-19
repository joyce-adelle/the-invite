"use client";

import {
  BadgeCheck,
  CircleAlert,
  Loader2,
  ShieldAlert,
  UserCheck,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { useState, useTransition } from "react";

import type { CheckInView } from "@/types/check-in";
import { GuestStatusBadge } from "@/components/app/admin/guest-status-badge";
import Link from "next/link";
import { checkInPath } from "@/lib/check-in/check-in-path";
import { checkInState } from "@/lib/check-in/check-in-state";
import { cn } from "@/lib/utils";
import { confirmCheckInAction } from "@/lib/actions/check-in";
import { formatDateTime } from "@/components/app/admin/date-cell";

type Notice =
  | { kind: "success" }
  /** Someone got there first, or the guest isn't allowed in: the page just reflects the truth. */
  | { kind: "info"; message: string }
  | { kind: "error"; message: string; signIn?: boolean };

function isRedirectError(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

/**
 * Shows the guest and, for an approved guest who hasn't come in yet, the
 * confirm button. Nothing is claimed as done until the server says so: the
 * "checked in" state comes from its answer, never from the click.
 */
export function CheckInPanel({
  token,
  initial,
}: {
  token: string;
  initial: CheckInView;
}) {
  const [guest, setGuest] = useState(initial);
  const [notice, setNotice] = useState<Notice>();
  const [pending, startTransition] = useTransition();
  const state = checkInState(guest);

  function confirm() {
    setNotice(undefined);
    startTransition(async () => {
      try {
        const result = await confirmCheckInAction(token);
        switch (result.outcome) {
          case "checked-in":
            setGuest(result.guest);
            setNotice({ kind: "success" });
            break;
          case "already-checked-in":
            setGuest(result.guest);
            setNotice({
              kind: "info",
              message:
                "Someone else checked this guest in just now. Their original check-in is kept.",
            });
            break;
          case "not-eligible":
            setGuest(result.guest);
            setNotice({
              kind: "info",
              message:
                "This invitation's status changed, so the guest can't be checked in.",
            });
            break;
          case "not-found":
            setNotice({
              kind: "error",
              message: "This code doesn't match any invitation.",
            });
            break;
          case "unauthorized":
            setNotice({
              kind: "error",
              message: "Your session has expired. Sign in again to continue.",
              signIn: true,
            });
            break;
          case "error":
            setNotice({ kind: "error", message: result.message });
            break;
        }
      } catch (error) {
        // An expired session can redirect to the login page, which is already under way.
        if (isRedirectError(error)) return;
        setNotice({
          kind: "error",
          message:
            "We couldn't reach the server, so the check-in was not recorded. Check your connection and try again.",
        });
      }
    });
  }

  return (
    <div className="rounded-2xl border border-gold/30 border-t-gold bg-card/90 p-6 shadow-md backdrop-blur-sm sm:p-8">
      <p className="text-center text-xs font-medium tracking-[0.3em] text-olive uppercase">
        Check-in
      </p>
      <h1 className="mt-3 text-center font-display text-4xl font-medium text-balance text-primary">
        {guest.name}
      </h1>
      <div aria-hidden className="mx-auto mt-4 h-px w-12 bg-gold" />

      <dl className="mt-6 grid grid-cols-3 gap-3 text-center">
        <div>
          <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Table
          </dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums">
            {guest.tableNumber ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Guest type
          </dt>
          <dd className="mt-1 text-sm font-medium text-pretty">
            {guest.hostName}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Invitation
          </dt>
          <dd className="mt-1.5">
            <GuestStatusBadge status={guest.status} />
          </dd>
        </div>
      </dl>

      <div className="mt-8 space-y-4" aria-live="polite">
        {notice?.kind === "success" && (
          <Banner
            tone="success"
            icon={<BadgeCheck className="size-5" aria-hidden />}
            title="Checked in"
          >
            {guest.name} is checked in. This was recorded by the server just
            now.
          </Banner>
        )}
        {notice?.kind === "info" && (
          <Banner
            tone="warning"
            icon={<CircleAlert className="size-5" aria-hidden />}
            title="Nothing was changed"
          >
            {notice.message}
          </Banner>
        )}
        {notice?.kind === "error" && (
          <Banner
            tone="error"
            icon={<ShieldAlert className="size-5" aria-hidden />}
            title="Not checked in"
          >
            {notice.message}
            {notice.signIn && (
              <>
                {" "}
                <Link
                  href={`/admin/login?next=${encodeURIComponent(checkInPath(token))}`}
                  className="font-medium underline underline-offset-4"
                >
                  Sign in
                </Link>
              </>
            )}
          </Banner>
        )}

        {state.kind === "checked-in" && notice?.kind !== "success" && (
          <Banner
            tone="warning"
            icon={<UserCheck className="size-5" aria-hidden />}
            title="Already checked in"
          >
            <CheckInRecord guest={guest} />
          </Banner>
        )}
        {state.kind === "checked-in" && notice?.kind === "success" && (
          <p className="text-center text-sm text-muted-foreground">
            <CheckInRecord guest={guest} />
          </p>
        )}

        {state.kind === "not-eligible" && (
          <Banner
            tone="error"
            icon={<ShieldAlert className="size-5" aria-hidden />}
            title="Cannot be used for entry"
          >
            {state.reason} Please check the situation in the admin dashboard
            before letting this guest in.
            {guest.checkedInAt && (
              <>
                {" "}
                <CheckInRecord guest={guest} earlier />
              </>
            )}
          </Banner>
        )}

        {state.kind === "ready" && (
          <Button
            size="lg"
            className="h-12 w-full text-base"
            onClick={confirm}
            disabled={pending}
          >
            {pending ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <UserCheck aria-hidden />
            )}
            {pending ? "Checking in…" : "Confirm check-in"}
          </Button>
        )}

        {state.kind === "not-eligible" && (
          <Link
            href="/admin"
            className={cn(buttonVariants({ variant: "outline" }), "w-full")}
          >
            Open the admin dashboard
          </Link>
        )}
      </div>
    </div>
  );
}

function CheckInRecord({
  guest,
  earlier = false,
}: {
  guest: CheckInView;
  earlier?: boolean;
}) {
  if (!guest.checkedInAt) return null;
  return (
    <>
      {earlier ? "Checked in earlier on " : "Checked in on "}
      <time dateTime={guest.checkedInAt.toISOString()}>
        {formatDateTime(guest.checkedInAt)}
      </time>
      {guest.checkedInBy && <> by {guest.checkedInBy}</>}.
    </>
  );
}

const TONES = {
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-gold/60 bg-gold/15 text-foreground",
  error: "border-destructive/30 bg-destructive/10 text-destructive",
} as const;

function Banner({
  tone,
  icon,
  title,
  children,
}: {
  tone: keyof typeof TONES;
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-xl border p-4", TONES[tone])}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="text-sm">
        <p className="text-base font-semibold">{title}</p>
        <p className="mt-1">{children}</p>
      </div>
    </div>
  );
}
