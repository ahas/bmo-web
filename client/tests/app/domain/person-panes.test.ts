import { describe, expect, test } from "bun:test";

import { PERSON_PANES, personAdministrator, personPaneOf, personPaneRefused, personPanesFor, withPersonPane } from "../../../apps/web/app/domain/person-panes";

// One person on the people tab stands over a row of tabs, the address naming the one open (docs/web.md,
// 「System and organisation」, the people tab).

const ADMINISTRATOR = personPanesFor({ administrator: true });
const HEAD = personPanesFor({ administrator: false });
// A reader who manages the person's unit's supply, but holds no other part.
const SUPPLY_MANAGER = personPanesFor({ administrator: false, supply: true });

describe("a person's tabs", () => {
  test("stand in order, five at most, the account first", () => {
    expect(PERSON_PANES.map((pane) => pane.value)).toEqual(["account", "organization", "bmo", "supply", "activity"]);
  });

  test("open every tab to the administrator, and to a company head not the activity", () => {
    expect(ADMINISTRATOR).toHaveLength(PERSON_PANES.length);
    expect(HEAD.map((pane) => pane.value)).toEqual(["account", "organization", "bmo"]);
    expect(SUPPLY_MANAGER.map((pane) => pane.value)).toEqual(["account", "organization", "bmo", "supply"]);
  });

  test("open the tab the address names, and the account where it names none the reader may open", () => {
    expect(personPaneOf({ pane: "activity" }, ADMINISTRATOR).value).toBe("activity");
    expect(personPaneOf({ pane: ["activity", "bmo"] }, ADMINISTRATOR).value).toBe("activity");
    expect(personPaneOf({}, ADMINISTRATOR).value).toBe("account");
    expect(personPaneOf({ pane: "activity" }, HEAD).value).toBe("account");
    expect(personPaneOf({ pane: "toString" }, ADMINISTRATOR).value).toBe("account");
  });

  test("take off the address a tab the reader may not open or that is no tab, and nothing else", () => {
    expect(personPaneRefused({ pane: "activity" }, HEAD)).toBe(true);
    expect(personPaneRefused({ pane: "unknown" }, ADMINISTRATOR)).toBe(true);
    expect(personPaneRefused({ pane: "activity" }, ADMINISTRATOR)).toBe(false);
    expect(personPaneRefused({ pane: "account" }, HEAD)).toBe(false);
    expect(personPaneRefused({ user: "7" }, HEAD)).toBe(false);
  });

  test("keep the account as the person's own address and every other key as it stood", () => {
    expect(withPersonPane({ tab: "people", user: "7" }, "bmo")).toEqual({ tab: "people", user: "7", pane: "bmo" });
    expect(withPersonPane({ tab: "people", user: "7", pane: "bmo", q: "a" }, "account")).toEqual({ tab: "people", user: "7", q: "a" });
  });

  test("know whether the person is a platform administrator from their read, else from their list row, else not yet", () => {
    expect(personAdministrator({ administrator: false }, { administrator: true })).toBe(false);
    expect(personAdministrator(null, { administrator: true })).toBe(true);
    expect(personAdministrator(null, null)).toBeNull();
  });
});
