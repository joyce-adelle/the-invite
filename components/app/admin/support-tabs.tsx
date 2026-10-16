import Link from "next/link";

import {
  supportHref,
  SUPPORT_VIEWS,
  SUPPORT_VIEW_LABELS,
  type SupportView,
} from "@/lib/support-filters";
import { cn } from "@/lib/utils";

export function SupportTabs({
  view,
  counts,
}: {
  view: SupportView;
  counts: Record<SupportView, number>;
}) {
  return (
    <nav aria-label="Filter help requests by status" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
      {SUPPORT_VIEWS.map((candidate) => {
        const active = view === candidate;
        return (
          <Link
            key={candidate}
            href={supportHref(candidate)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {SUPPORT_VIEW_LABELS[candidate]}
            <span
              className={cn(
                "text-xs tabular-nums",
                active ? "text-primary-foreground/80" : "text-muted-foreground",
              )}
            >
              {counts[candidate]}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
