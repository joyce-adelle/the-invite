"use client";

import { useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { resolveSupportRequestAction } from "@/lib/actions/admin";

function isRedirectError(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.startsWith("NEXT_REDIRECT");
}

export function ResolveSupportButton({ id, name }: { id: string; name: string }) {
  const [pending, startTransition] = useTransition();

  function resolve() {
    startTransition(async () => {
      try {
        const result = await resolveSupportRequestAction(id);
        if (result.ok) toast.success(result.message);
        else toast.error(result.message, { duration: 8000 });
      } catch (error) {
        // An expired session makes the action redirect to the login page; the
        // router is already navigating there.
        if (isRedirectError(error)) return;
        toast.error("We couldn't reach the server. Check your connection and try again.", {
          duration: 8000,
        });
      }
    });
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={resolve}
      disabled={pending}
      aria-label={`Mark ${name}'s request as resolved`}
    >
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
      Resolve
    </Button>
  );
}
