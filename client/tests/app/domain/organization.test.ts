import { describe, expect, test } from "bun:test";

import {
  ORGANIZATION_PATH,
  ORGANIZATION_TABS,
  branchesAbove,
  branchesOpenAtFirst,
  movePlan,
  organizationAddress,
  organizationMovedAway,
  organizationTabNamed,
  organizationTabOf,
  organizationTabsFor,
  unitBranches,
  unitPath
} from "../../../apps/web/app/domain/organization";

import type { UnitBranch, UnitPlace, UnitStanding } from "../../../apps/web/app/domain/organization";
import { ADMIN_PATH } from "../../../apps/web/app/domain/administration";
import { SETTINGS_SECTIONS, sectionsFor } from "../../../apps/web/app/domain/settings-dialog";
import { SCREENS, tabAddress } from "../../../apps/web/app/domain/screens";

// The settings dialog holds what a person sets for themselves alone, their secrets and the voice briefing among it, and the organisation
// settings screen what is set for the whole deployment or for other people, a tab to a section; the research
// supervisor stands on the research screen (docs/web.md, 「Settings」 and 「Organisation settings」).

describe("the settings dialog", () => {
  test("holds the personal sections alone, the voice briefing under its own name", () => {
    expect(SETTINGS_SECTIONS.map((section) => section.key)).toEqual(["account", "secrets", "theme", "palette", "notifications", "briefing"]);
    expect(SETTINGS_SECTIONS.find((section) => section.key === "briefing")?.label).toBe("settings.label.briefing");
  });

  test("shows a member their account, secrets, theme and palette, and the administrator the notifications and the player too", () => {
    expect(sectionsFor(false, true).map((section) => section.key)).toEqual(["account", "secrets", "theme", "palette"]);
    expect(sectionsFor(true, true).map((section) => section.key)).toEqual(["account", "secrets", "theme", "palette", "notifications", "briefing"]);
  });

  test("shows no secrets to a login with no user, which holds no space", () => {
    expect(sectionsFor(true, false).map((section) => section.key)).not.toContain("secrets");
  });

  test("leads every key that moved to its tab of the organisation screen or the administrator's, and keeps its own keys", () => {
    for (const key of ["organization", "invites", "permissions"]) {
      expect({ key, moved: organizationTabNamed(key)?.value ?? null }).toEqual({ key, moved: key });
    }

    expect(organizationMovedAway("providers")).toEqual({ path: ADMIN_PATH, query: {} });
    expect(organizationMovedAway("secret-kinds")).toEqual({ path: ADMIN_PATH, query: { tab: "secret-kinds" } });

    expect(organizationTabNamed("account")).toBeNull();
    expect(organizationTabNamed("research")).toBeNull();
    expect(organizationTabNamed("briefing")).toBeNull();
    expect(organizationTabNamed("secrets")).toBeNull();
  });
});

describe("the organisation screen", () => {
  test("stands its tabs in order, the units first", () => {
    expect(ORGANIZATION_TABS.map((tab) => tab.value)).toEqual(["organization", "invites", "permissions"]);
  });

  test("leads the keys of the sections that moved away to where they stand now, and no other key", () => {
    expect(organizationMovedAway("research")).toEqual({ path: "/research", query: { tab: "settings" } });
    expect(organizationMovedAway("briefing")).toEqual({ path: ORGANIZATION_PATH, query: { settings: "briefing" } });
    expect(organizationMovedAway("secrets")).toEqual({ path: ORGANIZATION_PATH, query: { settings: "secrets" } });

    for (const key of [...ORGANIZATION_TABS.map((tab) => tab.value), "account", "toString", undefined, ["research"]]) {
      expect({ key, moved: organizationMovedAway(key) }).toEqual({ key, moved: null });
    }
  });

  test("opens every tab to the administrator and the invitations tab alone to a member", () => {
    expect(organizationTabsFor(true)).toHaveLength(ORGANIZATION_TABS.length);
    expect(organizationTabsFor(false).map((tab) => tab.value)).toEqual(["invites"]);
  });

  test("opens the first tab a reader may for a key naming none of theirs", () => {
    expect(organizationTabOf("permissions", organizationTabsFor(true)).value).toBe("permissions");
    expect(organizationTabOf("permissions", organizationTabsFor(false)).value).toBe("invites");
    expect(organizationTabOf(undefined, organizationTabsFor(true)).value).toBe("organization");
  });

  test("keeps a tab in the address, the first being the screen's own, and lets the chosen unit go with the tab it stood on", () => {
    expect(organizationAddress("organization", { unit: "3" })).toEqual({ path: ORGANIZATION_PATH, query: {} });
    expect(organizationAddress("permissions", { unit: "3", tab: "invites" })).toEqual({ path: ORGANIZATION_PATH, query: { tab: "permissions" } });
  });

  test("stands in the sidebar and the search with its tabs, after the console's other screens and before the administrator's", () => {
    const screen = SCREENS.at(-2)!;
    const admin = SCREENS.at(-1)!;

    expect(screen.to).toBe(ORGANIZATION_PATH);
    expect(screen.inviters).toBe(true);
    expect(screen.tabs?.map((tab) => tabAddress(screen, tab))).toEqual(["/organization", "/organization?tab=invites", "/organization?tab=permissions"]);
    expect(admin.to).toBe(ADMIN_PATH);
    expect(admin.administrator).toBe(true);
    expect(admin.tabs?.map((tab) => tabAddress(admin, tab))).toEqual(["/admin", "/admin?tab=secret-kinds"]);
  });
});

