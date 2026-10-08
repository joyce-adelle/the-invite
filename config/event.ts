// Event configuration. Hosts are configuration, not data — edit this file to
// change who can invite guests, their capacity, and their tables.
// Dummy values for now.

export type Table = {
  number: number;
  capacity: number;
};

export type Host = {
  id: string;
  name: string;
  /** Maximum approved guests for this host. */
  capacity: number;
  /** Tables are filled in the order listed when a guest is approved. */
  tables: Table[];
};

export const event = {
  name: "TheInvite",
} as const;

// Table numbers are unique across hosts so a number always means one physical table.
export const hosts: Host[] = [
  {
    id: "host-one",
    name: "Host One",
    capacity: 50,
    tables: [
      { number: 1, capacity: 10 },
      { number: 2, capacity: 10 },
      { number: 3, capacity: 10 },
      { number: 4, capacity: 10 },
      { number: 5, capacity: 10 },
    ],
  },
  {
    id: "host-two",
    name: "Host Two",
    capacity: 30,
    tables: [
      { number: 6, capacity: 10 },
      { number: 7, capacity: 10 },
      { number: 8, capacity: 10 },
    ],
  },
  {
    id: "host-three",
    name: "Host Three",
    capacity: 20,
    tables: [
      { number: 9, capacity: 10 },
      { number: 10, capacity: 10 },
    ],
  },
];

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

export function getHost(id: string): Host | undefined {
  return hosts.find((host) => host.id === id);
}

export function getHostForTable(tableNumber: number): Host | undefined {
  return hosts.find((host) =>
    host.tables.some((table) => table.number === tableNumber),
  );
}

// Fail fast on configuration mistakes rather than mis-seating guests later.
function assertValidConfig() {
  const hostIds = new Set<string>();
  const tableNumbers = new Set<number>();
  for (const host of hosts) {
    if (hostIds.has(host.id)) throw new Error(`Duplicate host id: ${host.id}`);
    hostIds.add(host.id);

    let seats = 0;
    for (const table of host.tables) {
      if (tableNumbers.has(table.number)) {
        throw new Error(`Table ${table.number} is assigned to more than one host`);
      }
      tableNumbers.add(table.number);
      seats += table.capacity;
    }
    if (seats < host.capacity) {
      throw new Error(
        `${host.id}: capacity ${host.capacity} exceeds its ${seats} table seats`,
      );
    }
  }
}

assertValidConfig();
