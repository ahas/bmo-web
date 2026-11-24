// The platform administrator's permanent delete, run as one cascade (docs/web.md, the organisation screen's permanent delete, and 「Deleting an
// account or a unit from the machine」; docs/accounts.md, 「Deleting an account for good」, 「Deleting a unit or a
// company」): the account service says whether an account or a unit may go and what it holds, every content unit
// removes what it keeps of it, in order, and the account service removes its own rows last, keeping every unit's
// result in its record. A unit that fails stops the cascade with what went so far, and running it again resumes it,
// every step being idempotent and the account service's own rows going last.
//
// The module imports what it reads by path and asks nothing of the framework, so the console's removal script runs
// the same cascade as the screen's routes.

import { AccountRefusal, accountRemoval, markLeft, removeAccount, removeUnit, unitRemoval } from "./account-service";
import { unitAt, unitHeaders } from "./units";

import type { RemovalUnits, ServiceOptions } from "./account-service";
import type { AccountRemoval, UnitRemoval } from "@web/server-client";
import type { RemovalCounts, RemovalFailure, RemovalOutcome, RemovalStep, RemovalUnitCount } from "#shared/removal";

/** One content unit the cascade asks: its name, the key its result is kept under; the settings prefix its address
 * and token stand under; the path its account removal stands at; and whether it reads the administrator from the
 * call's `Owner-Key` and `Owner-Role` or takes its token alone as his. */
export interface ContentUnit {
  name: string;
  setting: string;
  accounts: string;
  asAdministrator: boolean;
}

/** The content units in the order the cascade asks them (docs/boundary.md, 「Calls the console makes」). */
export const REMOVAL_UNITS: readonly ContentUnit[] = [
  { name: "agency", setting: "AGENCY", accounts: "/owners", asAdministrator: true },
  { name: "receiver", setting: "RECEIVER", accounts: "/accounts", asAdministrator: true },
  { name: "brain", setting: "ORG_BRAIN", accounts: "/accounts", asAdministrator: false },
  { name: "artifact", setting: "ARTIFACT", accounts: "/accounts", asAdministrator: true },
  { name: "note", setting: "NOTE", accounts: "/accounts", asAdministrator: true },
  { name: "mail", setting: "MAIL", accounts: "/owners", asAdministrator: true },
  { name: "pocket", setting: "POCKET", accounts: "/accounts", asAdministrator: true },
  { name: "calendar", setting: "CALENDAR", accounts: "/accounts", asAdministrator: true }
];

/** The name the account service's own step is kept under. */
export const SERVICE_UNIT = "web";

/** What a removal runs with: the administrator it acts as, the environment the units' settings stand in, the account
 * service's address, the content units it asks, and a hook told each step as it ends. */
export interface RemovalContext {
  administrator: string;
  environment?: Record<string, string | undefined>;
  service?: ServiceOptions;
  units?: readonly ContentUnit[];
  onStep?: (step: RemovalStep, subject: string) => void;
}

/** What a removal did. */
export interface RemovalRun {
  finished: boolean;
  already: boolean;
  refusal: string | null;
  steps: RemovalStep[];
  people: { user: string; name: string; run: RemovalRun }[];
}

// What one unit's call came to: its counts, its address not set, or a failure with the unit's own words, which go to
// the script's lines and the log alone.
type UnitAnswer = { state: "answered"; counts: RemovalCounts } | { state: "unset" } | { state: "failed"; failure: RemovalFailure; said: string | null };

/** The unit's own words for a failed step, kept beside the steps for the script and the log; never for a page. */
export const failureWords = new WeakMap<RemovalStep, string>();

function unitsOf(context: RemovalContext): readonly ContentUnit[] {
  return context.units ?? REMOVAL_UNITS;
}

// A unit's answer read as each kind and a whole number, from the field it carries them in.
function countsIn(body: unknown, field: "counts" | "removed"): RemovalCounts | null {
  if (typeof body !== "object" || body === null) return null;

  const held: unknown = Reflect.get(body, field);

  if (typeof held !== "object" || held === null || Array.isArray(held)) return null;

  const counts: RemovalCounts = {};

  for (const [kind, count] of Object.entries(held)) {
    if (typeof count !== "number" || !Number.isInteger(count) || count < 0) return null;
    counts[kind] = count;
  }

  return counts;
}

async function unitCall(unit: ContentUnit, context: RemovalContext, method: "GET" | "DELETE", path: string, field: "counts" | "removed"): Promise<UnitAnswer> {
  const address = unitAt(unit.setting, context.environment);

  if (address === null) return { state: "unset" };

  const headers: Record<string, string> = { ...unitHeaders(address), accept: "application/json" };

  if (unit.asAdministrator) {
    headers["Owner-Key"] = context.administrator;
    headers["Owner-Role"] = "administrator";
  }

  let response: Response;

  try {
    response = await fetch(`${address.address}${path}`, { method, headers });
  } catch (error) {
    return { state: "failed", failure: { status: null, code: null }, said: error instanceof Error ? error.message : null };
  }

  const text = await response.text().catch(() => "");
  let body: unknown = null;

  try {
    body = text === "" ? null : JSON.parse(text);
  } catch {
    body = null;
  }

  if (!response.ok) {
    const code = typeof body === "object" && body !== null ? Reflect.get(body, "code") : null;
    const said = typeof body === "object" && body !== null ? Reflect.get(body, "error") : null;

    return { state: "failed", failure: { status: response.status, code: typeof code === "string" ? code : null }, said: typeof said === "string" ? said : null };
  }

  const counts = countsIn(body, field);

  if (counts === null) return { state: "failed", failure: { status: response.status, code: "unreadable" }, said: "the answer holds no counts" };

  return { state: "answered", counts };
}