// Three levels under one company and a second company beside it, given children before their parents.
const UNITS: UnitPlace[] = [
  { id: 4, name: "part-a", parent: 3 },
  { id: 3, name: "team-a", parent: 2 },
  { id: 5, name: "team-b", parent: 2 },
  { id: 2, name: "company-a", parent: null },
  { id: 6, name: "company-b" }
];

// A tree as nested names, a branch's children in brackets after it.
function shape(branches: UnitBranch<UnitPlace>[]): unknown[] {
  return branches.map(({ unit, children }) => (children.length === 0 ? unit.name : [unit.name, shape(children)]));
}

describe("the units tab's tree", () => {
  test("stands the companies at its top and every unit under its parent, three levels deep", () => {
    expect(shape(unitBranches(UNITS))).toEqual([["company-a", [["team-a", ["part-a"]], "team-b"]], "company-b"]);
  });

  test("stands a unit whose parent it does not hold at its top", () => {
    expect(shape(unitBranches(UNITS.filter((unit) => unit.id !== 3)))).toEqual(["part-a", ["company-a", ["team-b"]], "company-b"]);
  });

  test("walks a unit's path from its company down, and none for a unit it does not hold", () => {
    expect(unitPath(UNITS, 4).map((unit) => unit.name)).toEqual(["company-a", "team-a", "part-a"]);
    expect(unitPath(UNITS, 6).map((unit) => unit.name)).toEqual(["company-b"]);
    expect(unitPath(UNITS, 9)).toEqual([]);
  });

  test("ends a path that loops back on itself", () => {
    const looped: UnitPlace[] = [
      { id: 1, name: "a", parent: 2 },
      { id: 2, name: "b", parent: 1 }
    ];

    expect(unitPath(looped, 1).map((unit) => unit.name)).toEqual(["b", "a"]);
  });

  test("opens every company at first and every branch down to the unit chosen", () => {
    expect(branchesOpenAtFirst(UNITS, null)).toEqual([2, 6]);
    expect(branchesOpenAtFirst(UNITS, 2)).toEqual([2, 6]);
    expect(branchesOpenAtFirst(UNITS, 4)).toEqual([2, 6, 3]);
    expect(branchesAbove(UNITS, 4)).toEqual([2, 3]);
    expect(branchesAbove(UNITS, 2)).toEqual([]);
  });
});

// A move of several people shows who goes where before anything is written (docs/web.md, 「Organisation settings」,
// its chart): each person from the unit they stand in, their role before and after, and the head grant the move takes.
describe("a move of several people", () => {
  const units: UnitStanding[] = [
    { id: 1, name: "company-a", parent: null, heads: [], members: [] },
    { id: 2, name: "team-a", parent: 1, heads: ["10"], members: ["10", "11"] },
    { id: 3, name: "team-b", parent: 1, heads: ["12"], members: ["12"] }
  ];

  test("moves each person from the unit they stand in, and takes away the head grant of the unit a head leaves", () => {
    expect(movePlan(units, [{ user: "10", head: false }, { user: "11", head: true }], 3)).toEqual([
      { user: "10", from: 2, to: 3, wasHead: true, head: false, headDropped: true, unchanged: false },
      { user: "11", from: 2, to: 3, wasHead: false, head: true, headDropped: false, unchanged: false }
    ]);
  });

  test("changes a role without a move, and marks a person it leaves as they stand", () => {
    expect(movePlan(units, [{ user: "11", head: true }, { user: "12", head: true }], 3).map(({ user, headDropped, unchanged }) => ({ user, headDropped, unchanged }))).toEqual([
      { user: "11", headDropped: false, unchanged: false },
      { user: "12", headDropped: false, unchanged: true }
    ]);
    expect(movePlan(units, [{ user: "10", head: false }], 2)[0]).toMatchObject({ wasHead: true, head: false, headDropped: false, unchanged: false });
  });

  test("leaves out a person no unit holds", () => {
    expect(movePlan(units, [{ user: "99", head: false }], 3)).toEqual([]);
  });
});
