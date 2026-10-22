import "./no-email"; // first: nothing here may send real email
import "dotenv/config";

import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it, mock } from "node:test";

import { isGuestError, type GuestErrorCode } from "@/lib/data/errors";
import {
  cancelGuest,
  createGuest,
  createGuestRequest,
  getDashboardCounts,
  getHostOccupancy,
  hostHasCapacity,
  setTableCardType,
  updateGuestDetails,
  updateGuestTable,
} from "@/lib/data/guests";
import { approveInvitation } from "@/lib/invitations";
import { prisma } from "@/lib/prisma";
import { acceptsRequests, hostOccupancy } from "@/lib/utils";

// Tables with printed (physical) cards: their seats are already taken, so
// approvals only seat guests at digital tables, while public requests are still
// measured against everyone the host may bring. Own hosts ("test-phys-…",
// tables 9701+), removed afterwards; only against a local database.
const url = process.env.DATABASE_URL ?? "";
const isLocal = /^postgres(ql)?:\/\/[^@/]*@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);

const MIXED = "test-phys-mixed"; // like Kikelomo's Guests: 3 physical tables, 2 digital (small here)
const ONLY = "test-phys-only"; // like Adelusi Family: physical tables only
const ok = async () => ({ id: "test-email-id" });

let counter = 0;
const pending = (invitedBy: string) => {
  counter += 1;
  return createGuest({ name: `Zzphys Guest ${counter}`, email: `phys${counter}@phys-test.invalid`, invitedBy });
};

async function rejectsWith(code: GuestErrorCode, promise: Promise<unknown>, message?: RegExp) {
  await assert.rejects(promise, (error) => {
    assert.ok(isGuestError(error, code), `expected ${code}, got ${error}`);
    if (message) assert.match(error.message, message);
    return true;
  });
}

