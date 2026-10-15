import { SupportRequestStatus } from "@/types/support";

// The help-requests page filters in the URL (?status=open|resolved|all), like
// the dashboard, so a view can be bookmarked and the server renders it directly.

export const SUPPORT_VIEWS = ["open", "resolved", "all"] as const;
export type SupportView = (typeof SUPPORT_VIEWS)[number];

export const DEFAULT_SUPPORT_VIEW: SupportView = "open";

export const SUPPORT_VIEW_LABELS: Record<SupportView, string> = {
  open: "Open",
  resolved: "Resolved",
  all: "All",
};

/** Reads untrusted search params; anything unrecognized falls back to the default. */
export function parseSupportView(params: { [key: string]: string | string[] | undefined }): SupportView {
  const status = typeof params.status === "string" ? params.status : "";
  return (SUPPORT_VIEWS as readonly string[]).includes(status)
    ? (status as SupportView)
    : DEFAULT_SUPPORT_VIEW;
}

export function viewToSupportStatus(view: SupportView): SupportRequestStatus | undefined {
  return view === "all" ? undefined : (view.toUpperCase() as SupportRequestStatus);
}

/** The default is left out of the URL to keep it short. */
export function supportHref(view: SupportView): string {
  return view === DEFAULT_SUPPORT_VIEW ? "/admin/support" : `/admin/support?status=${view}`;
}
