import { Suspense } from "react";

import { AddGuestButton } from "@/components/app/admin/add-guest-button";
import { AttendanceCards } from "@/components/app/admin/attendance-cards";
import { CheckInFilter } from "@/components/app/admin/check-in-filter";
import { GuestsList } from "@/components/app/admin/guests-list";
import { HostCapacity } from "@/components/app/admin/host-capacity";
import { HostFilter } from "@/components/app/admin/host-filter";
import { ListSkeleton } from "@/components/app/admin/list-skeleton";
import { StatsCards } from "@/components/app/admin/stats-cards";
import { StatusTabs } from "@/components/app/admin/status-tabs";
import { PageHeader } from "@/components/common/page-header";
import { requireAdmin } from "@/lib/admin-session";
import { isSuperAdmin } from "@/lib/roles";
import { parseFilters } from "@/lib/admin-filters";
import { getDashboardCounts } from "@/lib/data/guests";

export async function Dashboard({
  searchParams,
}: {
  searchParams: PageProps<"/admin">["searchParams"];
}) {
  const { user } = await requireAdmin();

  const counts = await getDashboardCounts();
  const filters = parseFilters(await searchParams, counts.hosts.map((host) => host.hostId));
  const host = counts.hosts.find((candidate) => candidate.hostId === filters.host);

  // Tab counts follow the host filter; the cards and capacity above stay event-wide.
  const tabCounts = host ? host.byStatus : counts.byStatus;
  const tabTotal = host ? Object.values(host.byStatus).reduce((a, b) => a + b, 0) : counts.total;

  const hostOptions = counts.hosts.map((h) => ({ id: h.hostId, name: h.name }));
  const tablesByHost = Object.fromEntries(counts.hosts.map((h) => [h.hostId, h.tables]));

  return (
    <div className="space-y-10">
      <PageHeader
        title="Dashboard"
        description="Review invitation requests and manage approved guests."
        actions={
          <AddGuestButton
            hosts={hostOptions}
            defaultHostId={host?.hostId}
          />
        }
      />

      <section aria-labelledby="overview-heading" className="space-y-3">
        <h2 id="overview-heading" className="sr-only">
          Overview
        </h2>
        <StatsCards counts={counts} />
      </section>

      <section aria-labelledby="attendance-heading" className="space-y-3">
        <div>
          <h2 id="attendance-heading" className="text-lg font-semibold">
            Attendance
          </h2>
          <p className="text-sm text-muted-foreground">
            Approved guests who have checked in at the door.
          </p>
        </div>
        <AttendanceCards attendance={counts.attendance} />
      </section>

      <section aria-labelledby="capacity-heading" className="space-y-3">
        <div>
          <h2 id="capacity-heading" className="text-lg font-semibold">
            Host capacity
          </h2>
          <p className="text-sm text-muted-foreground">
            Approved guests against each host&apos;s digital places. Seats at physical tables are taken by printed cards. Pending requests don&apos;t use capacity.
          </p>
        </div>
        <HostCapacity hosts={counts.hosts} canManage={isSuperAdmin(user)} />
      </section>

      <section aria-labelledby="guests-heading" className="space-y-4">
        <h2 id="guests-heading" className="text-lg font-semibold">
          Guests
        </h2>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <StatusTabs filters={filters} counts={{ ...tabCounts, all: tabTotal }} />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {filters.status === "approved" && <CheckInFilter filters={filters} />}
            <HostFilter hosts={hostOptions} filters={filters} />
          </div>
        </div>
        <Suspense
          key={`${filters.status}:${filters.host}:${filters.checkIn}:${filters.page}`}
          fallback={<ListSkeleton />}
        >
          <GuestsList
            filters={filters}
            hostName={host?.name}
            tablesByHost={tablesByHost}
            hosts={hostOptions}
          />
        </Suspense>
      </section>
    </div>
  );
}
