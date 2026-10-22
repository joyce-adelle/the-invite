import "./no-email"; // first: nothing here may send real email
import "dotenv/config";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  after,
  afterEach,
  before,
  beforeEach,
  describe,
  it,
  mock,
} from "node:test";

import { checkInGuest } from "@/lib/data/check-in";
import { createGuest, setTableCardType } from "@/lib/data/guests";
import { assignTable, HostAdminError } from "@/lib/data/host-admin";
import {
  getCheckInProgress,
  listHostsForCards,
  lookupPhysicalTable,
  recordPhysicalArrivals,
  undoPhysicalArrival,
} from "@/lib/data/physical-check-in";
import { approveInvitation } from "@/lib/invitations";
import { prisma } from "@/lib/prisma";

// Counting in guests with printed cards, and the check-in progress view,
// against a real database. Own hosts ("test-print-…"), tables 9901+ and users
// ("tprint…"), removed afterwards; only against a local database.
const url = process.env.DATABASE_URL ?? "";
const isLocal =
  /^postgres(ql)?:\/\/[^@/]*@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);

const HOST = "test-print-a"; // tables 9901, 9902 printed (3 seats each), 9903 QR
const OTHER = "test-print-b"; // table 9911 printed
const STAFF = "tprint-door";
const OTHER_STAFF = "tprint-door2";
const ok = async () => ({ id: "test-email-id" });

const arrived = async (table: number) =>
  (
    await prisma.physicalArrival.aggregate({
      where: { tableNumber: table, undoneAt: null },
      _sum: { count: true },
    })
  )._sum.count ?? 0;

