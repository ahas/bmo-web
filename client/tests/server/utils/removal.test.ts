import { beforeEach, describe, expect, test } from "bun:test";

import { kindLines } from "../../../apps/web/shared/removal";
import { wording } from "../../../apps/web/shared/wording";
import { accountRemovalPreview, runAccountRemoval, runUnitRemoval } from "../../../apps/web/server/utils/removal";
import { answer, standIn } from "../../support/units";

import type { ContentUnit, RemovalContext } from "../../../apps/web/server/utils/removal";

// The permanent delete's cascade (docs/web.md, the organisation screen's permanent delete; docs/accounts.md, 「Deleting an account for good」,
// 「Deleting a unit or a company」): the account service is asked first and last, every content unit in order between,
// each by its own removal path and with the administrator's headers where it reads them; a unit whose address is not
// set is passed over; a failing unit stops the cascade, and running it again resumes it until the account service
// answers the account gone.

const PERSON = "5";
const UNIT = 40;
const CHILD = 41;
const COMPANY = 10;

// What the account service stand-in holds.
const service = { left: false, removed: false, unitRemoved: false, kept: [] as unknown[] };

function personRead(): Response {
  if (service.removed) return answer({ code: "not-found", error: "No such user." }, 404);

  return answer({ user: PERSON, name: "member-a", fullName: "Member A", left: service.left, administrator: false, refusal: service.left ? null : "not-left", counts: { users: 1, profiles: 1 } });
}

const accounts = standIn(
  "REMOVAL_WEB_SERVER",
  (one) => {
    if (one.method === "GET" && one.path === `/users/${PERSON}/removal`) return personRead();
    if (one.method === "POST" && one.path === `/users/${PERSON}/leave`) {
      service.left = true;
      return new Response(null, { status: 204 });
    }
    if (one.method === "DELETE" && one.path === `/users/${PERSON}`) {
      if (service.removed) return answer({ code: "not-found", error: "No such user." }, 404);
      service.removed = true;
      service.kept.push(one.body);
      return answer({ removed: { users: 1, profiles: 1 }, record: 7 });
    }
    if (one.method === "GET" && one.path === `/units/${UNIT}/removal`) {
      if (service.unitRemoved) return answer({ code: "not-found", error: "No such unit." }, 404);
      const people = service.removed ? [] : [{ user: PERSON, name: "Member A", left: service.left, administrator: false }];

      return answer({ unit: UNIT, name: "team-a", company: COMPANY, units: [{ id: CHILD, name: "part-a" }, { id: UNIT, name: "team-a" }], people, refusal: people.length > 0 ? "unit-holds-people" : null, counts: { units: 2 } });
    }
    if (one.method === "DELETE" && one.path === `/units/${UNIT}`) {
      service.unitRemoved = true;
      service.kept.push(one.body);
      return answer({ removed: { units: 2 }, record: 8 });
    }

    return answer({ code: "failed", error: "Not served here." }, 500);
  },
  { headers: true }
);

// Two content units and a third with no address; the second fails once where told to.
let failing = false;

const first = standIn(
  "REMOVAL_FIRST",
  (one) => (one.path.includes("/removal") ? answer({ counts: { supervisors: 1, sessions: 2 } }) : answer({ removed: { supervisors: 1, sessions: 2 } })),
  { headers: true }
);
const second = standIn(
  "REMOVAL_SECOND",
  (one) => {
    if (one.method === "DELETE" && failing) {
      failing = false;
      return answer({ code: "failed", error: "The store did not answer." }, 500);
    }

    return one.path.includes("/removal") ? answer({ counts: { brains: 1 } }) : answer({ removed: { brains: 1 } });
  },
  { headers: true }
);

const UNITS: ContentUnit[] = [
  { name: "agency", setting: "REMOVAL_FIRST", accounts: "/owners", asAdministrator: true },
  { name: "brain", setting: "REMOVAL_SECOND", accounts: "/accounts", asAdministrator: false },
  { name: "calendar", setting: "REMOVAL_UNSET", accounts: "/accounts", asAdministrator: true }
];

const context = (): RemovalContext => ({
  administrator: "1",
  environment: { REMOVAL_FIRST_ADDRESS: first.address, REMOVAL_SECOND_ADDRESS: second.address },
  service: { address: accounts.address, token: "the token" },
  units: UNITS
});

beforeEach(() => {
  Object.assign(service, { left: false, removed: false, unitRemoved: false, kept: [] });
  failing = false;
  for (const stood of [accounts, first, second]) stood.asked.length = 0;
});

const deletes = (stood: { asked: { method: string; path: string }[] }) => stood.asked.filter((one) => one.method === "DELETE").map((one) => one.path);

