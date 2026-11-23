// Creates or resets a console login, so the first account exists before anyone can sign in.
// Usage: bun scripts/user.ts set <name> <password> [--administrator]
//
// The account is written into the console's own table in the server's database, the one
// `WEB_DATABASE_URL` names (docs/accounts.md, 「The tables」). Where the account model is in force the sign-in
// is the account service's, so the service's user of the same name is made or reset too, through the server's
// account command (docs/accounts.md, 「The account command」): the binary `BMO_WEB_SERVER_BIN` names, run in the
// folder `BMO_WEB_SERVER_DIR` names, where the server's settings stand.

import { parseArgs } from "node:util";

import { modelState } from "../server/utils/account-service";

import { closeWebSql, useWebSql } from "../server/utils/db";
import { MIN_PASSWORD_LENGTH } from "../shared/config";
import { MAX_LOGIN_LENGTH, MIN_LOGIN_LENGTH, loginOf } from "../shared/logins";
import { wording } from "../shared/wording";

// What the command line says, or null where it says something this command does not read.
function readArgs(): { positionals: string[]; values: { administrator?: boolean } } | null {
  try {
    return parseArgs({ args: process.argv.slice(2), allowPositionals: true, options: { administrator: { type: "boolean" } } });
  } catch {
    return null;
  }
}

const parsed = readArgs();

if (parsed === null) {
  console.error(wording("account.message.user_usage"));
  process.exit(2);
}

const [command, given, password] = parsed.positionals;
const administrator = parsed.values.administrator === true;

if (command !== "set" || given === undefined || password === undefined || parsed.positionals.length !== 3) {
  console.error(wording("account.message.user_usage"));
  process.exit(2);
}

const name = loginOf(given);

if (name === null) {
  console.error(wording("account.error.user_name_shape", { min: MIN_LOGIN_LENGTH, max: MAX_LOGIN_LENGTH }));
  process.exit(2);
}

if (password.length < MIN_PASSWORD_LENGTH) {
  console.error(wording("account.error.user_password_short", { min: MIN_PASSWORD_LENGTH }));
  process.exit(2);
}

const hash = await Bun.password.hash(password, { algorithm: "argon2id" });

await useWebSql().run(
  `INSERT INTO web_users (name, password_hash, created_at) VALUES ($1, $2, $3)
   ON CONFLICT (name) DO UPDATE SET password_hash = excluded.password_hash`,
  name,
  hash,
  Math.floor(Date.now() / 1000)
);
await closeWebSql();

console.log(wording("account.message.user_saved", { name }));

if ((await modelState())?.inForce === true) {
  const binary = process.env.BMO_WEB_SERVER_BIN?.trim() ?? "";
  const folder = process.env.BMO_WEB_SERVER_DIR?.trim() ?? "";

  if (binary === "" || folder === "") {
    console.error(wording("account.message.user_service_unset"));
    process.exit(1);
  }

  const done = Bun.spawnSync([binary, "user", name, ...(administrator ? ["--administrator"] : [])], {
    cwd: folder,
    stdin: new TextEncoder().encode(`${password}\n`),
    stdout: "pipe",
    stderr: "pipe"
  });

  if (done.exitCode !== 0) {
    console.error(wording("account.error.user_service_failed", { reason: done.stderr.toString().trim() }));
    process.exit(1);
  }

  console.log(wording(administrator ? "account.message.user_service_saved_administrator" : "account.message.user_service_saved", { name }));
}
