import { describe, expect, test } from "bun:test";

import { rosterGroup } from "../../../apps/web/app/domain/people";
import {
  ROSTER_PAGE,
  rosterActs,
  rosterAddress,
  rosterAsk,
  rosterFiltersSet,
  rosterHiddenHit,
  rosterListKey,
  rosterTreeCompany,
  rosterUserOf,
  rosterViewOf,
  runEnding,
  withRosterFilter,
  withRosterRow,
  withRosterView
} from "../../../apps/web/app/domain/roster";

import type { RosterView } from "../../../apps/web/app/domain/roster";
import type { RosterDetail, RosterPerson } from "../../../apps/web/shared/roster";

// The organisation screen's people tab (docs/web.md, 「Organisation」, the people tab): the address carries the words,
// the four filters and the person open; the list asks the roster a page at a time for what the address shows; each
// person's management menu offers only what the routes behind it let the reader do.

const NOTHING: RosterView = { q: "", company: null, unit: null, role: null, state: null };

const PERSON: RosterPerson = {
  user: "7",
  login: "member-a",
  name: "Member A",
  company: { id: 1, name: "company-a" },
  unit: { id: 2, name: "team-a" },
  head: false,
  administrator: false,
  state: "active",
  machine: null,
  madeAt: 1_700_000_000_000,
  lastSignInAt: null,
  jobTitle: "planner"
};

describe("the people tab's address", () => {
  test("reads the words and the four filters, and none for a key that does not read as its kind", () => {
    expect(rosterViewOf({ q: " team ", company: "1", unit: "2", role: "head", state: "left" })).toEqual({ q: "team", company: 1, unit: 2, role: "head", state: "left" });
    expect(rosterViewOf({ company: "one", unit: "0", role: "owner", state: ["pending"] })).toEqual({ ...NOTHING, state: "pending" });
  });

  test("reads the person open apart from the list", () => {
    expect(rosterUserOf({ user: "7", q: "a" })).toBe("7");
    expect(rosterUserOf({ user: "seven" })).toBeNull();
    expect(rosterListKey(rosterViewOf({ q: "a", user: "7" }))).toBe(rosterListKey(rosterViewOf({ q: "a" })));
  });

  test("writes only the keys set, over the address's other keys, the person open kept", () => {
    expect(withRosterView({ tab: "people", user: "7", q: "old", role: "head" }, { ...NOTHING, q: "new", state: "active" })).toEqual({ tab: "people", user: "7", q: "new", state: "active" });
  });
});

describe("a page of the roster", () => {
  test("asks for every filter set, fifty a page, after the place the page before ended", () => {
    expect(rosterAsk({ q: "a", company: 1, unit: 2, role: "member", state: "active" }, "cursor-1")).toEqual({ q: "a", company: 1, unit: 2, role: "member", state: "active", after: "cursor-1", limit: ROSTER_PAGE });
    expect(rosterAsk(NOTHING)).toEqual({ limit: 50 });
  });
});

describe("the filters", () => {
  test("count those set, the words aside", () => {
    expect(rosterFiltersSet({ ...NOTHING, q: "a" })).toBe(0);
    expect(rosterFiltersSet({ q: "", company: 1, unit: 2, role: "head", state: null })).toBe(3);
  });

  test("let the unit chosen go with the company it stood under", () => {
    expect(withRosterFilter({ ...NOTHING, company: 1, unit: 2 }, "company", 3)).toEqual({ ...NOTHING, company: 3 });
    expect(withRosterFilter({ ...NOTHING, company: 1, unit: 2 }, "role", "head")).toEqual({ ...NOTHING, company: 1, unit: 2, role: "head" });
  });

  test("offer the unit tree of the company chosen, or of the reader's only company", () => {
    const one = [{ id: 1, name: "company-a" }];
    const two = [...one, { id: 3, name: "company-b" }];

    expect(rosterTreeCompany(NOTHING, one)).toBe(1);
    expect(rosterTreeCompany(NOTHING, two)).toBeNull();
    expect(rosterTreeCompany({ ...NOTHING, company: 3 }, two)).toBe(3);
  });
});