describe("an account's removal", () => {
  test("is refused an account not left, before any unit is asked", async () => {
    const run = await runAccountRemoval(PERSON, { leave: false }, context());

    expect(run).toMatchObject({ finished: false, refusal: "not-left", steps: [] });
    expect([...deletes(first), ...deletes(second), ...deletes(accounts)]).toEqual([]);
  });

  test("marks the person left where asked, asks each unit in order and the account service last with every result", async () => {
    const run = await runAccountRemoval(PERSON, { leave: true }, context());

    expect(run.finished).toBe(true);
    expect(run.steps.map((step) => [step.unit, step.state])).toEqual([
      ["agency", "removed"],
      ["brain", "removed"],
      ["calendar", "skipped"],
      ["web", "removed"]
    ]);
    expect(deletes(first)).toEqual([`/owners/${PERSON}`]);
    expect(deletes(second)).toEqual([`/accounts/${PERSON}`]);
    // The unit that reads the administrator is told him; the one that takes its token alone is told nothing.
    expect(first.asked[0]?.headers?.["owner-key"]).toBe("1");
    expect(first.asked[0]?.headers?.["owner-role"]).toBe("administrator");
    expect(second.asked[0]?.headers?.["owner-key"]).toBeUndefined();
    expect(service.kept).toEqual([{ units: { agency: { supervisors: 1, sessions: 2 }, brain: { brains: 1 } } }]);
  });

  test("stops at a failing unit with what went so far, and a second run resumes it to the end", async () => {
    failing = true;

    const stopped = await runAccountRemoval(PERSON, { leave: true }, context());

    expect(stopped.finished).toBe(false);
    expect(stopped.steps.map((step) => [step.unit, step.state])).toEqual([
      ["agency", "removed"],
      ["brain", "failed"],
      ["calendar", "pending"],
      ["web", "pending"]
    ]);
    expect(stopped.steps[1]?.failure).toEqual({ status: 500, code: "failed" });
    expect(deletes(accounts)).toEqual([]);

    const resumed = await runAccountRemoval(PERSON, { leave: false }, context());

    expect(resumed.finished).toBe(true);
    expect(deletes(accounts)).toEqual([`/users/${PERSON}`]);

    const again = await runAccountRemoval(PERSON, { leave: false }, context());

    expect(again).toMatchObject({ finished: true, already: true, steps: [] });
  });

  test("counts each unit's part, a unit with no address said so, the account service's own last", async () => {
    const preview = await accountRemovalPreview(PERSON, context());

    expect(preview?.units).toEqual([
      { unit: "agency", state: "counted", counts: { supervisors: 1, sessions: 2 } },
      { unit: "brain", state: "counted", counts: { brains: 1 } },
      { unit: "calendar", state: "unset", counts: {} },
      { unit: "web", state: "counted", counts: { users: 1, profiles: 1 } }
    ]);
    expect(first.asked.map((one) => one.path)).toEqual([`/owners/${PERSON}/removal`]);
  });
});

describe("a unit's removal", () => {
  test("is refused while people stand in it unless they are deleted too", async () => {
    const run = await runUnitRemoval(UNIT, { withPeople: false }, context());

    expect(run).toMatchObject({ finished: false, refusal: "unit-holds-people" });
    expect(deletes(first)).toEqual([]);
  });

  test("removes the people first, then each unit's part of every unit the deepest first, then the account service's", async () => {
    const run = await runUnitRemoval(UNIT, { withPeople: true }, context());

    expect(run.finished).toBe(true);
    expect(run.people.map((person) => [person.user, person.run.finished])).toEqual([[PERSON, true]]);
    expect(deletes(first)).toEqual([`/owners/${PERSON}`, `/org-units/${CHILD}?company=${COMPANY}`, `/org-units/${UNIT}?company=${COMPANY}`]);
    expect(deletes(second)).toEqual([`/accounts/${PERSON}`, `/org-units/${CHILD}?company=${COMPANY}`, `/org-units/${UNIT}?company=${COMPANY}`]);
    expect(deletes(accounts)).toEqual([`/users/${PERSON}`, `/units/${UNIT}`]);
    expect(service.kept.at(-1)).toEqual({ units: { agency: { supervisors: 2, sessions: 4 }, brain: { brains: 2 } } });

    expect(await runUnitRemoval(UNIT, { withPeople: false }, context())).toMatchObject({ finished: true, already: true });
  });
});

describe("a unit's counts as the dialog says them", () => {
  test("stand each kind in its word, every kind with none for it summed as other records, and none left out", () => {
    const lines = kindLines({ supervisors: 2, "unheard-of": 3, "also-unheard": 1, sessions: 0 }, wording);

    expect(lines).toEqual([
      { label: wording("removal.label.kind.supervisors"), count: 2 },
      { label: wording("removal.label.kind.other"), count: 4 }
    ]);
  });
});