describe(
  "printed-card check-in",
  { skip: !isLocal && "DATABASE_URL is not a local database" },
  () => {
    const removeFixtures = async () => {
      await prisma.physicalArrival.deleteMany({
        where: { tableNumber: { in: [9901, 9902, 9903, 9911, 9912] } },
      });
      await prisma.guest.deleteMany({
        where: { invitedBy: { in: [HOST, OTHER] } },
      });
      await prisma.table.deleteMany({
        where: { number: { in: [9901, 9902, 9903, 9911, 9912] } },
      });
      await prisma.host.deleteMany({ where: { id: { in: [HOST, OTHER] } } });
      await prisma.user.deleteMany({
        where: { id: { in: [STAFF, OTHER_STAFF] } },
      });
    };

    before(removeFixtures);
    beforeEach(async () => {
      mock.method(console, "error", () => {});
      await removeFixtures();
      for (const id of [STAFF, OTHER_STAFF]) {
        await prisma.user.create({
          data: {
            id,
            name: id,
            email: `${id}@print-test.invalid`,
            username: id,
            role: "check_in",
          },
        });
      }
      await prisma.host.create({
        data: {
          id: HOST,
          name: "Print Family",
          capacity: 9,
          tables: {
            create: [
              { number: 9901, capacity: 3, cardType: "PHYSICAL" },
              { number: 9902, capacity: 3, cardType: "PHYSICAL" },
              { number: 9903, capacity: 3, cardType: "DIGITAL" },
            ],
          },
        },
      });
      await prisma.host.create({
        data: {
          id: OTHER,
          name: "Other Print",
          capacity: 3,
          tables: {
            create: [{ number: 9911, capacity: 3, cardType: "PHYSICAL" }],
          },
        },
      });
      await prisma.table.create({
        data: { number: 9912, capacity: 3, cardType: "PHYSICAL", hostId: null },
      });
    });
    afterEach(async () => {
      mock.restoreAll();
      await removeFixtures();
    });
    after(async () => {
      await removeFixtures();
      await prisma.$disconnect();
    });

    describe("checking the card", () => {
      it("finds the host's printed table, with nothing counted yet", async () => {
        const result = await lookupPhysicalTable(HOST, 9901);
        assert.equal(result.outcome, "ok");
        assert.ok(result.outcome === "ok");
        assert.deepEqual(
          { ...result.table, entries: result.table.entries.length },
          {
            tableNumber: 9901,
            hostId: HOST,
            hostName: "Print Family",
            capacity: 3,
            arrived: 0,
            entries: 0,
          },
        );
      });

      it("says when the table is another host's, nobody's, a QR table, or doesn't exist", async () => {
        assert.deepEqual(await lookupPhysicalTable(HOST, 9911), {
          outcome: "wrong-host",
          tableNumber: 9911,
          hostName: "Print Family",
          actualHostName: "Other Print",
        });
        assert.deepEqual(await lookupPhysicalTable(HOST, 9912), {
          outcome: "wrong-host",
          tableNumber: 9912,
          hostName: "Print Family",
          actualHostName: null,
        });
        assert.deepEqual(await lookupPhysicalTable(HOST, 9903), {
          outcome: "digital",
          tableNumber: 9903,
          hostName: "Print Family",
        });
        assert.deepEqual(await lookupPhysicalTable(HOST, 99999), {
          outcome: "not-found",
          tableNumber: 99999,
        });
        assert.deepEqual(await lookupPhysicalTable("no-such-host", 9901), {
          outcome: "not-found",
          tableNumber: 9901,
        });
      });

      it("offers staff only hosts that have printed tables", async () => {
        const hosts = (await listHostsForCards()).map((h) => h.id);
        assert.ok(hosts.includes(HOST) && hosts.includes(OTHER));
      });
    });

    describe("counting arrivals", () => {
      it("adds arrivals up, recording who counted them, and reports the table full", async () => {
        const first = await recordPhysicalArrivals(HOST, 9901, 2, STAFF);
        assert.equal(first.outcome, "recorded");
        assert.ok(first.outcome === "recorded");
        assert.equal(first.table.arrived, 2);
        assert.equal(first.table.entries[0].recordedBy, STAFF);

        const second = await recordPhysicalArrivals(HOST, 9901, 1, OTHER_STAFF);
        assert.ok(second.outcome === "recorded");
        assert.equal(second.table.arrived, 3);
        assert.deepEqual(
          second.table.entries.map((e) => [e.count, e.recordedBy]),
          [
            [1, OTHER_STAFF],
            [2, STAFF],
          ],
        );
      });

      it("never goes past the table's seats, and records nothing when it would", async () => {
        await recordPhysicalArrivals(HOST, 9901, 2, STAFF);
        const tooMany = await recordPhysicalArrivals(HOST, 9901, 2, STAFF);
        assert.equal(tooMany.outcome, "too-many");
        assert.ok(tooMany.outcome === "too-many");
        assert.equal(tooMany.remaining, 1);
        assert.equal(await arrived(9901), 2);
      });

      it("refuses a card that doesn't match, recording nothing", async () => {
        assert.equal(
          (await recordPhysicalArrivals(HOST, 9911, 1, STAFF)).outcome,
          "wrong-host",
        );
        assert.equal(
          (await recordPhysicalArrivals(HOST, 9903, 1, STAFF)).outcome,
          "digital",
        );
        assert.equal(
          await prisma.physicalArrival.count({
            where: { tableNumber: { in: [9911, 9903] } },
          }),
          0,
        );
        await assert.rejects(recordPhysicalArrivals(HOST, 9901, 0, STAFF));
      });

      it("lets exactly as many in as there are seats when phones record at the same moment", async () => {
        const results = await Promise.all(
          Array.from({ length: 6 }, (_, i) =>
            recordPhysicalArrivals(HOST, 9902, 1, i % 2 ? STAFF : OTHER_STAFF),
          ),
        );
        assert.equal(results.filter((r) => r.outcome === "recorded").length, 3);
        assert.equal(results.filter((r) => r.outcome === "too-many").length, 3);
        assert.equal(await arrived(9902), 3);
      });
    });

    describe("undoing a mistake", () => {
      it("takes the entry off the count, keeps it with who undid it, and only once", async () => {
        const recorded = await recordPhysicalArrivals(HOST, 9901, 2, STAFF);
        assert.ok(recorded.outcome === "recorded");
        const id = recorded.table.entries[0].id;

        const undone = await undoPhysicalArrival(id, OTHER_STAFF);
        assert.equal(undone.outcome, "undone");
        assert.ok(undone.outcome === "undone");
        assert.equal(undone.table.arrived, 0);
        assert.equal(undone.table.entries[0].undoneBy, OTHER_STAFF);
        const row = await prisma.physicalArrival.findUniqueOrThrow({
          where: { id },
        });
        assert.ok(row.undoneAt);

        assert.equal(
          (await undoPhysicalArrival(id, STAFF)).outcome,
          "already-undone",
        );
        assert.equal(
          (
            await undoPhysicalArrival(
              "00000000-0000-4000-8000-000000000000",
              STAFF,
            )
          ).outcome,
          "not-found",
        );
        // The seats are free again.
        assert.equal(
          (await recordPhysicalArrivals(HOST, 9901, 3, STAFF)).outcome,
          "recorded",
        );
      });

      it("can't be half recorded, or count nobody: the database refuses", async () => {
        await assert.rejects(
          prisma.physicalArrival.create({
            data: { tableNumber: 9901, count: 0, recordedBy: STAFF },
          }),
        );
        const entry = await prisma.physicalArrival.create({
          data: { tableNumber: 9901, count: 1, recordedBy: STAFF },
        });
        await assert.rejects(
          prisma.physicalArrival.update({
            where: { id: entry.id },
            data: { undoneAt: new Date() },
          }),
        );
      });
    });

    describe("protecting counted tables", () => {
      it("won't move a table, or make it QR, once printed-card guests have been counted in", async () => {
        await recordPhysicalArrivals(HOST, 9901, 1, STAFF);
        await assert.rejects(
          assignTable(9901, OTHER),
          (e) =>
            e instanceof HostAdminError &&
            /already been counted in at table 9901/.test(e.message),
        );
        await assert.rejects(
          setTableCardType(9901, "DIGITAL"),
          /already been counted in at table 9901/,
        );
        const table = await prisma.table.findUniqueOrThrow({
          where: { number: 9901 },
        });
        assert.deepEqual([table.hostId, table.cardType], [HOST, "PHYSICAL"]);
      });

      it("lets it move again once the count is undone", async () => {
        const recorded = await recordPhysicalArrivals(HOST, 9901, 1, STAFF);
        assert.ok(recorded.outcome === "recorded");
        await undoPhysicalArrival(recorded.table.entries[0].id, STAFF);
        assert.equal((await assignTable(9901, OTHER)).changed, true);
      });
    });

    describe("progress", () => {
      it("counts printed and QR arrivals against what's expected, per host and table", async () => {
        await recordPhysicalArrivals(HOST, 9901, 2, STAFF);
        const a = await approveInvitation(
          (
            await createGuest({
              name: "Zzprint Qr One",
              email: "q1@print-test.invalid",
              invitedBy: HOST,
            })
          ).id,
          ok,
        );
        await approveInvitation(
          (
            await createGuest({
              name: "Zzprint Qr Two",
              email: "q2@print-test.invalid",
              invitedBy: HOST,
            })
          ).id,
          ok,
        );
        await checkInGuest(a.guest.checkInToken!, STAFF);

        const progress = await getCheckInProgress({ withRecent: false });
        const host = progress.hosts.find((h) => h.id === HOST)!;
        assert.deepEqual(host.physical, { expected: 6, arrived: 2 });
        assert.deepEqual(host.digital, { expected: 2, arrived: 1 });
        assert.deepEqual(
          host.tables.map((t) => [t.number, t.cardType, t.expected, t.arrived]),
          [
            [9901, "PHYSICAL", 3, 2],
            [9902, "PHYSICAL", 3, 0],
            [9903, "DIGITAL", 2, 1],
          ],
        );
        assert.ok(
          progress.physical.expected >= 6 && progress.digital.expected >= 2,
        );
      });

      it("has no names for check-in accounts, and the latest arrivals for admins", async () => {
        await recordPhysicalArrivals(HOST, 9901, 1, STAFF);
        const g = await approveInvitation(
          (
            await createGuest({
              name: "Zzprint Named",
              email: "n@print-test.invalid",
              invitedBy: HOST,
            })
          ).id,
          ok,
        );
        await checkInGuest(g.guest.checkInToken!, OTHER_STAFF);

        const staff = await getCheckInProgress({ withRecent: false });
        assert.equal(staff.recent, null);
        assert.ok(
          !JSON.stringify(staff).includes("Zzprint Named"),
          "no guest names at all",
        );

        const admin = await getCheckInProgress({ withRecent: true });
        assert.ok(
          admin.recent?.some(
            (r) =>
              r.kind === "qr" &&
              r.guestName === "Zzprint Named" &&
              r.by === OTHER_STAFF,
          ),
        );
        assert.ok(
          admin.recent?.some(
            (r) =>
              r.kind === "physical" &&
              r.tableNumber === 9901 &&
              r.count === 1 &&
              r.by === STAFF,
          ),
        );
      });
    });
  },
);

