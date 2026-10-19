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

/** Only meaningful for approved guests, the only ones who can check in. */
export const CHECK_IN_VIEWS = ["all", "checked-in", "not-checked-in"] as const;
export type CheckInView = (typeof CHECK_IN_VIEWS)[number];

export const CHECK_IN_VIEW_LABELS: Record<CheckInView, string> = {
  all: "All approved",
  "checked-in": "Checked in",
  "not-checked-in": "Not yet checked in",
};

export type DashboardFilters = {
  status: StatusView;
  host: string | "all";
  /** Always "all" unless the Approved tab is showing. */
  checkIn: CheckInView;
  page: number;
};

/** What the filter means for the guest query: undefined for everyone, otherwise has / hasn't checked in. */
export function checkInToFlag(view: CheckInView): boolean | undefined {
  return view === "all" ? undefined : view === "checked-in";
}

/** Reads untrusted search params; anything unrecognized falls back to the default. */
export function parseFilters(
  params: { [key: string]: string | string[] | undefined },
  hostIds: readonly string[],
): DashboardFilters {
  const status = typeof params.status === "string" ? params.status : "";
  const host = typeof params.host === "string" ? params.host : "";
  const page = typeof params.page === "string" ? Number.parseInt(params.page, 10) : 1;
  const checkIn = typeof params.checkin === "string" ? params.checkin : "";
  const parsedStatus = (STATUS_VIEWS as readonly string[]).includes(status)
    ? (status as StatusView)
    : DEFAULT_STATUS_VIEW;
  return {
    status: parsedStatus,
    checkIn:
      parsedStatus === "approved" && (CHECK_IN_VIEWS as readonly string[]).includes(checkIn)
        ? (checkIn as CheckInView)
        : "all",
    host: hostIds.includes(host) ? host : "all",
    page: Number.isSafeInteger(page) && page > 1 ? page : 1,
  };
}

/** Defaults are left out of the URL to keep it short. */
export function dashboardHref({ status, host, checkIn, page }: DashboardFilters): string {
  const query = new URLSearchParams();
  if (status !== DEFAULT_STATUS_VIEW) query.set("status", status);
  if (host !== "all") query.set("host", host);
  // Other tabs don't have this filter, so it is dropped when leaving the Approved one.
  if (status === "approved" && checkIn !== "all") query.set("checkin", checkIn);
  if (page > 1) query.set("page", String(page));
  const search = query.toString();
  return search ? `/admin?${search}` : "/admin";
}
