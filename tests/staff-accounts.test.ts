import "./no-email"; // first: nothing here may send real email
import "dotenv/config";

import assert from "node:assert/strict";
import {
  after,
  afterEach,
  before,
  beforeEach,
  describe,
  it,
  mock,
} from "node:test";

import { upsertAdmin } from "@/lib/admin-account";
import { auth } from "@/lib/auth";
import {
  createStaffAccount,
  listStaffAccounts,
  resetStaffAccountPassword as resetCheckInUserPassword,
  setStaffAccountDisabled as setCheckInUserDisabled,
  StaffAccountError as CheckInUserError,
  type StaffAccountErrorCode as CheckInUserErrorCode,
} from "@/lib/staff-accounts";
import { checkInGuest } from "@/lib/data/check-in";
import { createGuest } from "@/lib/data/guests";
import { approveInvitation } from "@/lib/invitations";
import { prisma } from "@/lib/prisma";
import { canCheckIn, homeFor, isAdmin, ROLE } from "@/lib/roles";
import {
  parseNewAccount,
  parsePassword,
  type NewAccountInput,
} from "@/lib/validation/account";

const createCheckInUser = (headers: Headers, input: NewAccountInput) =>
  createStaffAccount(headers, input, ROLE.CHECK_IN);
const createAdminUser = (headers: Headers, input: NewAccountInput) =>
  createStaffAccount(headers, input, ROLE.ADMIN);
const listCheckInUsers = () => listStaffAccounts(ROLE.CHECK_IN);
const listAdminUsers = () => listStaffAccounts(ROLE.ADMIN);

// Check-in accounts end to end against the real database and Better Auth:
// made by an admin, signing in by username, what each role may do, disabling,
// and password resets. Accounts are named "tcu…" and removed afterwards, so
// these only run against a local database.
const url = process.env.DATABASE_URL ?? "";
const isLocal =
  /^postgres(ql)?:\/\/[^@/]*@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);

const ADMIN = { username: "tcu_admin", password: "admin password 1" };
const PASSWORD = "door password 1";
const HOST_ID = "test-checkin-users";

type SignIn =
  | { ok: true; headers: Headers; userId: string }
  | { ok: false; status: unknown; code?: string };

/** Signs in through Better Auth, as the login page does, and returns request headers carrying that session. */
async function signIn(username: string, password: string): Promise<SignIn> {
  try {
    const { headers, response } = await auth.api.signInUsername({
      body: { username, password },
      returnHeaders: true,
    });
    const cookie = headers
      .getSetCookie()
      .map((line) => line.split(";")[0])
      .join("; ");
    return {
      ok: true,
      headers: new Headers({ cookie }),
      userId: response!.user.id,
    };
  } catch (error) {
    const e = error as { status?: unknown; body?: { code?: string } };
    return { ok: false, status: e.status, code: e.body?.code };
  }
}
async function signedIn(username: string, password: string) {
  const result = await signIn(username, password);
  assert.ok(result.ok, `${username} signs in`);
  return result.headers;
}
const sessionOf = (headers: Headers) => auth.api.getSession({ headers });

async function rejectsWith(
  code: CheckInUserErrorCode,
  promise: Promise<unknown>,
) {
  await assert.rejects(promise, (error) => {
    assert.ok(
      error instanceof CheckInUserError,
      `expected CheckInUserError, got ${error}`,
    );
    assert.equal(error.code, code);
    return true;
  });
}

