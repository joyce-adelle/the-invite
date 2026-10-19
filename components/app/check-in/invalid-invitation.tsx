import Link from "next/link";
import { SearchX } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** A code that doesn't belong to any invitation. */
export function InvalidInvitation() {
  return (
    <div className="rounded-2xl border border-destructive/30 bg-card/90 p-6 shadow-md backdrop-blur-sm sm:p-8">
      <div role="alert" className="flex flex-col items-center py-4 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <SearchX className="size-6" aria-hidden />
        </div>
        <h1 className="mt-6 font-display text-3xl font-medium text-primary">Invitation not found</h1>
        <div aria-hidden className="mt-4 h-px w-12 bg-gold" />
        <p className="mt-5 max-w-sm text-pretty text-muted-foreground">
          This code doesn&apos;t match any invitation. Try scanning it again, or look the guest up in
          the admin dashboard.
        </p>
        <Link href="/admin" className={cn(buttonVariants({ variant: "outline" }), "mt-8")}>
          Open the dashboard
        </Link>
      </div>
    </div>
  );
}
