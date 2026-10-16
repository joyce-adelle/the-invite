import Link from "next/link";

import {
  dashboardHref,
  STATUS_VIEWS,
  STATUS_VIEW_LABELS,
  viewToStatus,
  type DashboardFilters,
} from "@/lib/admin-filters";
import { cn } from "@/lib/utils";

export function StatusTabs({
  filters,
  counts,
}: {
  filters: DashboardFilters;
  counts: Record<string, number>;
}) {
  return (
    <nav aria-label="Filter by status" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
      {STATUS_VIEWS.map((view) => {
        const active = filters.status === view;
        const count = view === "all" ? counts.all : counts[viewToStatus(view)!];
        return (
          <Link
            key={view}
            href={dashboardHref({ ...filters, status: view, page: 1 })}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {STATUS_VIEW_LABELS[view]}
            <span
              className={cn(
                "text-xs tabular-nums",
                active ? "text-primary-foreground/80" : "text-muted-foreground",
              )}
            >
              {count}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
