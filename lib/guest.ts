// Shape of a guest record as stored in the "Guests" tab of the Google Sheet.

export const guestStatuses = ["pending", "approved", "rejected", "cancelled"] as const;
export type GuestStatus = (typeof guestStatuses)[number];

// Tracks access-card delivery so failed sends can be retried from the admin panel.
export const cardStatuses = ["not_sent", "sent", "failed"] as const;
export type CardStatus = (typeof cardStatuses)[number];

export type Guest = {
  id: string;
  name: string;
  /** Stored lowercased; unique across all requests regardless of host. */
  email: string;
  /** Host id from config/event.ts. */
  invitedBy: string;
  status: GuestStatus;
  table: number | null;
  cardStatus: CardStatus;
  /** ISO 8601 timestamps; null until the event happens. */
  createdAt: string;
  approvedAt: string | null;
  cardSentAt: string | null;
};

// Column order in the sheet (row 1 holds these headers).
export const guestColumns = [
  "id",
  "name",
  "email",
  "invitedBy",
  "status",
  "table",
  "cardStatus",
  "createdAt",
  "approvedAt",
  "cardSentAt",
] as const satisfies readonly (keyof Guest)[];
