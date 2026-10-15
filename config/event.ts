// Application-wide event configuration. 

export const event = {
  name: "Ìyá Opeke @ 80",
  /** Timezone dates are shown in on the admin dashboard. */
  timeZone: "Africa/Lagos",
} as const;

// One template for the whole event. Page 1 is copied unchanged; the guest's
// name and table number are drawn onto page 2. Coordinates are PDF points from
// the bottom-left of page 2 (242.88 × 153 pt) and will be tuned when the card
// generator is built.
export const accessCard = {
  templatePath: "template/New.pdf",
  overlayPageIndex: 1,
  fields: {
    guestName: { x: 18, y: 84, size: 14, maxWidth: 120 },
    tableNumber: { x: 18, y: 56, size: 11 },
  },
  color: "#660033",
} as const;
