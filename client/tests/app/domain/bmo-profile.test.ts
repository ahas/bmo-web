import { describe, expect, test } from "bun:test";

import { callNameProblem, followsLine, headsCompany, nodeRows, permissionRows, settingItems, shownSetting, withCallName } from "../../../apps/web/app/domain/bmo-profile";

import type { PermissionTree } from "../../../apps/web/shared/bmo-profile";

// The BMO profile's groups as their domain lays them out (docs/web.md, 「System and organisation」, the agents tab): a call name
// checked before it is added, the permission rows of one node with what a following row resolves to, and the company's
// default set by its own heads alone.

const t = (key: string) => key;

const TREE: PermissionTree = {
  units: [
    { id: 1, name: "company-a", parent: null, setting: "allow", allowed: true },
    { id: 2, name: "unit-b", parent: 1, setting: "inherit", allowed: true },
    { id: 3, name: "unit-c", parent: 2, setting: "deny", allowed: false }
  ],
  people: [
    { user: "12", name: "person-d", unit: 2, setting: "inherit", allowed: true },
    { user: "13", name: "person-e", unit: 3, setting: "allow", allowed: true }
  ]
};

describe("a call name", () => {
  test("is added once, ignoring case, with no comma, up to ten", () => {
    expect(withCallName(["Dear"], " dear-b ")).toEqual(["Dear", "dear-b"]);
    expect(callNameProblem("dear", ["Dear"])).toBe("bmo_profile.error.call_name_taken");
    expect(callNameProblem("a,b", [])).toBe("bmo_profile.error.call_name_comma");
    expect(callNameProblem("x".repeat(41), [])).toBe("bmo_profile.error.bad_profile");
    expect(callNameProblem("name-k", Array.from({ length: 10 }, (_, index) => `name-${index}`))).toBe("bmo_profile.error.call_names_full");
    expect(withCallName(["Dear"], "dear")).toEqual(["Dear"]);
    expect(withCallName(["Dear"], "  ")).toEqual(["Dear"]);
  });
});

describe("the permission tree", () => {
  test("stands each unit after its parent, a step deeper, and a unit's people under it only while it is open", () => {
    expect(permissionRows(TREE, new Set()).map((row) => [row.key, row.depth])).toEqual([
      ["unit:1", 0],
      ["unit:2", 1],
      ["unit:3", 2]
    ]);
    expect(permissionRows(TREE, new Set([2])).map((row) => [row.key, row.depth])).toEqual([
      ["unit:1", 0],
      ["unit:2", 1],
      ["person:12", 2],
      ["unit:3", 2]
    ]);
  });

  test("offers every row allow, deny and following above, a company following the platform's word", () => {
    const [company, unit] = permissionRows(TREE, new Set());

    expect(settingItems(t, company!.company).map((item) => [item.value, item.label])).toEqual([
      ["allow", "bmo_profile.label.allow"],
      ["deny", "bmo_profile.label.deny"],
      ["inherit", "bmo_profile.label.inherit_platform"]
    ]);
    expect(settingItems(t, unit!.company).map((item) => item.value)).toEqual(["allow", "deny", "inherit"]);
    expect(shownSetting({ setting: "inherit", company: true })).toBe("inherit");
    expect(followsLine(t, { setting: "inherit", allowed: false, company: true })).toBe("bmo_profile.label.follows_platform_denied");
  });

  test("says what a following row resolves to, and nothing under a row set on its own", () => {
    const rows = permissionRows(TREE, new Set([2]));

    expect(followsLine(t, rows.find((row) => row.key === "unit:2")!)).toBe("bmo_profile.label.follows_allowed");
    expect(followsLine(t, rows.find((row) => row.key === "unit:3")!)).toBeNull();
  });

  test("stands one node's own row and the people standing in it, a unit below set at its own node", () => {
    expect(nodeRows(TREE, 2).map((row) => [row.key, row.depth])).toEqual([
      ["unit:2", 1],
      ["person:12", 2]
    ]);
  });

  test("has its default set by a head of the company alone", () => {
    const headed = [
      { id: 2, parent: 1, company: { id: 1 } },
      { id: 3, parent: 2, company: { id: 1 } },
      { id: 9, parent: 8, company: { id: 7 } }
    ];

    expect(headsCompany(headed, 1)).toBe(false);
    expect(headsCompany([{ id: 1, parent: null, company: { id: 1 } }, ...headed], 1)).toBe(true);
  });
});
