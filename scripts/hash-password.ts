// Prints the value for ADMIN_PASSWORD_HASH. Run with `npm run auth:hash-password`.
//
// The password is typed at the prompt (it is echoed), never passed as a
// command-line argument, which would end up in shell history. The hash uses
// Better Auth's own scrypt implementation, which is what verifies it at login.

import readline from "node:readline/promises";
import { hashPassword } from "better-auth/crypto";

const MIN_LENGTH = 12;

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const password = await rl.question("New admin password: ");
  rl.close();

  if (password.length < MIN_LENGTH) {
    console.error(`Use at least ${MIN_LENGTH} characters.`);
    process.exitCode = 1;
    return;
  }

  console.log("\nAdd this to your environment:\n");
  console.log(`ADMIN_PASSWORD_HASH="${await hashPassword(password)}"`);
}

main();
