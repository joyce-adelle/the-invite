// Application-wide event configuration. 

export const event = {
  name: "Ìyá Òpékè @ 80",
  /** Timezone dates are shown in on the admin dashboard. */
  timeZone: "Africa/Lagos",
} as const;

// --- Access card ---
//
// ONE template serves the whole event (not one per host or table). Page 1 is
// kept exactly as it is. Page 2 is a background to which the host's name, the
// guest's name and the table are added (lib/access-card.ts); the source PDF is
// never modified.
//
// Positions are in points from the top-left corner of the visible card
// (242.88 × 153 pt); `baseline` is where the text sits, not its top. Every label
// keeps its distance to its answer, and the gap between one answer and the next
// label is the same all the way down. The example is a reference only and isn't
// used at runtime.

/** A line of fixed text, set in the card font and colour. */
type CardLabel = {
  text: string;
  x: number;
  baseline: number;
  /** Font size in points. */
  size: number;
};

/**
 * A name set in its own area. A name that is too wide shrinks to fit one line,
 * down to `minSize`. Below that it goes on two lines of that size, and only if
 * it still doesn't fit is the end of the second line shortened with "…".
 */
type NameField = {
  x: number;
  baseline: number;
  size: number;
  /** Names stay inside this width, clear of the flowers on the right. */
  maxWidth: number;
  minSize: number;
  /** Where the two lines go, when the name needs both. */
  twoLines: { baseline: number; lineHeight: number };
};

export const accessCard = {
  /** The single production template: two pages, page 2 is the overlay target. */
  templatePath: "template/access-card-template.pdf",
  overlayPageIndex: 1,
  /**
   * The card font is Noto Sans Bold.
   * Yorùbá letters such as ẹ, ọ and ṣ. This is a Latin subset of the font, see
   * template/fonts/README.md. To change it, put a TrueType file in
   * template/fonts and point this at it.
   */
  fontPath: "template/fonts/NotoSans-Bold-Latin.ttf",
  color: "#660033",

  /**
   * The guest's own name, first on the card. The template has no place for it,
   * so it takes the top slot (the example card's "Guest Type" slot) and the
   * other fields sit one slot lower. Two lines fit before the next label; the
   * first moves up a little to make room.
   */
  guestName: {
    x: 16.05,
    baseline: 28.51,
    size: 8.44,
    maxWidth: 120,
    minSize: 6.6,
    twoLines: { baseline: 27.2, lineHeight: 7.6 },
  } satisfies NameField,

  /** The host's name, under the "Guest Type" label (the example shows "ADELUSI FAMILY"). */
  hostName: {
    x: 16.05,
    baseline: 51.76,
    size: 8.44,
    maxWidth: 120,
    minSize: 6.6,
    twoLines: { baseline: 50.45, lineHeight: 7.6 },
  } satisfies NameField,

  /** Printed as "TABLE 7", using the guest's actual table number. */
  tableNumber: { x: 16.05, baseline: 75.69, size: 7.98, prefix: "TABLE" },

  /** Fixed texts */
  staticText: [
    { text: "Guest Name", x: 16.05, baseline: 19.32, size: 4.47 },
    { text: "Guest Type", x: 16.05, baseline: 42.57, size: 4.47 },
    { text: "Table No.", x: 16.79, baseline: 65.82, size: 4.96 },
    { text: "Location", x: 16.05, baseline: 89.75, size: 5.65 },
    { text: "AB FOUNDATION CIVIC CENTER,", x: 16.05, baseline: 100.73, size: 7.98 },
    { text: "ADO-EKITI", x: 16.05, baseline: 111.37, size: 7.98 },
    { text: "Colour of the day", x: 16.79, baseline: 125.43, size: 5.91 },
    { text: "WHITE AND OFI", x: 16.05, baseline: 136.0, size: 7.45 },
    { text: "THIS CARD ADMITS ONE", x: 86.93, baseline: 146.08, size: 4.99 },
  ] satisfies CardLabel[],
} as const;
