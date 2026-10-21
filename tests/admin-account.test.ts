import "./no-email";
import "dotenv/config";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, afterEach, before, describe, it } from "node:test";

import { MIN_PASSWORD_LENGTH, upsertAdmin } from "@/lib/admin-account";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Admin accounts in the database: how the seed makes them, and that Better
// Auth then signs them in by username and password with sessions stored in
// Postgres. Rows are named "testacct…" and removed afterwards; only against a
// local database.
const url = process.env.DATABASE_URL ?? "";
const isLocal =
  /^postgres(ql)?:\/\/[^@/]*@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);

const PASSWORD = "correct horse battery staple";
const signIn = (username: string, password: string) =>
  auth.api
    .signInUsername({ body: { username, password }, asResponse: false })
    .then(
      (result) => ({ ok: true as const, result }),
      (error: { status?: string | number; body?: { message?: string } }) => ({
        ok: false as const,
        error,
      }),
    );

describe(
  "admin accounts",
  { skip: !isLocal && "DATABASE_URL is not a local database" },
  () => {
    const clean = () =>
      prisma.user.deleteMany({
        where: { username: { startsWith: "testacct" } },
      });
    before(clean);
    afterEach(clean);
    after(async () => {
      await clean();
      await prisma.$disconnect();
    });

    describe("making one (the seed)", () => {
      it("creates a user and a credential account holding a hash, never the password", async () => {
        assert.equal(
          await upsertAdmin(prisma, {
            username: "TestAcct_One",
            password: PASSWORD,
          }),
          "created",
        );

        const user = await prisma.user.findUniqueOrThrow({
          where: { username: "testacct_one" },
          include: { accounts: true },
        });
        assert.equal(user.displayUsername, "TestAcct_One");
        assert.equal(user.name, "TestAcct_One");
        assert.equal(user.emailVerified, true);
        assert.equal(user.email, "testacct_one@admin.invalid");
        assert.equal(user.accounts.length, 1);
        assert.equal(user.accounts[0].providerId, "credential");
        assert.ok(
          user.accounts[0].password && user.accounts[0].password !== PASSWORD,
        );
        assert.ok(!user.accounts[0].password!.includes(PASSWORD));
      });

      it("uses the email it is given, lowercased", async () => {
        await upsertAdmin(prisma, {
          username: "testacct_mail",
          password: PASSWORD,
          email: " Boss@Example.COM ",
        });
        assert.equal(
          (
            await prisma.user.findUniqueOrThrow({
              where: { username: "testacct_mail" },
            })
          ).email,
          "boss@example.com",
        );
        await assert.rejects(
          upsertAdmin(prisma, {
            username: "testacct_other",
            password: PASSWORD,
            email: "boss@example.com",
          }),
          /already uses the email/,
        );
      });

      it("is safe to run again: nothing changes when it is all as given", async () => {
        await upsertAdmin(prisma, {
          username: "testacct_two",
          password: PASSWORD,
        });
        const before = await prisma.account.findFirstOrThrow({
          where: { user: { username: "testacct_two" } },
        });
        assert.equal(
          await upsertAdmin(prisma, {
            username: "TESTACCT_TWO",
            password: PASSWORD,
          }),
          "unchanged",
        );
        const after = await prisma.account.findFirstOrThrow({
          where: { user: { username: "testacct_two" } },
        });
        assert.equal(after.password, before.password);
        assert.equal(
          await prisma.user.count({ where: { username: "testacct_two" } }),
          1,
        );
      });

      it("changes the password when the seed is run with a new one, and ends that admin's sessions", async () => {
        await upsertAdmin(prisma, {
          username: "testacct_three",
          password: PASSWORD,
        });
        assert.equal((await signIn("testacct_three", PASSWORD)).ok, true);
        const user = await prisma.user.findUniqueOrThrow({
          where: { username: "testacct_three" },
        });
        assert.equal(
          await prisma.session.count({ where: { userId: user.id } }),
          1,
        );

        const next = "a different long password 123";
        assert.equal(
          await upsertAdmin(prisma, {
            username: "testacct_three",
            password: next,
          }),
          "password-changed",
        );
        assert.equal(
          await prisma.session.count({ where: { userId: user.id } }),
          0,
          "signed out everywhere",
        );
        assert.equal(
          (await signIn("testacct_three", PASSWORD)).ok,
          false,
          "the old password no longer works",
        );
        assert.equal((await signIn("testacct_three", next)).ok, true);
      });

      it("refuses a short password and a username that isn't allowed", async () => {
        await assert.rejects(
          upsertAdmin(prisma, {
            username: "testacct_short",
            password: "x".repeat(MIN_PASSWORD_LENGTH - 1),
          }),
          /at least 12 characters/,
        );
        for (const username of [
          "ab",
          "has space",
          "bad!",
          "x".repeat(31),
          "",
          "tést",
        ]) {
          await assert.rejects(
            upsertAdmin(prisma, { username, password: PASSWORD }),
            /username must be/,
            JSON.stringify(username),
          );
        }
        assert.equal(
          await prisma.user.count({
            where: { username: { startsWith: "testacct_short" } },
          }),
          0,
        );
      });
    });

    describe("signing in with Better Auth", () => {
      it("signs in by username and password, case-insensitively, and keeps the session in the database", async () => {
        await upsertAdmin(prisma, {
          username: "TestAcct_Four",
          password: PASSWORD,
        });
        for (const typed of [
          "testacct_four",
          "TESTACCT_FOUR",
          "TestAcct_Four",
        ]) {
          const result = await signIn(typed, PASSWORD);
          assert.ok(result.ok, typed);
          assert.equal(result.result.user.username, "testacct_four");
        }
        const user = await prisma.user.findUniqueOrThrow({
          where: { username: "testacct_four" },
        });
        assert.equal(
          await prisma.session.count({ where: { userId: user.id } }),
          3,
        );
        const session = await prisma.session.findFirstOrThrow({
          where: { userId: user.id },
        });
        assert.ok(
          session.expiresAt.getTime() > Date.now() + 11 * 3600_000 &&
            session.expiresAt.getTime() < Date.now() + 13 * 3600_000,
          "a twelve hour session",
        );
      });

      it("refuses a wrong password and an unknown username in the same way", async () => {
        await upsertAdmin(prisma, {
          username: "testacct_five",
          password: PASSWORD,
        });
        const wrong = await signIn("testacct_five", "not the password at all");
        const unknown = await signIn("testacct_nobody", PASSWORD);
        assert.ok(!wrong.ok && !unknown.ok);
        assert.equal(wrong.error.status, unknown.error.status);
        assert.equal(
          wrong.error.body?.message,
          unknown.error.body?.message,
          "doesn't reveal which usernames exist",
        );
      });

      it("has no sign-up: nobody can make an account", async () => {
        await assert.rejects(
          auth.api.signUpEmail({
            body: {
              email: "intruder@example.com",
              password: PASSWORD,
              name: "Intruder",
              username: "testacct_intruder",
            } as never,
          }),
        );
        assert.equal(
          await prisma.user.count({ where: { username: "testacct_intruder" } }),
          0,
        );
      });

      it("rejects a session token that was never issued", async () => {
        const headers = new Headers({
          cookie: "better-auth.session_token=forged-token.forged-signature",
        });
        assert.equal(await auth.api.getSession({ headers }), null);
      });
    });
  },
);

