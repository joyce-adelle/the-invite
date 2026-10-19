import { checkInPath, isCheckInToken } from "@/lib/check-in/check-in-path";

import Link from "next/link";
import { Lock } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** What anyone who isn't a signed-in admin sees. It says nothing about the guest, or whether there is one. */
export function RestrictedAccess({ token }: { token: string }) {
  // Sign-in can bring the admin back here, but only for something shaped like a real code.
  const login = isCheckInToken(token)
    ? `/admin/login?next=${encodeURIComponent(checkInPath(token))}`
    : "/admin/login";

  return (
    <div className="rounded-2xl border border-gold/30 border-t-gold bg-card/90 p-6 shadow-md backdrop-blur-sm sm:p-8">
      <div
        role="status"
        className="flex flex-col items-center py-4 text-center"
      >
        <div className="flex size-14 items-center justify-center rounded-full bg-secondary text-olive ring-1 ring-gold/40">
          <Lock className="size-6" aria-hidden />
        </div>
        <h1 className="mt-6 font-display text-3xl font-medium text-primary">
          Restricted access
        </h1>
        <div aria-hidden className="mt-4 h-px w-12 bg-gold" />
        <p className="mt-5 max-w-sm text-pretty text-muted-foreground">
          This page is restricted to authorized event administrators.
        </p>
        <Link href={login} className={cn(buttonVariants(), "mt-8")}>
          Admin sign in
        </Link>
      </div>
    </div>
  );
}
