import type { GuestStatus } from "./guest";

/** What the check-in page shows an admin. It has no email and no database id. */
export type CheckInView = {
  name: string;
  hostName: string;
  tableNumber: number | null;
  status: GuestStatus;
  checkedInAt: Date | null;
  /** The username of the admin who checked them in. */
  checkedInBy: string | null;
};

export type CheckInOutcome =
  /** This request let the guest in. */
  | { outcome: "checked-in"; guest: CheckInView }
  /** Someone (maybe a moment ago, on another phone) already did; their details are untouched. */
  | { outcome: "already-checked-in"; guest: CheckInView }
  /** Pending, rejected or cancelled: not allowed in. */
  | { outcome: "not-eligible"; guest: CheckInView }
  | { outcome: "not-found" };

/** What the confirm button gets back: the outcome, or why there wasn't one. */
export type CheckInActionResult =
  | CheckInOutcome
  | { outcome: "unauthorized" }
  | { outcome: "error"; message: string };

export type Attendance = {
  approved: number;
  checkedIn: number;
  notCheckedIn: number;
  /** Whole percent of approved guests who have checked in; 0 when nobody is approved. */
  percent: number;
};