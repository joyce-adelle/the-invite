import { describe, it } from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";

import assert from "node:assert/strict";
import { checkInState } from "@/lib/check-in/check-in-state";
import path from "node:path";

// Who may see a guest at the door, and who may let one in. A request can't be
// made without a real browser session, so these guard the structure: the
// session is verified before anything about a guest is read, the admin who is
// recorded comes from that session, and the token stays out of the places it
// must not go. (The same flows were also run in a real browser.)

const read = (file: string) => readFileSync(file, "utf8");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

describe("who can see a guest at the door", () => {
  const content = read("components/app/check-in/check-in-content.tsx");

  it("checks for an admin or check-in session before reading anything about the guest", () => {
    const session = content.indexOf("getCheckInSession()");
    const lookup = content.indexOf("getCheckInView(");
    assert.ok(session >= 0 && lookup >= 0);
    assert.ok(session < lookup, "session first, then the lookup");
    assert.match(content, /const session = await getCheckInSession\(\);\s*if \(!session\) return <RestrictedAccess/);
    // The only thing awaited first is the route's own parameters, not anything about a guest.
    const awaited = content.slice(0, session).match(/await[^;]*/g) ?? [];
    // (The trailing "await " is the session check's own.)
    assert.deepEqual(awaited, ["await params", "await "], "only the address itself comes before the check");
  });

  it("shows a visitor who isn't an admin a page that has no guest data in it, for any address", () => {
    const restricted = read("components/app/check-in/restricted-access.tsx");
    assert.match(restricted, /restricted to authorized event staff/);
    const code = restricted.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ""); // comments aren't what is shown
    assert.doesNotMatch(code, /@\/lib\/data|getCheckInView|prisma|guest/i);
    // Only the address is used, and only to make a sign-in link when it is shaped like a real code.
    assert.match(restricted, /isCheckInToken\(token\)/);
  });

  it("only offers sign-in a way back to a check-in address", () => {
    const gate = read("components/app/admin/login-gate.tsx");
    assert.match(gate, /safeReturnPath\(\(await searchParams\)\.next\)/);
    assert.match(gate, /if \(session && canCheckIn\(session\.user\)\) redirect\(next \?\? homeFor\(session\.user\)\)/);
    assert.match(
      read("components/app/admin/login-form.tsx"),
      /callbackURL: next \?\? "\/admin"/,
    );
  });

  it("keeps the address, which carries the secret, from being passed on in a Referer", () => {
    const page = read("app/check-in/[token]/page.tsx");
    assert.match(page, /referrer: "no-referrer"/);
    assert.match(page, /robots: \{ index: false, follow: false \}/);
  });
});