const accountPath = (unit: ContentUnit, user: string): string => `${unit.accounts}/${encodeURIComponent(user)}`;

const orgUnitPath = (unit: number, company: number, read = false): string => `/org-units/${unit}${read ? "/removal" : ""}?company=${company}`;

// A refusal or silence of the account service as a step's failure, with its own words for the log.
function serviceFailure(error: unknown): { failure: RemovalFailure; said: string | null } {
  if (error instanceof AccountRefusal) return { failure: { status: error.status, code: error.code }, said: error.detail };

  return { failure: { status: null, code: null }, said: error instanceof Error ? error.message : null };
}

/** What every content unit counts of a subject, asked side by side, in the cascade's order. */
async function unitCounts(context: RemovalContext, path: (unit: ContentUnit) => string): Promise<RemovalUnitCount[]> {
  return await Promise.all(
    unitsOf(context).map(async (unit): Promise<RemovalUnitCount> => {
      const answer = await unitCall(unit, context, "GET", path(unit), "counts");

      if (answer.state === "answered") return { unit: unit.name, state: "counted", counts: answer.counts };

      return { unit: unit.name, state: answer.state === "unset" ? "unset" : "failed", counts: {} };
    })
  );
}

/** What removing an account would take now, the account service's own count last; null where it does not stand. */
export async function accountRemovalPreview(user: string, context: RemovalContext): Promise<{ plan: AccountRemoval; units: RemovalUnitCount[] } | null> {
  const plan = await accountRemoval(user, context.administrator, context.service);

  if (plan === null) return null;

  const units = await unitCounts(context, (unit) => `${accountPath(unit, user)}/removal`);

  return { plan, units: [...units, { unit: SERVICE_UNIT, state: "counted", counts: plan.counts }] };
}

/** What removing a unit and every unit under it would take now, each content unit's count summed over the subtree,
 * the account service's own last; null where it does not stand. */
export async function unitRemovalPreview(unit: number, context: RemovalContext): Promise<{ plan: UnitRemoval; units: RemovalUnitCount[] } | null> {
  const plan = await unitRemoval(unit, context.administrator, context.service);

  if (plan === null) return null;

  const units = await Promise.all(
    unitsOf(context).map(async (content): Promise<RemovalUnitCount> => {
      const summed: RemovalCounts = {};

      for (const each of plan.units) {
        const answer = await unitCall(content, context, "GET", orgUnitPath(each.id, plan.company, true), "counts");

        if (answer.state !== "answered") return { unit: content.name, state: answer.state === "unset" ? "unset" : "failed", counts: {} };

        for (const [kind, count] of Object.entries(answer.counts)) summed[kind] = (summed[kind] ?? 0) + count;
      }

      return { unit: content.name, state: "counted", counts: summed };
    })
  );

  return { plan, units: [...units, { unit: SERVICE_UNIT, state: "counted", counts: plan.counts }] };
}

function stepped(steps: RemovalStep[], step: RemovalStep, subject: string, context: RemovalContext, said: string | null = null): void {
  if (said !== null) failureWords.set(step, said);
  steps.push(step);
  context.onStep?.(step, subject);
}

// The steps not reached once one failed.
function pendingAfter(steps: RemovalStep[], names: readonly string[]): void {
  for (const unit of names) steps.push({ unit, state: "pending", removed: {}, failure: null });
}

// Each content unit asked to remove what it keeps, in order, by the paths `pathsOf` gives it; the results gathered,
// or the steps up to the one that failed.
async function contentSteps(context: RemovalContext, subject: string, pathsOf: (unit: ContentUnit) => string[]): Promise<{ steps: RemovalStep[]; gathered: RemovalUnits; failed: boolean }> {
  const steps: RemovalStep[] = [];
  const gathered: RemovalUnits = {};
  const units = unitsOf(context);

  for (const [index, unit] of units.entries()) {
    const removed: RemovalCounts = {};
    let outcome: UnitAnswer | null = null;

    for (const path of pathsOf(unit)) {
      const answer = await unitCall(unit, context, "DELETE", path, "removed");

      if (answer.state !== "answered") {
        outcome = answer;
        break;
      }

      for (const [kind, count] of Object.entries(answer.counts)) removed[kind] = (removed[kind] ?? 0) + count;
    }

    if (outcome?.state === "unset") {
      stepped(steps, { unit: unit.name, state: "skipped", removed: {}, failure: null }, subject, context);
      continue;
    }

    if (outcome?.state === "failed") {
      stepped(steps, { unit: unit.name, state: "failed", removed, failure: outcome.failure }, subject, context, outcome.said);
      pendingAfter(steps, [...units.slice(index + 1).map((each) => each.name), SERVICE_UNIT]);

      return { steps, gathered, failed: true };
    }

    gathered[unit.name] = removed;
    stepped(steps, { unit: unit.name, state: "removed", removed, failure: null }, subject, context);
  }

  return { steps, gathered, failed: false };
}

