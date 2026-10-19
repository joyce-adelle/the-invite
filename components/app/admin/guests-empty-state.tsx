import Link from "next/link";
import { Inbox } from "lucide-react";

import { Card } from "@/components/ui/card";
import { dashboardHref, type DashboardFilters, type StatusView } from "@/lib/admin-filters";

const COPY: Record<StatusView, { title: string; hint: string }> = {
  pending: {
    title: "No pending requests",
    hint: "New requests will appear here for review.",
  },
  approved: {
    title: "No approved guests",
    hint: "Guests appear here once you approve their request.",
  },
  rejected: {
    title: "No rejected requests",
    hint: "Requests you reject will be listed here.",
  },
  cancelled: {
    title: "No cancelled invitations",
    hint: "Cancelled invitations will be listed here.",
  },
  all: {
    title: "No requests yet",
    hint: "Requests will appear here as guests submit them.",
  },
};

export function GuestsEmptyState({
  filters,
  hostName,
}: {
  filters: DashboardFilters;
  hostName?: string;
}) {
  const { title, hint } =
    filters.checkIn === "checked-in"
      ? { title: "No guests have checked in", hint: "Guests appear here once they are checked in at the door." }
      : filters.checkIn === "not-checked-in"
        ? { title: "Everyone has checked in", hint: "No approved guest is still waiting to check in." }
        : COPY[filters.status];
  return (
    <Card className="items-center py-12 text-center">
      <Inbox className="size-8 text-muted-foreground" aria-hidden />
      <div>
        <p className="font-medium">
          {title}
          {hostName && <> for {hostName}</>}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
      </div>
      {filters.checkIn !== "all" && (
        <Link
          href={dashboardHref({ ...filters, checkIn: "all", page: 1 })}
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Show all approved guests
        </Link>
      )}
      {filters.host !== "all" && (
        <Link
          href={dashboardHref({ ...filters, host: "all", page: 1 })}
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Show all hosts
        </Link>
      )}
    </Card>
  );
}