describe("who can count printed cards", () => {
  const actions = readFileSync("lib/actions/physical-check-in.ts", "utf8");

  it("makes every action check for an active check-in or admin session before anything else", () => {
    const names = [
      ...actions.matchAll(/export async function (\w+Action)\(/g),
    ].map((m) => m[1]);
    assert.deepEqual(names.sort(), [
      "lookupPhysicalTableAction",
      "recordPhysicalArrivalsAction",
      "undoPhysicalArrivalAction",
    ]);
    for (const name of names) {
      const start = actions.indexOf(`function ${name}(`);
      const next = actions.indexOf("\nexport ", start + 1);
      const body = actions.slice(start, next < 0 ? undefined : next);
      const check = body.indexOf("await getCheckInSession()");
      assert.ok(check > 0, `${name} checks the session`);
      assert.doesNotMatch(
        body.slice(0, check),
        /await\s+[A-Za-z]/,
        `${name} awaits nothing first`,
      );
      assert.match(
        body,
        /if \(!session\) return \{ outcome: "unauthorized" \}/,
      );
    }
    // Whoever is recorded comes from the session, never the browser.
    assert.match(
      actions,
      /const session = await getCheckInSession\(\);\s*if \(!session\) return \{ outcome: "unauthorized" \};\s*try \{\s*return await operation\(session\.user\.id\)/,
    );
  });

  it("gives guest names on the progress page to admins only", () => {
    const view = readFileSync(
      "components/app/check-in/check-in-progress.tsx",
      "utf8",
    );
    assert.match(view, /const \{ user \} = await requireCheckIn\(\);/);
    assert.match(view, /getCheckInProgress\(\{ withRecent: admin \}\)/);
    assert.match(view, /const admin = isAdmin\(user\);/);
  });

  it("checks the session on the printed-cards page before reading anything", () => {
    const page = readFileSync(
      "components/app/check-in/printed-cards.tsx",
      "utf8",
    );
    assert.ok(
      page.indexOf("await requireCheckIn()") <
        page.indexOf("await listHostsForCards()"),
    );
  });
});
