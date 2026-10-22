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

import {
  assignTable,
  createHost,
  deleteHost,
  getEventSettings,
  getHostsOverview,
  HostAdminError,
  renameHost,
  setHostAcceptingRequests,
  slugify,
  updateEventSettings,
  type HostAdminErrorCode,
} from "@/lib/data/host-admin";
import {
  cancelGuest,
  createGuest,
  createGuestRequest,
  getHostOccupancy,
} from "@/lib/data/guests";
import { getHostName, getPublicHost, getPublicHosts } from "@/lib/data/hosts";
import { approveInvitation } from "@/lib/invitations";
import { prisma } from "@/lib/prisma";

// Managing hosts and tables, against a real database. Own hosts (names starting
// "Zzhost") and tables 9801+, removed afterwards; only against a local
// database. The event-wide settings tests put the settings back as they found them.
const url = process.env.DATABASE_URL ?? "";
const isLocal =
  /^postgres(ql)?:\/\/[^@/]*@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);

const TABLES = [9801, 9802, 9803, 9804];
const ok = async () => ({ id: "test-email-id" });

async function rejectsWith(
  code: HostAdminErrorCode,
  promise: Promise<unknown>,
  message?: RegExp,
) {
  await assert.rejects(promise, (error) => {
    assert.ok(
      error instanceof HostAdminError,
      `expected HostAdminError, got ${error}`,
    );
    assert.equal(error.code, code);
    if (message) assert.match(error.message, message);
    return true;
  });
}
const capacityOf = async (id: string) =>
  (await prisma.host.findUniqueOrThrow({ where: { id } })).capacity;
const hostOf = async (number: number) =>
  (await prisma.table.findUniqueOrThrow({ where: { number } })).hostId;

describe("slugs", () => {
  it("makes a stable id from a host's name", () => {
    assert.equal(slugify("Kikelomo's Guests"), "kikelomos-guests");
    assert.equal(slugify("Ìyá Òpékè's Friends"), "iya-opekes-friends");
    assert.equal(
      slugify("  Prince  Adeniyi’s Guests!! "),
      "prince-adeniyis-guests",
    );
    assert.equal(slugify("!!!"), "host");
    assert.ok(slugify("x".repeat(80)).length <= 40);
  });
});