describe("who can let a guest in", () => {
  const action = read("lib/actions/check-in.ts");
  const data = read("lib/data/check-in.ts");

  it("verifies an admin or check-in session first, and nothing else before it is awaited", () => {
    const session = action.indexOf("await getCheckInSession()");
    const check = action.indexOf("checkInGuest(");
    assert.ok(session >= 0 && check > session);
    assert.match(
      action,
      /if \(!session\) return \{ outcome: "unauthorized" \}/,
    );
    assert.doesNotMatch(
      action.slice(
        action.indexOf("{", action.indexOf("export async function")),
        session,
      ),
      /await/,
    );
  });

  it("takes only the token from the browser: the admin is the verified session's, not a parameter", () => {
    assert.match(
      action,
      /export async function confirmCheckInAction\(token: string\)/,
    );
    assert.match(action, /checkInGuest\(token, session\.user\.id\)/);
    // No guest id, admin, status or time is accepted from the request.
    assert.doesNotMatch(action, /formData|adminEmail|checkedIn(At|By)\s*[:=]/);
  });

  it("makes the decision in one conditional update that needs an approved guest and both fields empty", () => {
    assert.match(
      data,
      /updateMany\(\{\s*where: \{ checkInToken: token, status: GuestStatus\.APPROVED, checkedInAt: null, checkedInBy: null \},\s*data: \{ checkedInAt: new Date\(\), checkedInBy: adminId \}/,
    );
    // Both fields are set in that single statement, and nowhere else.
    assert.equal(data.match(/checkedInAt: new Date\(\)/g)?.length, 1);
  });

  it("refreshes the dashboard only when the check-in really happened, and shows a failure as one", () => {
    assert.match(
      action,
      /if \(result\.outcome === "checked-in"\) revalidatePath\("\/admin"\)/,
    );
    assert.match(action, /outcome: "error"/);
  });

  it("doesn't write the token or the address to the logs", () => {
    for (const file of [
      "lib/actions/check-in.ts",
      "lib/data/check-in.ts",
      "lib/check-in/check-in.ts",
      "lib/access-card.ts",
    ]) {
      const logs = read(file).match(/console\.\w+\([^;]*\);/g) ?? [];
      for (const log of logs) {
        assert.doesNotMatch(log, /token|url|checkInUrl/i, `${file}: ${log}`);
      }
    }
    // A database error can quote what it was given, so only its name is logged.
    assert.match(action, /error instanceof Error \? error\.name/);
  });
});

describe("where the token must not go", () => {
  it("is never part of a guest record sent to the browser", () => {
    assert.match(read("lib/data/guests.ts"), /omit: \{ checkInToken: true \}/);
    assert.match(
      read("types/guest.ts"),
      /AdminGuest = Omit<Guest, "checkInToken">/,
    );
  });

  it("isn't referred to by any page or component: only the server code and the card use it", () => {
    for (const file of [...sourceFiles("app"), ...sourceFiles("components")]) {
      assert.doesNotMatch(read(file), /checkInToken/, file);
    }
  });

  it("is only built into an address inside the server-only modules", () => {
    for (const file of [
      "lib/check-in/check-in.ts",
      "lib/data/check-in.ts",
      "lib/access-card.ts",
    ]) {
      assert.match(
        read(file),
        /^import "server-only";/,
        `${file} can't be imported by client code`,
      );
    }
  });
});

describe("check-in accounts, and who may manage them", () => {
  const actions = read("lib/actions/check-in-users.ts");

  it("makes every account action check for an active admin before anything else", () => {
    const names = [...actions.matchAll(/export async function (\w+Action)\(/g)].map((m) => m[1]);
    assert.deepEqual(names.sort(), ["createAdminUserAction", "createCheckInUserAction", "resetCheckInUserPasswordAction", "setCheckInUserDisabledAction"]);
    for (const name of names) {
      const start = actions.indexOf(`function ${name}(`);
      const body = actions.slice(start, actions.indexOf("\nexport ", start + 1) >>> 0 || undefined);
      const check = body.indexOf("await requireAdmin()");
      assert.ok(check > 0, `${name} checks the admin`);
      assert.doesNotMatch(body.slice(0, check), /await\s+[A-Za-z]/, `${name} awaits nothing first`);
    }
  });

  it("passes the acting admin's own headers to Better Auth, so it checks their role too", () => {
    for (const call of ["createCheckInUser(await headers()", "createAdminUser(await headers()", "setCheckInUserDisabled(await headers()", "resetCheckInUserPassword(await headers()"]) {
      assert.ok(actions.includes(call), call);
    }
    const lib = read("lib/check-in-users.ts");
    for (const api of ["createUser", "banUser", "unbanUser", "setUserPassword", "revokeUserSessions"]) {
      assert.match(lib, new RegExp(`auth\\.api\\.${api}\\(\\{\\s*headers`), api);
    }
    assert.match(lib, /createAccount\(headers, input, ROLE\.CHECK_IN\)/, "check-in accounts are made with that role");
    assert.match(lib, /createAccount\(headers, input, ROLE\.ADMIN\)/, "and admins with theirs, never a role from the browser");
    assert.match(lib, /where: \{ id, role: ROLE\.CHECK_IN \}/, "and only check-in accounts can be changed here");
  });

  it("keeps Better Auth's own admin endpoints unreachable over HTTP", () => {
    const route = read("app/api/auth/[...all]/route.ts");
    assert.match(route, /new Set\(\["\/api\/auth\/sign-in\/username", "\/api\/auth\/sign-out"\]\)/);
  });

  it("gives a check-in account no admin rights in Better Auth, and refuses a disabled account everywhere", () => {
    const authConfig = read("lib/auth.ts");
    assert.match(authConfig, /\[ROLE\.CHECK_IN\]: ac\.newRole\(\{ user: \[\], session: \[\] \}\)/);
    assert.match(authConfig, /adminRoles: \[ROLE\.ADMIN\]/);
    assert.match(authConfig, /defaultRole: ROLE\.CHECK_IN/);
    assert.match(read("lib/roles.ts"), /const isActive = \(user: AccessUser\) => user\.banned !== true;/);
  });

  it("only shows a check-in account the check-in pages: its home needs the check-in permission", () => {
    assert.match(read("components/app/check-in/check-in-home.tsx"), /await requireCheckIn\(\)/);
    const home = read("components/app/check-in/check-in-home.tsx");
    assert.doesNotMatch(home, /@\/lib\/data|prisma|getCheckInView/, "it reads no guest data at all");
  });
});

describe("what the check-in page offers", () => {
  const at = new Date();

  it("offers the button for an approved guest who hasn't come in, and only then", () => {
    assert.deepEqual(checkInState({ status: "APPROVED", checkedInAt: null }), {
      kind: "ready",
    });
    assert.deepEqual(checkInState({ status: "APPROVED", checkedInAt: at }), {
      kind: "checked-in",
    });
  });

  it("gives the reason an invitation can't be used, for pending, rejected and cancelled", () => {
    const reasons = (["PENDING", "REJECTED", "CANCELLED"] as const).map(
      (status) => {
        const state = checkInState({ status, checkedInAt: null });
        assert.equal(state.kind, "not-eligible");
        return state.kind === "not-eligible" ? state.reason : "";
      },
    );
    assert.match(reasons[0], /pending/i);
    assert.match(reasons[1], /rejected/i);
    assert.match(reasons[2], /cancelled/i);
    assert.equal(new Set(reasons).size, 3);
  });

  it("still refuses a cancelled guest who had checked in", () => {
    assert.equal(
      checkInState({ status: "CANCELLED", checkedInAt: at }).kind,
      "not-eligible",
    );
  });

  it("only celebrates a check-in that the server confirmed", () => {
    const panel = read("components/app/check-in/check-in-panel.tsx");
    // "Checked in" success appears from the server's answer, never from the click.
    assert.equal(panel.match(/setNotice\(\{ kind: "success" \}\)/g)?.length, 1);
    const success = panel.indexOf('setNotice({ kind: "success" })');
    const branch = panel.lastIndexOf('case "checked-in":', success);
    assert.ok(
      branch > 0 && success - branch < 120,
      "the success notice is only set in the checked-in case",
    );
    // A thrown failure and an error answer both say it was not recorded.
    assert.match(panel, /the check-in was not recorded/);
    assert.match(panel, /Nothing was changed/);
  });
});
