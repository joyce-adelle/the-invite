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

  it("checks the admin session before reading anything about the guest", () => {
    const session = content.indexOf("getAdminSession()");
    const lookup = content.indexOf("getCheckInView(");
    assert.ok(session >= 0 && lookup >= 0);
    assert.ok(session < lookup, "session first, then the lookup");
    assert.match(
      content,
      /if \(!\(await getAdminSession\(\)\)\) return <RestrictedAccess/,
    );
    // The only thing awaited first is the route's own parameters, not anything about a guest.
    const awaited = content.slice(0, session).match(/await[^;]*/g) ?? [];
    assert.deepEqual(awaited, ["await params", "await "], "only the address itself comes before the check");
  });

  it("shows a visitor who isn't an admin a page that has no guest data in it, for any address", () => {
    const restricted = read("components/app/check-in/restricted-access.tsx");
    assert.match(restricted, /restricted to authorized event administrators/);
    const code = restricted.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ""); // comments aren't what is shown
    assert.doesNotMatch(code, /@\/lib\/data|getCheckInView|prisma|guest/i);
    // Only the address is used, and only to make a sign-in link when it is shaped like a real code.
    assert.match(restricted, /isCheckInToken\(token\)/);
  });

  it("only offers sign-in a way back to a check-in address", () => {
    const gate = read("components/app/admin/login-gate.tsx");
    assert.match(gate, /safeReturnPath\(\(await searchParams\)\.next\)/);
    assert.match(gate, /redirect\(next \?\? "\/admin"\)/);
    assert.match(
      read("components/app/admin/login-form.tsx"),
      /router\.replace\(next \?\? "\/admin"\)/,
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

  it("verifies the admin session first, and nothing else before it is awaited", () => {
    const session = action.indexOf("await getAdminSession()");
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
    assert.match(action, /checkInGuest\(token, session\.user\.email\)/);
    // No guest id, admin, status or time is accepted from the request.
    assert.doesNotMatch(action, /formData|adminEmail|checkedIn(At|By)\s*[:=]/);
  });

  it("makes the decision in one conditional update that needs an approved guest and both fields empty", () => {
    assert.match(
      data,
      /updateMany\(\{\s*where: \{ checkInToken: token, status: GuestStatus\.APPROVED, checkedInAt: null, checkedInBy: null \},\s*data: \{ checkedInAt: new Date\(\), checkedInBy: by \}/,
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
      "lib/check-in.ts",
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
      "lib/check-in.ts",
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