describe("physical-card tables", { skip: !isLocal && "DATABASE_URL is not a local database" }, () => {
  const removeFixtures = async () => {
    await prisma.guest.deleteMany({ where: { invitedBy: { in: [MIXED, ONLY] } } });
    await prisma.table.deleteMany({ where: { hostId: { in: [MIXED, ONLY] } } });
    await prisma.host.deleteMany({ where: { id: { in: [MIXED, ONLY] } } });
  };

  before(removeFixtures);
  beforeEach(async () => {
    mock.method(console, "error", () => {});
    // Fresh each time, since some tests switch tables between physical and digital.
    await removeFixtures();
    await prisma.host.create({
      data: {
        id: MIXED,
        name: "Mixed Family",
        capacity: 10,
        tables: {
          create: [
            { number: 9701, capacity: 2, cardType: "PHYSICAL" },
            { number: 9702, capacity: 2, cardType: "PHYSICAL" },
            { number: 9703, capacity: 2, cardType: "PHYSICAL" },
            { number: 9704, capacity: 2, cardType: "DIGITAL" },
            { number: 9705, capacity: 2, cardType: "DIGITAL" },
          ],
        },
      },
    });
    await prisma.host.create({
      data: {
        id: ONLY,
        name: "Printed Family",
        capacity: 4,
        tables: { create: [9711, 9712].map((number) => ({ number, capacity: 2, cardType: "PHYSICAL" as const })) },
      },
    });
  });
  afterEach(() => mock.restoreAll());
  after(async () => {
    await removeFixtures();
    await prisma.$disconnect();
  });

  describe("counting", () => {
    it("counts physical seats as taken and leaves the rest for approvals", async () => {
      const mixed = await getHostOccupancy(MIXED);
      assert.equal(mixed.capacity, 10);
      assert.equal(mixed.physicalSeats, 6);
      assert.equal(mixed.digitalCapacity, 4);
      assert.equal(mixed.remaining, 4);
      for (const table of mixed.tables.filter((t) => t.cardType === "PHYSICAL")) assert.equal(table.remaining, 0);
      assert.deepEqual(mixed.tables.filter((t) => t.remaining > 0).map((t) => t.number), [9704, 9705]);

      const only = await getHostOccupancy(ONLY);
      assert.deepEqual([only.physicalSeats, only.digitalCapacity, only.remaining], [4, 0, 0]);
    });

    it("works the same as before for a host with no physical tables", () => {
      const occupancy = hostOccupancy(
        { id: "h", name: "H", capacity: 5, tables: [{ number: 1, capacity: 4, cardType: "DIGITAL", hostId: "h" }] },
        1,
        new Map([[1, 1]]),
      );
      assert.deepEqual([occupancy.physicalSeats, occupancy.digitalCapacity, occupancy.remaining], [0, 5, 4]);
      assert.equal(occupancy.tables[0].remaining, 3);
    });

    it("shows hosts on the dashboard with their physical and digital places", async () => {
      const counts = await getDashboardCounts();
      const mixed = counts.hosts.find((h) => h.hostId === MIXED)!;
      assert.deepEqual([mixed.capacity, mixed.physicalSeats, mixed.digitalCapacity], [10, 6, 4]);
    });
  });

  describe("public requests", () => {
    it("are still taken by a host whose tables are all physical: an admin decides at approval", async () => {
      assert.equal(await hostHasCapacity(ONLY), true);
      assert.equal(acceptsRequests(await getHostOccupancy(ONLY)), true);
      const guest = await createGuestRequest({ name: "Zzphys Public Ann", email: "ann@phys-test.invalid", invitedBy: ONLY });
      assert.equal(guest.status, "PENDING");
    });
  });

  describe("approving", () => {
    it("only seats guests at digital tables", async () => {
      const seats: (number | null)[] = [];
      for (let i = 0; i < 4; i++) seats.push((await approveInvitation((await pending(MIXED)).id, ok)).guest.tableNumber);
      assert.deepEqual(seats, [9704, 9704, 9705, 9705]);
    });

    it("refuses once the digital places are gone, and says a physical table could be made digital", async () => {
      for (let i = 0; i < 4; i++) await approveInvitation((await pending(MIXED)).id, ok);
      await rejectsWith("HOST_FULL", approveInvitation((await pending(MIXED)).id, ok), /no digital places left.*make one of Mixed Family's physical tables digital/);
    });

    it("refuses for a host with only physical tables, pointing to another host or a digital table", async () => {
      const guest = await pending(ONLY);
      await rejectsWith("HOST_FULL", approveInvitation(guest.id, ok), /All of Printed Family's tables use physical cards.*Move the guest to another host, or make one of Printed Family's tables digital/);
      assert.equal((await prisma.guest.findUniqueOrThrow({ where: { id: guest.id } })).status, "PENDING");
    });

    it("works once a physical table is made digital", async () => {
      const guest = await pending(ONLY);
      assert.deepEqual(await setTableCardType(9711, "DIGITAL"), { hostName: "Printed Family", changed: true });
      const { guest: approved } = await approveInvitation(guest.id, ok);
      assert.equal(approved.tableNumber, 9711);
    });

    it("works after moving the guest to a host with digital places", async () => {
      const guest = await pending(ONLY);
      await updateGuestDetails(guest.id, { name: guest.name, email: guest.email, invitedBy: MIXED });
      assert.equal((await approveInvitation(guest.id, ok)).guest.tableNumber, 9704);
    });

    it("refuses to move an approved guest to a host with only physical tables", async () => {
      const { guest } = await approveInvitation((await pending(MIXED)).id, ok);
      await rejectsWith("HOST_FULL", updateGuestDetails(guest.id, { name: guest.name, email: guest.email, invitedBy: ONLY }), /physical cards/);
      assert.equal((await prisma.guest.findUniqueOrThrow({ where: { id: guest.id } })).invitedBy, MIXED);
    });
  });

  describe("changing table", () => {
    it("refuses a physical table, and says how to use it", async () => {
      const { guest } = await approveInvitation((await pending(MIXED)).id, ok);
      await rejectsWith("TABLE_FULL", updateGuestTable(guest.id, 9701), /Table 9701 uses physical cards.*make table 9701 digital first/);
      assert.equal((await prisma.guest.findUniqueOrThrow({ where: { id: guest.id } })).tableNumber, 9704);
    });
  });

  describe("switching a table's card type", () => {
    it("makes a digital table physical only once nobody is seated there", async () => {
      const { guest } = await approveInvitation((await pending(MIXED)).id, ok);
      await rejectsWith("TABLE_FULL", setTableCardType(9704, "PHYSICAL"), /1 approved guest is seated at table 9704\. Move them/);
      assert.equal((await prisma.table.findUniqueOrThrow({ where: { number: 9704 } })).cardType, "DIGITAL");

      await cancelGuest(guest.id);
      assert.equal((await setTableCardType(9704, "PHYSICAL")).changed, true);
      const occupancy = await getHostOccupancy(MIXED);
      assert.deepEqual([occupancy.physicalSeats, occupancy.digitalCapacity], [8, 2]);
    });

    it("does nothing when the table already has that type, and refuses an unknown table", async () => {
      assert.equal((await setTableCardType(9705, "DIGITAL")).changed, false);
      await rejectsWith("UNKNOWN_TABLE", setTableCardType(99999, "DIGITAL"));
    });

    it("can't be raced by an approval taking the seat at the same moment", async () => {
      const guest = await pending(MIXED);
      // Only table 9704 has seats if 9705 goes physical; both happen at once.
      await setTableCardType(9705, "PHYSICAL");
      const [approval, switched] = await Promise.allSettled([
        approveInvitation(guest.id, ok),
        setTableCardType(9704, "PHYSICAL"),
      ]);
      const seatedAt9704 = await prisma.guest.count({ where: { tableNumber: 9704, status: "APPROVED" } });
      const table = await prisma.table.findUniqueOrThrow({ where: { number: 9704 } });
      // Either the approval won (and the switch was refused), or the switch won (and the approval found no seat).
      if (table.cardType === "PHYSICAL") {
        assert.equal(seatedAt9704, 0, "no guest left at a physical table");
        assert.equal(approval.status, "rejected");
      } else {
        assert.equal(seatedAt9704, 1);
        assert.equal(switched.status, "rejected");
      }
    });
  });
});
