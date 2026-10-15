import Link from "next/link";
import { MailCheck } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Shown after a request is saved. Must not suggest the guest is already approved. */
export function RequestConfirmation() {
  return (
    <div role="status" className="flex flex-col items-center py-4 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-secondary text-olive ring-1 ring-gold/40">
        <MailCheck className="size-6" aria-hidden />
      </div>
      <h2 className="mt-6 font-display text-3xl font-medium text-primary">
        Your request has been received
      </h2>
      <div aria-hidden className="mt-4 h-px w-12 bg-gold" />
      <p className="mt-5 max-w-sm text-pretty text-muted-foreground">
        Thank you. Your access card will soon be sent to the email address you
        provided.
      </p>
      <p className="mt-3 max-w-sm text-sm text-pretty text-muted-foreground">
        There&apos;s nothing more you need to do for now.
      </p>
      <Link
        href="/"
        className={cn(buttonVariants({ variant: "outline" }), "mt-8")}
      >
        Back to the start
      </Link>
    </div>
  );
}