describe("a person's management menu", () => {
  test("offers the administrator every act, and none that marks himself left", () => {
    expect(rosterActs({ administrator: true, user: "1" }, PERSON)).toEqual(["move", "machine", "profile", "sections", "bmo", "leave"]);
    expect(rosterActs({ administrator: true, user: "7" }, PERSON)).not.toContain("leave");
  });

  test("offers a company head the BMO permission, and their own profile", () => {
    expect(rosterActs({ administrator: false, user: "9" }, PERSON)).toEqual(["bmo"]);
    expect(rosterActs({ administrator: false, user: "7" }, PERSON)).toEqual(["profile", "bmo"]);
  });

  test("keeps a person who left only their profile", () => {
    expect(rosterActs({ administrator: true, user: "1" }, { ...PERSON, state: "left" })).toEqual(["profile"]);
    expect(rosterActs({ administrator: false, user: "9" }, { ...PERSON, state: "left" })).toEqual([]);
  });
});

describe("a person read again after an act", () => {
  test("stands as they now are in their row, the rest left as they were", () => {
    const other = { ...PERSON, user: "8", name: "Member B" };
    const detail: RosterDetail = { ...PERSON, state: "left", jobTitle: "", path: [], headOf: [], left: { at: 1, byName: "Admin" }, machineStanding: null };
    const rows = withRosterRow([PERSON, other], detail);

    expect(rows.map((row) => row.state)).toEqual(["left", "active"]);
    expect(rows[1]).toBe(other);
    expect(Object.keys(rows[0]!).sort()).toEqual(Object.keys(PERSON).sort());
  });
});

describe("a run of a person's agents", () => {
  test("says it runs until it closed, then how it ended", () => {
    expect(runEnding({ state: "launched", outcome: null }).key).toBe("roster.status.run_running");
    expect(runEnding({ state: "closed", outcome: "failed" }).key).toBe("roster.status.run_failed");
    expect(runEnding({ state: "closed", outcome: null }).key).toBe("roster.status.run_ended");
    expect(runEnding({ state: "closed", outcome: "toString" })).toEqual({ key: "roster.status.run_ended_as", outcome: "toString" });
  });
});

describe("the console search, for a reader who opens the people tab", () => {
  test("opens a person on the tab, the company and the unit beside the name, the login and the job title matched too", () => {
    const group = rosterGroup((key) => key, [PERSON, { ...PERSON, user: "8", unit: { id: 1, name: "company-a" } }]);

    expect(group.entries.map((entry) => entry.to)).toEqual([rosterAddress("7"), rosterAddress("8")]);
    expect(rosterAddress("7")).toBe("/organization?tab=people&user=7");
    expect(group.entries.map((entry) => entry.prefix)).toEqual(["company-a team-a", "company-a"]);
    expect(group.entries[0]?.hidden).toEqual([
      { label: "account.label.user_id", text: "member-a" },
      { label: "people.label.job_title", text: "planner" }
    ]);
  });
});

describe("a search hit a row does not show", () => {
  const LABELS = { jobTitle: "title", email: "mail" };
  const SHOWN = [PERSON.name, PERSON.unit.name];

  test("is said under the row by its field where only the job title or the email holds it", () => {
    expect(rosterHiddenHit(PERSON, "plan", SHOWN, LABELS)).toEqual({ label: "title", snippet: "planner" });
    expect(rosterHiddenHit({ ...PERSON, email: "member-a@example.com" }, "example", SHOWN, LABELS)).toEqual({ label: "mail", snippet: "member-a@example.com" });
  });

  test("is none where the row's own words hold it, or nothing is searched", () => {
    expect(rosterHiddenHit({ ...PERSON, jobTitle: "team-a lead" }, "team", SHOWN, LABELS)).toBeNull();
    expect(rosterHiddenHit(PERSON, "", SHOWN, LABELS)).toBeNull();
  });
});
