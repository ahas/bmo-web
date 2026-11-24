// Deletes a person's account or a unit with every unit under it for good, from the machine, as the same cascade the
// console's permanent delete runs (docs/web.md, 「Deleting an account or a unit from the machine」).
// Usage: bun scripts/remove.ts account <user> [--leave]
//        bun scripts/remove.ts unit <unit> [--with-people]
//          [--dry-run] [--yes] [--json] [--env-file <file>]
//
// It acts as the move's administrator, read off the database `WEB_DATABASE_URL` names, since whoever stands at the
// machine stands for him. The account service and every content unit are reached at the addresses the console's
// environment names. A step that fails stops it; running it again carries on from where it stopped.

import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";

import { STEP_WORDS, refusalSentence } from "../shared/removal";
import { wording } from "../shared/wording";

import type { RemovalCounts, RemovalStep, RemovalUnitCount } from "../shared/removal";

// The console's environment file holds plain `KEY=value` lines (docs/web.md, 「Running as a service」), and its values
// are tokens the console hands on as they stand: each line's key is read before its first `=` and its value after it
// verbatim, since a dotenv reader or a shell would reinterpret a `#`, a quote or a `$` in a value. A variable the
// process already holds stands over the file's.
function readEnvironment(path: string): void {
  let text: string;

  try {
    text = readFileSync(path, "utf8");
  } catch {
    console.error(wording("removal.message.script_env_unread", { path }));
    process.exit(2);
  }

  for (const line of text.split(/\r?\n/)) {
    const at = line.indexOf("=");

    if (line.trimStart().startsWith("#") || at <= 0) continue;

    const key = line.slice(0, at).trim();

    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && process.env[key] === undefined) process.env[key] = line.slice(at + 1);
  }
}

interface Options {
  leave?: boolean;
  "with-people"?: boolean;
  "dry-run"?: boolean;
  yes?: boolean;
  json?: boolean;
  "env-file"?: string;
}

function readArgs(): { positionals: string[]; values: Options } | null {
  try {
    return parseArgs({
      args: process.argv.slice(2),
      allowPositionals: true,
      options: {
        leave: { type: "boolean" },
        "with-people": { type: "boolean" },
        "dry-run": { type: "boolean" },
        yes: { type: "boolean" },
        json: { type: "boolean" },
        "env-file": { type: "string" }
      }
    });
  } catch {
    return null;
  }
}

const parsed = readArgs();
const [what, subject] = parsed?.positionals ?? [];

if (parsed === null || parsed.positionals.length !== 2 || (what !== "account" && what !== "unit") || subject === undefined || !/^[1-9]\d*$/.test(subject)) {
  console.error(wording("removal.message.script_usage"));
  process.exit(2);
}

const options = parsed.values;

if (options["env-file"] !== undefined) readEnvironment(options["env-file"]);

// The cascade and the database are read once the environment stands, since both read it as they load.
const { accountRemovalPreview, failureWords, runAccountRemoval, runUnitRemoval, unitRemovalPreview } = await import("../server/utils/removal");
const { closeWebSql, useWebSql } = await import("../server/utils/db");

const say = (key: string, params?: Record<string, string | number>) => wording(key, params);
const json = options.json === true;

function out(line: string): void {
  if (!json) console.log(line);
}

// Each kind by its key and how many, every kind of none left out.
function kindsText(counts: RemovalCounts): string {
  const held = Object.entries(counts).filter(([, count]) => count > 0);

  return held.length === 0 ? say("removal.label.nothing") : held.map(([kind, count]) => `${kind} ${count.toLocaleString("en-US")}`).join(", ");
}

function countLine(one: RemovalUnitCount): string {
  if (one.state === "unset") return `${one.unit}: ${say("removal.label.unset")}`;
  if (one.state === "failed") return `${one.unit}: ${say("removal.label.unread")}`;

  return `${one.unit}: ${kindsText(one.counts)}`;
}

