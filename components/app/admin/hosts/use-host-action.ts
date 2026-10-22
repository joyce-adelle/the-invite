"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import type { HostActionResult } from "@/lib/actions/hosts";

function isRedirectError(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

/**
 * Runs a host action and reports the server's answer in a toast. `onDone` runs
 * only after a confirmed success, with the result.
 */
export function useHostAction() {
  const [pending, startTransition] = useTransition();

  function run(action: () => Promise<HostActionResult>, onDone?: (result: HostActionResult & { ok: true }) => void) {
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) {
          toast.error(result.message, { duration: 8000 });
          return;
        }
        toast.success(result.message);
        onDone?.(result);
      } catch (error) {
        if (isRedirectError(error)) return;
        toast.error("We couldn't reach the server. Check your connection and try again.", { duration: 8000 });
      }
    });
  }

  return { pending, run };
}
