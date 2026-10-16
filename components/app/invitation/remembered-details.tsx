"use client";

import { useSyncExternalStore } from "react";

import { SupportForm } from "@/components/app/invitation/support-form";

// The request form keeps what the guest typed for the length of the visit, so
// the help page they may be sent to can fill in the help form. It lives in
// sessionStorage: never in the URL, and gone when the tab closes.

const KEY = "invite:details";

type Details = { name: string; email: string };

function read(): string {
  try {
    return window.sessionStorage.getItem(KEY) ?? "";
  } catch {
    // Storage blocked (a private window, say): the help form just starts empty.
    return "";
  }
}

export function rememberDetails(details: Details) {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(details));
  } catch {
    // Not worth failing the request over.
  }
}

const subscribe = () => () => {};

function parse(raw: string): Details {
  try {
    const value = JSON.parse(raw) as Partial<Details>;
    return {
      name: typeof value.name === "string" ? value.name : "",
      email: typeof value.email === "string" ? value.email : "",
    };
  } catch {
    return { name: "", email: "" };
  }
}

/** The help form, open, with the details from the request form filled in when there are any. */
export function RememberedSupportForm({ className }: { className?: string }) {
  // The server (and the first client render) see nothing, so the page matches
  // on hydration; then the form restarts with the saved details.
  const raw = useSyncExternalStore(subscribe, read, () => "");
  const { name, email } = parse(raw);

  return (
    <SupportForm key={raw} defaultOpen initialName={name} initialEmail={email} className={className} />
  );
}
