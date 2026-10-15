import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Shown when the submitted name matches an existing guest. The wording is the
 * same whatever that guest's status, so it reveals nothing about them.
 */
export function RequestDuplicate() {
  return (
    <div role="status" className="flex flex-col items-center py-4 text-center">
      <h2 className="font-display text-3xl font-medium text-primary">
        A quick note
      </h2>
      <div aria-hidden className="mt-4 h-px w-12 bg-gold" />
      <p className="mt-5 max-w-sm text-pretty text-muted-foreground">
        If you’ve already registered but haven’t received your access card by
        email, or if you haven’t registered yet, please reach out to your host
        for assistance.
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