function stepLine(step: RemovalStep, who: string): string {
  const said = failureWords.get(step);
  const why = step.failure === null ? "" : ` (${step.failure.status ?? "-"} ${step.failure.code ?? ""}${said === undefined ? "" : ` ${said}`})`;

  return `${who} ${step.unit}: ${say(STEP_WORDS[step.state])}${why}${step.state === "removed" ? ` · ${kindsText(step.removed)}` : ""}`;
}

// The move's administrator, whom the removal acts as.
async function moveAdministrator(): Promise<string> {
  try {
    const row: unknown = await useWebSql().get(`SELECT bmo_administrator()::text AS id`);
    const id: unknown = typeof row === "object" && row !== null ? Reflect.get(row, "id") : null;

    if (typeof id === "string" && id !== "") return id;
  } catch {
    // Said below as no administrator found.
  }

  console.error(say("removal.message.script_no_administrator"));
  process.exit(2);
}

// The name typed at the terminal as the dialog asks for it, or `--yes` in its place.
async function confirmed(name: string): Promise<boolean> {
  if (options.yes === true) return true;

  if (!process.stdin.isTTY) {
    console.error(say("removal.message.script_needs_yes"));
    return false;
  }

  const asking = createInterface({ input: process.stdin, output: process.stdout });
  const typed = await asking.question(`${say("removal.message.script_ask", { name })} `);

  asking.close();

  if (typed === name) return true;

  console.error(say("removal.error.confirm"));
  return false;
}

const administrator = await moveAdministrator();

await closeWebSql();

const context = {
  administrator,
  onStep: (step: RemovalStep, who: string) => out(stepLine(step, who))
};

let code = 0;

if (what === "account") {
  const preview = await accountRemovalPreview(subject, context);

  if (preview === null) {
    out(say("removal.label.already"));
    if (json) console.log(JSON.stringify({ already: true }));
    process.exit(0);
  }

  const name = preview.plan.fullName === "" ? preview.plan.name : preview.plan.fullName;

  out(say("removal.message.script_account", { user: subject, name, login: preview.plan.name }));
  for (const one of preview.units) out(countLine(one));

  const refusal = preview.plan.refusal ?? null;

  if (refusal !== null && !(refusal === "not-left" && options.leave === true)) {
    console.error(refusalSentence(refusal, say));
    if (json) console.log(JSON.stringify({ preview }));
    process.exit(3);
  }

  if (options["dry-run"] === true) {
    if (json) console.log(JSON.stringify({ preview }));
    process.exit(0);
  }

  if (!(await confirmed(name))) process.exit(2);

  const run = await runAccountRemoval(subject, { leave: options.leave === true }, context);

  if (json) console.log(JSON.stringify(run));
  out(run.finished ? say(run.already ? "removal.label.already" : "removal.label.finished") : say("removal.message.script_stopped"));
  code = run.finished ? 0 : run.refusal === null ? 1 : 3;
} else {
  const unit = Number(subject);
  const preview = await unitRemovalPreview(unit, context);

  if (preview === null) {
    out(say("removal.label.already"));
    if (json) console.log(JSON.stringify({ already: true }));
    process.exit(0);
  }

  out(say("removal.message.script_unit", { unit: subject, name: preview.plan.name, count: preview.plan.units.length }));
  for (const person of preview.plan.people) out(say("removal.message.script_person", { user: person.user, name: person.name }));
  for (const one of preview.units) out(countLine(one));

  const refusal = preview.plan.refusal ?? null;

  if (refusal !== null && !(refusal === "unit-holds-people" && options["with-people"] === true)) {
    console.error(refusalSentence(refusal, say));
    if (json) console.log(JSON.stringify({ preview }));
    process.exit(3);
  }

  if (options["dry-run"] === true) {
    if (json) console.log(JSON.stringify({ preview }));
    process.exit(0);
  }

  if (!(await confirmed(preview.plan.name))) process.exit(2);

  const run = await runUnitRemoval(unit, { withPeople: options["with-people"] === true }, context);

  if (json) console.log(JSON.stringify(run));
  out(run.finished ? say(run.already ? "removal.label.already" : "removal.label.finished") : say("removal.message.script_stopped"));
  code = run.finished ? 0 : run.refusal === null ? 1 : 3;
}

process.exit(code);