describe(
  "host management",
  { skip: !isLocal && "DATABASE_URL is not a local database" },
  () => {
    const removeFixtures = async () => {
      const hosts = (
        await prisma.host.findMany({
          where: { name: { startsWith: "Zzhost" } },
          select: { id: true },
        })
      ).map((h) => h.id);
      await prisma.guest.deleteMany({ where: { invitedBy: { in: hosts } } });
      await prisma.table.deleteMany({ where: { number: { in: TABLES } } });
      await prisma.host.deleteMany({ where: { id: { in: hosts } } });
    };

    before(removeFixtures);
    beforeEach(async () => {
      mock.method(console, "error", () => {});
      await removeFixtures();
      // Free tables to hand out, as if the event had a few more.
      await prisma.table.createMany({
        data: TABLES.map((number) => ({ number, capacity: 2, hostId: null })),
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

    describe("hosts", () => {
      it("creates a host with an id from its name, no tables, taking requests", async () => {
        const host = await createHost("  Zzhost  Kikelomo's Guests ");
        assert.deepEqual(host, {
          id: "zzhost-kikelomos-guests",
          name: "Zzhost Kikelomo's Guests",
        });
        const row = await prisma.host.findUniqueOrThrow({
          where: { id: host.id },
        });
        assert.equal(row.capacity, 0);
        assert.equal(row.acceptingRequests, true);
      });

      it("refuses a name another host has, in any case, and gives a different id to a lookalike", async () => {
        await createHost("Zzhost Same");
        await rejectsWith("NAME_TAKEN", createHost("zzhost same"));
        const lookalike = await createHost("Zzhost Same!");
        assert.equal(lookalike.id, "zzhost-same-2");
      });

      it("refuses names that are too short, too long or have control characters", async () => {
        for (const name of [
          "",
          " ",
          "Z",
          "Zzhost " + "x".repeat(60),
          "Zzhost\u0000bad",
          42,
        ]) {
          await rejectsWith("INVALID", createHost(name));
        }
      });

      it("renames a host, keeping its id, and refuses a name that's taken", async () => {
        const a = await createHost("Zzhost Alpha");
        await createHost("Zzhost Beta");
        const renamed = await renameHost(a.id, "Zzhost Alpha Family");
        assert.deepEqual(renamed, {
          id: a.id,
          name: "Zzhost Alpha Family",
          changed: true,
        });
        assert.equal(
          await getHostName(a.id),
          "Zzhost Alpha Family",
          "cards print the new name",
        );
        await rejectsWith("NAME_TAKEN", renameHost(a.id, "ZZHOST BETA"));
        assert.equal(
          (await renameHost(a.id, "Zzhost Alpha Family")).changed,
          false,
        );
        await rejectsWith(
          "NOT_FOUND",
          renameHost("no-such-host", "Zzhost Whatever"),
        );
      });

      it("hides a host from the public page and its requests, but not from admins or its guests' cards", async () => {
        const host = await createHost("Zzhost Hidden");
        await assignTable(9801, host.id);
        await setHostAcceptingRequests(host.id, false);

        assert.ok(!(await getPublicHosts()).some((h) => h.id === host.id));
        assert.equal(await getPublicHost(host.id), null);
        await assert.rejects(
          createGuestRequest({
            name: "Zzhost Public Guest",
            email: "p@host-test.invalid",
            invitedBy: host.id,
          }),
        );
        // An admin can still add and approve guests for it, and their cards still name it.
        const guest = await createGuest({
          name: "Zzhost Admin Guest",
          email: "a@host-test.invalid",
          invitedBy: host.id,
        });
        assert.equal(
          (await approveInvitation(guest.id, ok)).guest.tableNumber,
          9801,
        );
        assert.equal(await getHostName(host.id), "Zzhost Hidden");

        await setHostAcceptingRequests(host.id, true);
        assert.ok((await getPublicHosts()).some((h) => h.id === host.id));
      });

      it("deletes a host only when it has no guests and no tables", async () => {
        const host = await createHost("Zzhost Doomed");
        await assignTable(9801, host.id);
        await rejectsWith("IN_USE", deleteHost(host.id), /still has tables/);
        await assignTable(9801, null);

        const guest = await createGuest({
          name: "Zzhost Rejected One",
          email: "r@host-test.invalid",
          invitedBy: host.id,
        });
        await prisma.guest.update({
          where: { id: guest.id },
          data: { status: "REJECTED" },
        });
        await rejectsWith(
          "IN_USE",
          deleteHost(host.id),
          /1 guest record.*Hide it/,
        );
        await prisma.guest.delete({ where: { id: guest.id } });

        assert.deepEqual(await deleteHost(host.id), { name: "Zzhost Doomed" });
        assert.equal(await prisma.host.count({ where: { id: host.id } }), 0);
        await rejectsWith("NOT_FOUND", deleteHost(host.id));
      });
    });

    describe("tables", () => {
      it("gives a free table to a host, and its capacity follows the seats", async () => {
        const host = await createHost("Zzhost Grows");
        await assignTable(9801, host.id);
        await assignTable(9802, host.id);
        assert.equal(await capacityOf(host.id), 4);
        assert.equal((await getHostOccupancy(host.id)).capacity, 4);
      });

      it("moves a table between hosts, recalculating both, and keeps its card type", async () => {
        const a = await createHost("Zzhost From");
        const b = await createHost("Zzhost To");
        await assignTable(9801, a.id);
        await prisma.table.update({
          where: { number: 9801 },
          data: { cardType: "PHYSICAL" },
        });

        const moved = await assignTable(9801, b.id);
        assert.deepEqual(moved, {
          from: "Zzhost From",
          to: "Zzhost To",
          changed: true,
        });
        assert.deepEqual(
          [await capacityOf(a.id), await capacityOf(b.id)],
          [0, 2],
        );
        assert.equal(
          (await prisma.table.findUniqueOrThrow({ where: { number: 9801 } }))
            .cardType,
          "PHYSICAL",
        );
        assert.equal((await assignTable(9801, b.id)).changed, false);
      });

      it("gives a table up, back to nobody", async () => {
        const host = await createHost("Zzhost Shrinks");
        await assignTable(9801, host.id);
        await assignTable(9801, null);
        assert.equal(await hostOf(9801), null);
        assert.equal(await capacityOf(host.id), 0);
      });

      it("refuses to move a table while approved guests are seated there, changing nothing", async () => {
        const a = await createHost("Zzhost Busy");
        const b = await createHost("Zzhost Wants");
        await assignTable(9801, a.id);
        const guest = await createGuest({
          name: "Zzhost Seated",
          email: "s@host-test.invalid",
          invitedBy: a.id,
        });
        await approveInvitation(guest.id, ok);

        await rejectsWith(
          "TABLE_BUSY",
          assignTable(9801, b.id),
          /1 approved guest is seated at table 9801\. Move them/,
        );
        await rejectsWith("TABLE_BUSY", assignTable(9801, null));
        assert.equal(await hostOf(9801), a.id);
        assert.deepEqual(
          [await capacityOf(a.id), await capacityOf(b.id)],
          [2, 0],
        );

        // Once the guest is no longer seated there (cancelled), the table can go.
        await cancelGuest(guest.id);
        assert.equal((await assignTable(9801, b.id)).changed, true);
      });

      it("refuses an unknown table or host", async () => {
        await rejectsWith("TABLE_NOT_FOUND", assignTable(99999, null));
        await rejectsWith("NOT_FOUND", assignTable(9801, "no-such-host"));
        assert.equal(await hostOf(9801), null);
      });

      it("can't be raced: an approval and the table moving away never both win", async () => {
        const a = await createHost("Zzhost Race From");
        const b = await createHost("Zzhost Race To");
        await assignTable(9801, a.id);
        const guest = await createGuest({
          name: "Zzhost Racer",
          email: "race@host-test.invalid",
          invitedBy: a.id,
        });
        const [approval, move] = await Promise.allSettled([
          approveInvitation(guest.id, ok),
          assignTable(9801, b.id),
        ]);
        const table = await prisma.table.findUniqueOrThrow({
          where: { number: 9801 },
        });
        const seated = await prisma.guest.count({
          where: { tableNumber: 9801, status: "APPROVED" },
        });
        if (table.hostId === b.id) {
          assert.equal(
            seated,
            0,
            "the table moved, so nobody of A's is seated there",
          );
          assert.equal(approval.status, "rejected");
        } else {
          assert.equal(seated, 1);
          assert.equal(move.status, "rejected");
        }
      });
    });

    describe("the overview", () => {
      it("lists each host's tables, seats and guests, and the free tables", async () => {
        const host = await createHost("Zzhost Overview");
        await assignTable(9801, host.id);
        await assignTable(9802, host.id);
        await prisma.table.update({
          where: { number: 9802 },
          data: { cardType: "PHYSICAL" },
        });
        const seated = await createGuest({
          name: "Zzhost Over One",
          email: "o1@host-test.invalid",
          invitedBy: host.id,
        });
        await approveInvitation(seated.id, ok);
        await createGuest({
          name: "Zzhost Over Two",
          email: "o2@host-test.invalid",
          invitedBy: host.id,
        });

        const overview = await getHostsOverview();
        const summary = overview.hosts.find((h) => h.id === host.id)!;
        assert.equal(summary.capacity, 4);
        assert.equal(summary.physicalSeats, 2);
        assert.deepEqual(
          summary.tables.map((t) => [t.number, t.cardType, t.seated]),
          [
            [9801, "DIGITAL", 1],
            [9802, "PHYSICAL", 0],
          ],
        );
        assert.deepEqual(summary.guests, {
          pending: 1,
          approved: 1,
          rejected: 0,
          cancelled: 0,
          checkedIn: 0,
        });
        assert.ok(overview.unassigned.some((t) => t.number === 9803));
        assert.ok(!overview.unassigned.some((t) => t.number === 9801));
      });
    });
  },
);

describe(
  "event settings",
  { skip: !isLocal && "DATABASE_URL is not a local database" },
  () => {
    let original: { maxTables: number; seatsPerTable: number };
    before(async () => {
      original = await getEventSettings();
    });
    after(async () => {
      await updateEventSettings(original);
      await prisma.$disconnect();
    });

    it("refuses numbers that aren't sensible", async () => {
      for (const input of [
        { maxTables: 0, seatsPerTable: 10 },
        { maxTables: 80.5, seatsPerTable: 10 },
        { maxTables: "x", seatsPerTable: 10 },
        { maxTables: 80, seatsPerTable: 0 },
        { maxTables: 501, seatsPerTable: 10 },
      ]) {
        await rejectsWith("INVALID", updateEventSettings(input));
      }
      assert.deepEqual(await getEventSettings(), original);
    });

    it("adds tables, unassigned and digital, and removes them again", async () => {
      const more = original.maxTables + 2;
      await updateEventSettings({
        maxTables: more,
        seatsPerTable: original.seatsPerTable,
      });
      const added = await prisma.table.findMany({
        where: { number: { gt: original.maxTables } },
        orderBy: { number: "asc" },
      });
      assert.deepEqual(
        added.map((t) => [t.number, t.hostId, t.cardType, t.capacity]),
        [
          [original.maxTables + 1, null, "DIGITAL", original.seatsPerTable],
          [original.maxTables + 2, null, "DIGITAL", original.seatsPerTable],
        ],
      );
      await updateEventSettings(original);
      assert.equal(
        await prisma.table.count({
          where: { number: { gt: original.maxTables } },
        }),
        0,
      );
    });

    it("refuses fewer tables while a table above the limit belongs to a host", async () => {
      const host = await createHost("Zzhost Above");
      await updateEventSettings({
        maxTables: original.maxTables + 1,
        seatsPerTable: original.seatsPerTable,
      });
      await assignTable(original.maxTables + 1, host.id);
      await rejectsWith(
        "TABLE_BUSY",
        updateEventSettings(original),
        new RegExp(`Table ${original.maxTables + 1} is still in use`),
      );
      await assignTable(original.maxTables + 1, null);
      await deleteHost(host.id);
      await updateEventSettings(original);
    });

    it("changes every table's seats, and every host's capacity follows", async () => {
      const host = await prisma.host.findFirst({
        where: { tables: { some: {} } },
        include: { tables: true },
      });
      if (!host) return; // a database with no hosts yet has nothing to recalculate
      await updateEventSettings({
        maxTables: original.maxTables,
        seatsPerTable: original.seatsPerTable + 1,
      });
      assert.equal(
        await capacityOf(host.id),
        host.tables.length * (original.seatsPerTable + 1),
      );
      await updateEventSettings(original);
      assert.equal(
        await capacityOf(host.id),
        host.tables.length * original.seatsPerTable,
      );
    });
  },
);

describe("who can manage hosts", () => {
  const actions = readFileSync("lib/actions/hosts.ts", "utf8");

  it("makes every host action check for an active super admin before anything else", () => {
    const names = [...actions.matchAll(/export async function (\w+Action)\(/g)].map((m) => m[1]);
    assert.deepEqual(names.sort(), [
      "assignTableAction",
      "createHostAction",
      "deleteHostAction",
      "renameHostAction",
      "setHostAcceptingRequestsAction",
      "setTableTypeAction",
      "updateEventSettingsAction",
    ]);
    for (const name of names) {
      const start = actions.indexOf(`function ${name}(`);
      const next = actions.indexOf("\nexport ", start + 1);
      const body = actions.slice(start, next < 0 ? undefined : next);
      const check = body.indexOf("await requireSuperAdmin()");
      assert.ok(check > 0, `${name} checks for a super admin`);
      assert.doesNotMatch(body.slice(0, check), /await\s+[A-Za-z]/, `${name} awaits nothing first`);
    }
  });

  it("checks for a super admin on both pages before reading anything", () => {
    for (const file of ["components/app/admin/hosts/hosts-overview.tsx", "components/app/admin/hosts/host-detail.tsx"]) {
      const source = readFileSync(file, "utf8");
      const check = source.indexOf("await requireSuperAdmin()");
      const read = source.search(/await getHost(sOverview|Summary)\(/);
      assert.ok(check > 0 && read > check, `${file}: the admin is checked before the hosts are read`);
    }
    assert.doesNotMatch(actions, /requireAdmin\(\)/, "no host action settles for an ordinary admin");
  });

  it("makes requireSuperAdmin() refuse an ordinary admin, not just a signed-out visitor", () => {
    const session = readFileSync("lib/admin-session.ts", "utf8");
    const body = session.slice(session.indexOf("export async function requireSuperAdmin"));
    assert.match(body, /const session = await requireAdmin\(\);\s*if \(!isSuperAdmin\(session\.user\)\) redirect\("\/admin"\);/);
  });

  it("shows host management links only to super admins", () => {
    assert.match(readFileSync("components/app/admin/admin-frame.tsx", "utf8"), /isSuperAdmin\(user\) && \(/);
    assert.match(readFileSync("components/app/admin/dashboard.tsx", "utf8"), /canManage=\{isSuperAdmin\(user\)\}/);
  });
});