/** An account removed for good: checked, marked left where `leave` asks for it, every content unit's part removed, and
 * the account service's own last. */
export async function runAccountRemoval(user: string, ask: { leave: boolean }, context: RemovalContext): Promise<RemovalRun> {
  const stopped = (refusal: string): RemovalRun => ({ finished: false, already: false, refusal, steps: [], people: [] });
  const plan = await accountRemoval(user, context.administrator, context.service);

  if (plan === null) return { finished: true, already: true, refusal: null, steps: [], people: [] };

  if (plan.refusal === "not-left" && ask.leave) {
    try {
      await markLeft(user, { key: context.administrator, role: "administrator" }, context.service);
    } catch (error) {
      const { failure, said } = serviceFailure(error);
      const steps: RemovalStep[] = [];

      stepped(steps, { unit: SERVICE_UNIT, state: "failed", removed: {}, failure }, user, context, said);

      return { finished: false, already: false, refusal: null, steps, people: [] };
    }
  } else if (plan.refusal !== null && plan.refusal !== undefined) {
    return stopped(plan.refusal);
  }

  const content = await contentSteps(context, user, (unit) => [accountPath(unit, user)]);

  if (content.failed) return { finished: false, already: false, refusal: null, steps: content.steps, people: [] };

  const steps = content.steps;

  try {
    const removed = await removeAccount(user, content.gathered, context.administrator, context.service);

    stepped(steps, { unit: SERVICE_UNIT, state: "removed", removed: removed?.removed ?? {}, failure: null }, user, context);
  } catch (error) {
    const { failure, said } = serviceFailure(error);

    stepped(steps, { unit: SERVICE_UNIT, state: "failed", removed: {}, failure }, user, context, said);

    return { finished: false, already: false, refusal: null, steps, people: [] };
  }

  return { finished: true, already: false, refusal: null, steps, people: [] };
}

/** A unit and every unit under it removed for good: checked, its people's accounts removed first where `withPeople`
 * asks for it, every content unit's part of each unit, the deepest first, and the account service's own last. */
export async function runUnitRemoval(unit: number, ask: { withPeople: boolean }, context: RemovalContext): Promise<RemovalRun> {
  const plan = await unitRemoval(unit, context.administrator, context.service);

  if (plan === null) return { finished: true, already: true, refusal: null, steps: [], people: [] };

  const refusal = plan.refusal ?? null;

  if (refusal !== null && !(refusal === "unit-holds-people" && ask.withPeople)) {
    return { finished: false, already: false, refusal, steps: [], people: [] };
  }

  const people: RemovalRun["people"] = [];

  for (const person of plan.people) {
    const run = await runAccountRemoval(person.user, { leave: true }, context);

    people.push({ user: person.user, name: person.name, run });

    if (!run.finished) return { finished: false, already: false, refusal: null, steps: [], people };
  }

  const subject = String(unit);
  const content = await contentSteps(context, subject, () => plan.units.map((each) => orgUnitPath(each.id, plan.company)));

  if (content.failed) return { finished: false, already: false, refusal: null, steps: content.steps, people };

  const steps = content.steps;

  try {
    const removed = await removeUnit(unit, content.gathered, context.administrator, context.service);

    stepped(steps, { unit: SERVICE_UNIT, state: "removed", removed: removed?.removed ?? {}, failure: null }, subject, context);
  } catch (error) {
    const { failure, said } = serviceFailure(error);

    stepped(steps, { unit: SERVICE_UNIT, state: "failed", removed: {}, failure }, subject, context, said);

    return { finished: false, already: false, refusal: null, steps, people };
  }

  return { finished: true, already: false, refusal: null, steps, people };
}

/** A removal as a page reads it: each step and each person's, with no unit's own words. */
export function removalOutcome(run: RemovalRun): RemovalOutcome {
  return {
    finished: run.finished,
    already: run.already,
    refusal: run.refusal,
    steps: run.steps,
    people: run.people.map((person) => ({ user: person.user, name: person.name, finished: person.run.finished, steps: person.run.steps }))
  };
}

/** Each failed step of a removal with the unit's own words, as lines for the log. */
export function removalFailureLines(run: RemovalRun, subject: string): string[] {
  const lines = run.steps
    .filter((step) => step.state === "failed")
    .map((step) => `removal of ${subject}: ${step.unit} failed (${step.failure?.status ?? "unreached"} ${step.failure?.code ?? ""}) ${failureWords.get(step) ?? ""}`.trim());

  return [...lines, ...run.people.flatMap((person) => removalFailureLines(person.run, `account ${person.user}`))];
}