describe(
  "check-in accounts",
  { skip: !isLocal && "DATABASE_URL is not a local database" },
  () => {
    let admin: Headers;

    const clean = async () => {
      await prisma.guest.deleteMany({ where: { invitedBy: HOST_ID } });
      await prisma.user.deleteMany({
        where: { username: { startsWith: "tcu" } },
      });
    };

    before(async () => {
      await clean();
      await prisma.table.deleteMany({ where: { hostId: HOST_ID } });
      await prisma.host.deleteMany({ where: { id: HOST_ID } });
      await prisma.host.create({
        data: {
          id: HOST_ID,
          name: "Door Family",
          capacity: 10,
          tables: { create: [{ number: 9601, capacity: 10 }] },
        },
      });
    });
    beforeEach(async () => {
      // The seed's admin is the default one, as ADMIN_USERNAME names it in production.
      process.env.ADMIN_USERNAME = ADMIN.username;
      mock.method(console, "error", () => {});
      mock.method(console, "info", () => {});
      await upsertAdmin(prisma, ADMIN);
      admin = await signedIn(ADMIN.username, ADMIN.password);
    });
    afterEach(async () => {
      mock.restoreAll();
      await clean();
    });
    after(async () => {
      await clean();
      await prisma.table.deleteMany({ where: { hostId: HOST_ID } });
      await prisma.host.deleteMany({ where: { id: HOST_ID } });
      await prisma.$disconnect();
    });

    describe("an admin making one", () => {
      it("creates a check-in account that signs in by username and password, with no email needed", async () => {
        const made = await createCheckInUser(admin, {
          username: "TCU_Door1",
          password: PASSWORD,
        });
        assert.deepEqual(Object.keys(made).sort(), [
          "createdAt",
          "disabled",
          "id",
          "isDefaultAdmin",
          "role",
          "updatedAt",
          "username",
        ]);
        assert.equal(made.username, "TCU_Door1");
        assert.equal(made.disabled, false);

        const row = await prisma.user.findUniqueOrThrow({
          where: { id: made.id },
          include: { accounts: true },
        });
        assert.equal(row.role, ROLE.CHECK_IN);
        assert.equal(row.username, "tcu_door1", "stored lowercased");
        assert.equal(row.banned, false);
        assert.equal(row.accounts.length, 1);
        assert.equal(row.accounts[0].providerId, "credential");
        assert.ok(
          row.accounts[0].password &&
            !row.accounts[0].password.includes(PASSWORD),
          "only a hash is stored",
        );

        const login = await signIn("tcu_door1", PASSWORD);
        assert.ok(login.ok);
        const session = await sessionOf(login.headers);
        assert.equal(session?.user.role, ROLE.CHECK_IN);
      });

      it("lists check-in accounts with their status, never a password, and never an admin", async () => {
        await createCheckInUser(admin, {
          username: "tcu_list_b",
          password: PASSWORD,
        });
        const a = await createCheckInUser(admin, {
          username: "tcu_list_a",
          password: PASSWORD,
        });
        await setCheckInUserDisabled(admin, a.id, true);

        const listed = (await listCheckInUsers()).filter((u) =>
          u.username.startsWith("tcu"),
        );
        assert.deepEqual(
          listed.map((u) => [u.username, u.disabled]),
          [
            ["tcu_list_b", false],
            ["tcu_list_a", true],
          ],
          "active first",
        );
        for (const user of listed)
          assert.ok(
            !("password" in user) &&
              !("email" in user) &&
              user.role === ROLE.CHECK_IN,
          );
        assert.ok(
          !listed.some((u) => u.username === ADMIN.username),
          "the admin isn't in the list",
        );
      });

      it("refuses a username that is taken, by any account, in any case", async () => {
        await createCheckInUser(admin, {
          username: "tcu_taken",
          password: PASSWORD,
        });
        await rejectsWith(
          "USERNAME_TAKEN",
          createCheckInUser(admin, {
            username: "TCU_TAKEN",
            password: PASSWORD,
          }),
        );
        await rejectsWith(
          "USERNAME_TAKEN",
          createCheckInUser(admin, {
            username: ADMIN.username,
            password: PASSWORD,
          }),
        );
        assert.equal(
          await prisma.user.count({ where: { username: "tcu_taken" } }),
          1,
        );
      });

      it("gives only one of two simultaneous requests for the same username", async () => {
        const results = await Promise.allSettled([
          createCheckInUser(admin, {
            username: "tcu_race",
            password: PASSWORD,
          }),
          createCheckInUser(admin, {
            username: "tcu_race",
            password: PASSWORD,
          }),
        ]);
        assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
        const failed = results.find(
          (r) => r.status === "rejected",
        ) as PromiseRejectedResult;
        assert.ok(
          failed.reason instanceof CheckInUserError &&
            failed.reason.code === "USERNAME_TAKEN",
        );
        assert.equal(
          await prisma.user.count({ where: { username: "tcu_race" } }),
          1,
        );
      });

      it("validates usernames and passwords the same way in the form and on the server", () => {
        assert.ok(
          parseNewAccount({ username: " Door.Staff_2 ", password: "12345678" })
            .success,
        );
        const bad = parseNewAccount({ username: "a b", password: "short" });
        assert.ok(
          !bad.success && bad.fieldErrors.username && bad.fieldErrors.password,
        );
        for (const username of [
          "ab",
          "x".repeat(31),
          "bad!",
          "tést",
          "",
          "has space",
        ]) {
          assert.equal(
            parseNewAccount({ username, password: PASSWORD }).success,
            false,
            JSON.stringify(username),
          );
        }
        assert.equal(
          parseNewAccount({ username: "fine", password: 42 }).success,
          false,
        );
        assert.equal(parsePassword("x".repeat(7)).success, false);
        assert.equal(parsePassword("x".repeat(129)).success, false);
        assert.equal(parsePassword("x".repeat(8)).success, true);
      });
    });

    describe("what a check-in account may not do", () => {
      let door: Headers;
      let doorId: string;
      beforeEach(async () => {
        doorId = (
          await createCheckInUser(admin, {
            username: "tcu_door",
            password: PASSWORD,
          })
        ).id;
        door = await signedIn("tcu_door", PASSWORD);
      });

      it("has no admin rights by role", async () => {
        const session = (await sessionOf(door))!;
        assert.equal(isAdmin(session.user), false);
        assert.equal(canCheckIn(session.user), true);
        assert.equal(homeFor(session.user), "/check-in");
      });

      it("can't make accounts, admins or otherwise: Better Auth refuses it", async () => {
        await rejectsWith(
          "FORBIDDEN",
          createCheckInUser(door, {
            username: "tcu_sneaky",
            password: PASSWORD,
          }),
        );
        await assert.rejects(
          auth.api.createUser({
            headers: door,
            body: {
              email: "x@check-in.invalid",
              name: "x",
              password: PASSWORD,
              role: ROLE.ADMIN,
            },
          }),
        );
        assert.equal(
          await prisma.user.count({ where: { username: "tcu_sneaky" } }),
          0,
        );
      });

      it("can't change its own role, or anyone's", async () => {
        await assert.rejects(
          auth.api.setRole({
            headers: door,
            body: { userId: doorId, role: ROLE.ADMIN },
          }),
        );
        await assert.rejects(
          auth.api.adminUpdateUser({
            headers: door,
            body: { userId: doorId, data: { role: ROLE.ADMIN } },
          }),
        );
        assert.equal(
          (await prisma.user.findUniqueOrThrow({ where: { id: doorId } })).role,
          ROLE.CHECK_IN,
        );
      });

      it("can't disable, re-enable or reset the password of any account, itself included", async () => {
        const other = await createCheckInUser(admin, {
          username: "tcu_other",
          password: PASSWORD,
        });
        await rejectsWith(
          "FORBIDDEN",
          setCheckInUserDisabled(door, other.id, true),
        );
        await rejectsWith(
          "FORBIDDEN",
          resetCheckInUserPassword(door, other.id, "a new password"),
        );
        await rejectsWith(
          "FORBIDDEN",
          resetCheckInUserPassword(door, doorId, "a new password"),
        );
        assert.equal(
          (await prisma.user.findUniqueOrThrow({ where: { id: other.id } }))
            .banned,
          false,
        );
        assert.ok(
          (await signIn("tcu_other", PASSWORD)).ok,
          "the other account's password is unchanged",
        );
      });

      it("can check a guest in, and is recorded as the one who did", async () => {
        const guest = (
          await approveInvitation(
            (
              await createGuest({
                name: "Door Guest",
                email: "door@tcu.invalid",
                invitedBy: HOST_ID,
              })
            ).id,
            async () => ({ id: "x" }),
          )
        ).guest;
        const session = (await sessionOf(door))!;
        const result = await checkInGuest(guest.checkInToken!, session.user.id);
        assert.equal(result.outcome, "checked-in");
        assert.ok("guest" in result);
        assert.equal(result.guest.checkedInBy, "tcu_door", "shown by username");
        assert.equal(
          (await prisma.guest.findUniqueOrThrow({ where: { id: guest.id } }))
            .checkedInBy,
          doorId,
        );
      });
    });

    describe("disabling", () => {
      it("stops sign-in and ends the sessions it already had", async () => {
        const made = await createCheckInUser(admin, {
          username: "tcu_off",
          password: PASSWORD,
        });
        const phone = await signedIn("tcu_off", PASSWORD);
        assert.ok(await sessionOf(phone));

        const disabled = await setCheckInUserDisabled(admin, made.id, true);
        assert.equal(disabled.disabled, true);

        assert.equal(
          await sessionOf(phone),
          null,
          "the phone that was signed in is signed out",
        );
        assert.equal(
          await prisma.session.count({ where: { userId: made.id } }),
          0,
        );
        const attempt = await signIn("tcu_off", PASSWORD);
        assert.ok(!attempt.ok);
        assert.equal(attempt.code, "BANNED_USER");
      });

      it("is refused at the check-in step as well, should a session ever survive", () => {
        assert.equal(canCheckIn({ role: ROLE.CHECK_IN, banned: true }), false);
        assert.equal(isAdmin({ role: ROLE.ADMIN, banned: true }), false);
      });

      it("can be undone: the account signs in again with the same password", async () => {
        const made = await createCheckInUser(admin, {
          username: "tcu_back",
          password: PASSWORD,
        });
        await setCheckInUserDisabled(admin, made.id, true);
        const enabled = await setCheckInUserDisabled(admin, made.id, false);
        assert.equal(enabled.disabled, false);
        assert.ok((await signIn("tcu_back", PASSWORD)).ok);
      });

      it("never lets anyone change the default admin from ADMIN_USERNAME, nor an account that doesn't exist", async () => {
        const adminId = (
          await prisma.user.findUniqueOrThrow({
            where: { username: ADMIN.username },
          })
        ).id;
        // Another admin tries: refused, whoever asks.
        await createAdminUser(admin, {
          username: "tcu_other_boss",
          password: PASSWORD,
        });
        const other = await signedIn("tcu_other_boss", PASSWORD);
        await rejectsWith(
          "PROTECTED",
          setCheckInUserDisabled(other, adminId, true),
        );
        await rejectsWith(
          "PROTECTED",
          resetCheckInUserPassword(other, adminId, "a new password"),
        );
        await rejectsWith(
          "NOT_FOUND",
          setCheckInUserDisabled(admin, "no-such-user", true),
        );
        const row = await prisma.user.findUniqueOrThrow({
          where: { id: adminId },
        });
        assert.equal(row.banned, false);
        assert.ok(
          (await signIn(ADMIN.username, ADMIN.password)).ok,
          "the default admin's password is unchanged",
        );
        assert.equal(
          (await listAdminUsers()).find((a) => a.id === adminId)
            ?.isDefaultAdmin,
          true,
        );
      });

      it("never lets an admin disable or reset their own account", async () => {
        const made = await createAdminUser(admin, {
          username: "tcu_self",
          password: PASSWORD,
        });
        const self = await signedIn("tcu_self", PASSWORD);
        await rejectsWith(
          "PROTECTED",
          setCheckInUserDisabled(self, made.id, true),
        );
        await rejectsWith(
          "PROTECTED",
          resetCheckInUserPassword(self, made.id, "a new password"),
        );
        assert.ok(await sessionOf(self), "still signed in");
      });

      it("follows ADMIN_USERNAME: with it unset, the seed's admin is an ordinary admin", async () => {
        delete process.env.ADMIN_USERNAME;
        const adminId = (
          await prisma.user.findUniqueOrThrow({
            where: { username: ADMIN.username },
          })
        ).id;
        assert.equal(
          (await listAdminUsers()).find((a) => a.id === adminId)
            ?.isDefaultAdmin,
          false,
        );
        await createAdminUser(admin, {
          username: "tcu_other_boss2",
          password: PASSWORD,
        });
        const other = await signedIn("tcu_other_boss2", PASSWORD);
        await setCheckInUserDisabled(other, adminId, true);
        assert.equal(
          (await prisma.user.findUniqueOrThrow({ where: { id: adminId } }))
            .banned,
          true,
        );
      });
    });

    describe("password reset", () => {
      it("replaces the password and signs the account out everywhere", async () => {
        const made = await createCheckInUser(admin, {
          username: "tcu_reset",
          password: PASSWORD,
        });
        const phone = await signedIn("tcu_reset", PASSWORD);

        await resetCheckInUserPassword(admin, made.id, "a brand new one");
        assert.equal(await sessionOf(phone), null, "signed out");
        assert.equal(
          (await signIn("tcu_reset", PASSWORD)).ok,
          false,
          "the old password no longer works",
        );
        assert.ok((await signIn("tcu_reset", "a brand new one")).ok);
      });

      it("is refused by Better Auth for a password that is too short", async () => {
        const made = await createCheckInUser(admin, {
          username: "tcu_short",
          password: PASSWORD,
        });
        await rejectsWith(
          "INVALID",
          resetCheckInUserPassword(admin, made.id, "short"),
        );
        assert.ok(
          (await signIn("tcu_short", PASSWORD)).ok,
          "the old password still works",
        );
      });
    });

    describe("an admin making another admin", () => {
      it("creates an admin who signs in by username and has every admin right", async () => {
        const made = await createAdminUser(admin, {
          username: "TCU_Boss2",
          password: PASSWORD,
        });
        assert.deepEqual(Object.keys(made).sort(), [
          "createdAt",
          "disabled",
          "id",
          "isDefaultAdmin",
          "role",
          "updatedAt",
          "username",
        ]);
        assert.equal(made.role, ROLE.ADMIN);
        assert.equal(made.isDefaultAdmin, false);
        assert.equal(made.username, "TCU_Boss2");

        const row = await prisma.user.findUniqueOrThrow({
          where: { id: made.id },
          include: { accounts: true },
        });
        assert.equal(row.role, ROLE.ADMIN);
        assert.equal(row.username, "tcu_boss2");
        assert.equal(row.banned, false);
        assert.ok(
          row.accounts[0].password &&
            !row.accounts[0].password.includes(PASSWORD),
          "only a hash is stored",
        );

        const boss2 = await signedIn("tcu_boss2", PASSWORD);
        const session = (await sessionOf(boss2))!;
        assert.equal(isAdmin(session.user), true);
        assert.equal(homeFor(session.user), "/admin");
        // The new admin can make accounts of its own, admins included.
        await createCheckInUser(boss2, {
          username: "tcu_by_boss2",
          password: PASSWORD,
        });
        await createAdminUser(boss2, {
          username: "tcu_boss3",
          password: PASSWORD,
        });
        assert.equal(
          (
            await prisma.user.findUniqueOrThrow({
              where: { username: "tcu_boss3" },
            })
          ).role,
          ROLE.ADMIN,
        );
      });

      it("lists admins, oldest first, and never as check-in accounts", async () => {
        await createAdminUser(admin, {
          username: "tcu_listed_admin",
          password: PASSWORD,
        });
        const admins = (await listAdminUsers()).map((a) => a.username);
        assert.ok(
          admins.indexOf(ADMIN.username) < admins.indexOf("tcu_listed_admin"),
        );
        assert.ok(
          !(await listCheckInUsers()).some(
            (u) => u.username === "tcu_listed_admin",
          ),
        );
        for (const a of await listAdminUsers())
          assert.ok(!("password" in a) && !("email" in a));
      });

      it("refuses a username any account already has, in any case", async () => {
        await createCheckInUser(admin, {
          username: "tcu_shared",
          password: PASSWORD,
        });
        await rejectsWith(
          "USERNAME_TAKEN",
          createAdminUser(admin, {
            username: "TCU_SHARED",
            password: PASSWORD,
          }),
        );
        await rejectsWith(
          "USERNAME_TAKEN",
          createAdminUser(admin, {
            username: ADMIN.username,
            password: PASSWORD,
          }),
        );
        assert.equal(
          (
            await prisma.user.findUniqueOrThrow({
              where: { username: "tcu_shared" },
            })
          ).role,
          ROLE.CHECK_IN,
          "not turned into an admin",
        );
      });

      it("can't be done by a check-in account: Better Auth refuses it", async () => {
        await createCheckInUser(admin, {
          username: "tcu_door_x",
          password: PASSWORD,
        });
        const door = await signedIn("tcu_door_x", PASSWORD);
        await rejectsWith(
          "FORBIDDEN",
          createAdminUser(door, {
            username: "tcu_wannabe",
            password: PASSWORD,
          }),
        );
        assert.equal(
          await prisma.user.count({ where: { username: "tcu_wannabe" } }),
          0,
        );
      });

      it("can't be done by a disabled admin's old session", async () => {
        const made = await createAdminUser(admin, {
          username: "tcu_gone",
          password: PASSWORD,
        });
        const gone = await signedIn("tcu_gone", PASSWORD);
        await prisma.user.update({
          where: { id: made.id },
          data: { banned: true },
        });
        await prisma.session.deleteMany({ where: { userId: made.id } });
        await rejectsWith(
          "FORBIDDEN",
          createAdminUser(gone, { username: "tcu_after", password: PASSWORD }),
        );
        assert.equal(
          await prisma.user.count({ where: { username: "tcu_after" } }),
          0,
        );
      });

      it("lets an admin disable, re-enable and reset another admin, who loses admin rights while disabled", async () => {
        const made = await createAdminUser(admin, {
          username: "tcu_managed",
          password: PASSWORD,
        });
        const laptop = await signedIn("tcu_managed", PASSWORD);
        assert.ok(isAdmin((await sessionOf(laptop))!.user));

        const disabled = await setCheckInUserDisabled(admin, made.id, true);
        assert.equal(disabled.disabled, true);
        assert.equal(await sessionOf(laptop), null, "signed out everywhere");
        const attempt = await signIn("tcu_managed", PASSWORD);
        assert.ok(!attempt.ok && attempt.code === "BANNED_USER");
        assert.equal(
          isAdmin({ role: ROLE.ADMIN, banned: true }),
          false,
          "and no admin rights even with a session",
        );

        await setCheckInUserDisabled(admin, made.id, false);
        assert.ok(
          (await signIn("tcu_managed", PASSWORD)).ok,
          "back in with the same password",
        );

        const phone = await signedIn("tcu_managed", PASSWORD);
        await resetCheckInUserPassword(
          admin,
          made.id,
          "a fresh admin password",
        );
        assert.equal(await sessionOf(phone), null);
        assert.equal((await signIn("tcu_managed", PASSWORD)).ok, false);
        assert.ok((await signIn("tcu_managed", "a fresh admin password")).ok);
        assert.equal(
          (await prisma.user.findUniqueOrThrow({ where: { id: made.id } }))
            .role,
          ROLE.ADMIN,
          "still an admin",
        );
      });

      it("can't be done to an admin by a check-in account", async () => {
        const made = await createAdminUser(admin, {
          username: "tcu_target",
          password: PASSWORD,
        });
        await createCheckInUser(admin, {
          username: "tcu_door_y",
          password: PASSWORD,
        });
        const door = await signedIn("tcu_door_y", PASSWORD);
        await rejectsWith(
          "FORBIDDEN",
          setCheckInUserDisabled(door, made.id, true),
        );
        await rejectsWith(
          "FORBIDDEN",
          resetCheckInUserPassword(door, made.id, "a new password"),
        );
        assert.equal(
          (await prisma.user.findUniqueOrThrow({ where: { id: made.id } }))
            .banned,
          false,
        );
      });

      it("validates username and password the same way as for a check-in account", async () => {
        await rejectsWith(
          "INVALID",
          createAdminUser(admin, {
            username: "tcu_short_pw",
            password: "short",
          }),
        );
        await rejectsWith(
          "INVALID",
          createCheckInUser(admin, {
            username: "tcu_short_pw",
            password: "short",
          }),
        );
        await rejectsWith(
          "INVALID",
          createAdminUser(admin, {
            username: "no spaces allowed",
            password: PASSWORD,
          }),
        );
        assert.equal(
          await prisma.user.count({ where: { username: "tcu_short_pw" } }),
          0,
        );
      });
    });

    describe("the seed and the default admin", () => {
      it("re-enables the default admin when run again, since the app can't", async () => {
        await prisma.user.update({
          where: { username: ADMIN.username },
          data: { banned: true, banReason: "x" },
        });
        assert.equal(await upsertAdmin(prisma, ADMIN), "re-enabled");
        const row = await prisma.user.findUniqueOrThrow({
          where: { username: ADMIN.username },
        });
        assert.equal(row.banned, false);
        assert.equal(row.banReason, null);
        assert.ok((await signIn(ADMIN.username, ADMIN.password)).ok);
        assert.equal(await upsertAdmin(prisma, ADMIN), "unchanged");
      });
    });

    describe("admins", () => {
      it("are unchanged: the seed's admin is an admin, signs in and keeps every right", async () => {
        const session = (await sessionOf(admin))!;
        assert.equal(session.user.role, ROLE.ADMIN);
        assert.equal(isAdmin(session.user), true);
        assert.equal(canCheckIn(session.user), true);
        assert.equal(homeFor(session.user), "/admin");
      });

      it("are never made from a check-in account by the seed", async () => {
        await createCheckInUser(admin, {
          username: "tcu_promote",
          password: PASSWORD,
        });
        await assert.rejects(
          upsertAdmin(prisma, {
            username: "tcu_promote",
            password: "whatever password",
          }),
          /already a check-in account/,
        );
        assert.equal(
          (
            await prisma.user.findUniqueOrThrow({
              where: { username: "tcu_promote" },
            })
          ).role,
          ROLE.CHECK_IN,
        );
      });

      it("only exist as the two known roles: the database refuses any other", async () => {
        const made = await createCheckInUser(admin, {
          username: "tcu_role",
          password: PASSWORD,
        });
        await assert.rejects(
          prisma.user.update({
            where: { id: made.id },
            data: { role: "superuser" },
          }),
        );
      });
    });
  },
);
