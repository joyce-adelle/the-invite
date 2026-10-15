import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Shown instead of the form when the host can't take any more guests. */
export function HostUnavailable() {
  return (
    <div role="status" className="flex flex-col items-center py-4 text-center">
      <h2 className="font-display text-3xl font-medium text-primary">
        We&apos;re no longer taking requests here
      </h2>
      <div aria-hidden className="mt-4 h-px w-12 bg-gold" />
      <p className="mt-5 max-w-sm text-pretty text-muted-foreground">
        Every place for this invitation has now been taken, so we can&apos;t accept new requests
        at the moment. Thank you for your interest.
      </p>
      <Link href="/" className={cn(buttonVariants({ variant: "outline" }), "mt-8")}>
        Back to the start
      </Link>
    </div>
  );
}