describe("where an admin comes from", () => {
  const read = (file: string) => readFileSync(file, "utf8");

  it("is only the database: no allow-list or shared password is left", () => {
    for (const file of [
      "lib/auth.ts",
      "lib/admin-session.ts",
      "proxy.ts",
      "lib/utils.ts",
      ".env.example",
    ]) {
      assert.doesNotMatch(
        read(file),
        /ADMIN_EMAILS|ADMIN_PASSWORD_HASH|isAdminEmail|provisionAdmins/,
        file,
      );
    }
    assert.match(
      read("lib/auth.ts"),
      /prismaAdapter\(prisma, \{ provider: "postgresql" \}\)/,
    );
    assert.match(read("lib/auth.ts"), /disableSignUp: true/);
    assert.match(
      read("lib/auth.ts"),
      /plugins: \[username\(\), nextCookies\(\)\]/,
    );
  });

  it("keeps the gate in the page, action and route code: the proxy only looks for a cookie", () => {
    const proxy = read("proxy.ts");
    assert.match(proxy, /getSessionCookie\(request\)/);
    assert.doesNotMatch(proxy, /auth\.api/);
    assert.match(read("lib/admin-session.ts"), /auth\.api\.getSession\(/);
  });

  it("exposes over HTTP only username sign-in and sign-out: no sign-up, email sign-in or password reset", () => {
    const route = read("app/api/auth/[...all]/route.ts");
    assert.match(route, /new Set\(\["\/api\/auth\/sign-in\/username", "\/api\/auth\/sign-out"\]\)/);
    assert.match(read("lib/auth.ts"), /"\/sign-in\/username": \{ window: 60, max: 5 \}/, "and it is rate limited");
  });

  it("never puts the seed's password in the code or the migration", () => {
    assert.doesNotMatch(
      read("prisma/seed.ts"),
      /password\s*[:=]\s*["'][^"']{8,}["']/i,
    );
    assert.match(read("prisma/seed.ts"), /process\.env\.ADMIN_PASSWORD/);
  });
});
