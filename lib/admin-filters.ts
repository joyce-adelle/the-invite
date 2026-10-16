import { GuestStatus } from "@/types/guest";

// Dashboard filters live in the URL (?status=…&host=…), so a view can be
// bookmarked or shared and the server renders exactly what was asked for.

export const STATUS_VIEWS = ["pending", "approved", "rejected", "cancelled", "all"] as const;
export type StatusView = (typeof STATUS_VIEWS)[number];

export const DEFAULT_STATUS_VIEW: StatusView = "pending";

export const PAGE_SIZE = 20;

export const STATUS_VIEW_LABELS: Record<StatusView, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
  all: "All",
};

export function viewToStatus(view: StatusView): GuestStatus | undefined {
  return view === "all" ? undefined : (view.toUpperCase() as GuestStatus);
}

export type DashboardFilters = { status: StatusView; host: string | "all"; page: number };

/** Reads untrusted search params; anything unrecognized falls back to the default. */
export function parseFilters(
  params: { [key: string]: string | string[] | undefined },
  hostIds: readonly string[],
): DashboardFilters {
  const status = typeof params.status === "string" ? params.status : "";
  const host = typeof params.host === "string" ? params.host : "";
  const page = typeof params.page === "string" ? Number.parseInt(params.page, 10) : 1;
  return {
    status: (STATUS_VIEWS as readonly string[]).includes(status)
      ? (status as StatusView)
      : DEFAULT_STATUS_VIEW,
    host: hostIds.includes(host) ? host : "all",
    page: Number.isSafeInteger(page) && page > 1 ? page : 1,
  };
}

/** Defaults are left out of the URL to keep it short. */
export function dashboardHref({ status, host, page }: DashboardFilters): string {
  const query = new URLSearchParams();
  if (status !== DEFAULT_STATUS_VIEW) query.set("status", status);
  if (host !== "all") query.set("host", host);
  if (page > 1) query.set("page", String(page));
  const search = query.toString();
  return search ? `/admin?${search}` : "/admin";
}
