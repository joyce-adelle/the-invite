import { ChevronLeft, ChevronRight } from "lucide-react";

import { PageLink } from "@/components/app/admin/page-link";
import type { DashboardFilters } from "@/lib/admin-filters";

/** Footer of the guest list: which guests are showing, and previous / next page links. */
export function GuestsPagination({
  filters,
  page,
  pageSize,
  total,
  totalPages,
}: {
  filters: DashboardFilters;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}) {
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-between gap-3 border-t px-4 py-2.5"
    >
      <p className="text-xs text-muted-foreground tabular-nums">
        {total <= pageSize ? `${total} ${total === 1 ? "guest" : "guests"}` : `${first}–${last} of ${total}`}
      </p>

      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground tabular-nums">
            Page {page} of {totalPages}
          </span>
          <PageLink filters={filters} page={page - 1} disabled={page <= 1} label="Previous page">
            <ChevronLeft aria-hidden />
          </PageLink>
          <PageLink filters={filters} page={page + 1} disabled={page >= totalPages} label="Next page">
            <ChevronRight aria-hidden />
          </PageLink>
        </div>
      )}
    </nav>
  );
}
