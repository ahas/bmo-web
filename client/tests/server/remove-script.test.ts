import { afterAll, describe, expect, test } from "bun:test";

import { SQL } from "bun";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { connectionOf } from "../../apps/web/server/utils/db";
import { wording } from "../../apps/web/shared/wording";
import { answer, standIn } from "../support/units";
import { scratchWebDatabase } from "../support/web-database";

// The console's removal script (docs/web.md, 「Deleting an account or a unit from the machine」): it reads the
// console's environment file each line's key before its first `=` and its value as it stands, acts as the move's
// administrator the database names, prints what a dry run would take and changes nothing, deletes nothing without
// `--yes` where no terminal answers, runs the cascade with `--yes`, and says a removal already finished as done.

const SCRIPT = join(import.meta.dir, "..", "..", "apps", "web", "scripts", "remove.ts");
const WEB = join(import.meta.dir, "..", "..", "apps", "web");
const PERSON = "5";
const ADMINISTRATOR = "17";

const database = await scratchWebDatabase();
const sql = new SQL(connectionOf(database) as SQL.Options);

await sql.unsafe(`CREATE FUNCTION bmo_administrator() RETURNS bigint LANGUAGE sql STABLE AS 'SELECT ${ADMINISTRATOR}::bigint'`);
await sql.close();

const service = { removed: false };

const accounts = standIn(
  "SCRIPT_WEB_SERVER",
  (one) => {
    if (one.method === "GET" && one.path === `/users/${PERSON}/removal`) {
      if (service.removed) return answer({ code: "not-found", error: "No such user." }, 404);

      return answer({ user: PERSON, name: "member-a", fullName: "", left: true, administrator: false, refusal: null, counts: { users: 1 } });
    }
    if (one.method === "DELETE" && one.path === `/users/${PERSON}`) {
      service.removed = true;
      return answer({ removed: { users: 1 }, record: 3 });
    }

    return answer({ code: "failed", error: "Not served here." }, 500);
  },
  { headers: true }
);
const agency = standIn(
  "SCRIPT_AGENCY",
  (one) => (one.path.endsWith("/removal") ? answer({ counts: { supervisors: 1 } }) : answer({ removed: { supervisors: 1 } })),
  { headers: true }
);

// The console's environment as its file stands, a value holding what a dotenv reader would read otherwise.
const folder = mkdtempSync(join(tmpdir(), "remove-script-"));
const environment = join(folder, "console.env");

writeFileSync(
  environment,
  [
    "# the console's environment",
    `WEB_SERVER_ADDRESS=${accounts.address}`,
    "WEB_SERVER_TOKEN=a#token with $signs",
    `AGENCY_ADDRESS=${agency.address}`,
    "AGENCY_TOKEN=agency-token",
    `WEB_DATABASE_URL=${database}`,
    ""
  ].join("\n")
);

afterAll(() => rmSync(folder, { recursive: true, force: true }));

// The script run with the file and nothing of the units' settings in its own environment.
async function script(...args: string[]): Promise<{ code: number; out: string; err: string }> {
  const env: Record<string, string> = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && !/_(ADDRESS|TOKEN)$/.test(key) && key !== "WEB_DATABASE_URL") env[key] = value;
  }

  const run = Bun.spawn(["bun", SCRIPT, ...args, "--env-file", environment], { cwd: WEB, env, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  const [out, err] = await Promise.all([new Response(run.stdout).text(), new Response(run.stderr).text()]);

  return { code: await run.exited, out, err };
}

const deletes = () => [...accounts.asked, ...agency.asked].filter((one) => one.method === "DELETE");

describe("the removal script", () => {
  test("prints what a dry run would take, unit by unit, and changes nothing", async () => {
    const run = await script("account", PERSON, "--dry-run");

    expect(run.code).toBe(0);
    expect(run.out).toContain("agency: supervisors 1");
    expect(run.out).toContain("web: users 1");
    expect(deletes()).toEqual([]);
    // It acts as the move's administrator, with the token the file holds read as it stands.
    expect(agency.asked[0]?.headers?.["owner-key"]).toBe(ADMINISTRATOR);
    expect(accounts.asked[0]?.headers?.authorization).toBe("Bearer a#token with $signs");
  });

  test("deletes nothing without --yes where no terminal answers", async () => {
    const run = await script("account", PERSON);

    expect(run.code).toBe(2);
    expect(run.err).toContain(wording("removal.message.script_needs_yes"));
    expect(deletes()).toEqual([]);
  });

  test("runs the cascade with --yes, a line for each step, and says a removal already finished as done", async () => {
    const run = await script("account", PERSON, "--yes");

    expect(run.code).toBe(0);
    expect(run.out).toContain(`${PERSON} agency: ${wording("removal.label.removed")}`);
    expect(run.out).toContain(wording("removal.label.finished"));
    expect(deletes().map((one) => one.path).sort()).toEqual([`/owners/${PERSON}`, `/users/${PERSON}`]);

    const again = await script("account", PERSON, "--yes");

    expect(again.code).toBe(0);
    expect(again.out).toContain(wording("removal.label.already"));
  });

  test("refuses a command it does not read", async () => {
    const run = await script("account", "not-a-number");

    expect(run.code).toBe(2);
    expect(run.err).toContain(wording("removal.message.script_usage"));
  });
});
