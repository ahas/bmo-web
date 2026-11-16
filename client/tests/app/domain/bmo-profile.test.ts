import { describe, expect, test } from "bun:test";

import { callNameProblem, followsLine, headsCompany, permissionRows, permissionTops, settingItems, shownSetting, withCallName } from "../../../apps/web/app/domain/bmo-profile";
import { sectionsFor } from "../../../apps/web/app/domain/settings-dialog";

import type { PermissionTree } from "../../../apps/web/shared/bmo-profile";

// The BMO profile's screens as their domain lays them out (docs/web.md, 「Organisation」, its BMO tab, and 「Settings」,
// its own-BMO section): a call name checked before it is added, the permission tree as rows with what a following row
// resolves to, the units a head reads it from, and the own-BMO section shown only to a reader who may personalise.

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

  test("offers a company allow and deny alone, and shows a company with nothing set as denied", () => {
    const [company, unit] = permissionRows(TREE, new Set());

    expect(settingItems(t, company!.company).map((item) => item.value)).toEqual(["allow", "deny"]);
    expect(settingItems(t, unit!.company).map((item) => item.value)).toEqual(["allow", "deny", "inherit"]);
    expect(shownSetting({ setting: "inherit", company: true })).toBe("deny");
  });

  test("says what a following row resolves to, and nothing under a row set on its own", () => {
    const rows = permissionRows(TREE, new Set([2]));

    expect(followsLine(t, rows.find((row) => row.key === "unit:2")!)).toBe("bmo_profile.label.follows_allowed");
    expect(followsLine(t, rows.find((row) => row.key === "unit:3")!)).toBeNull();
  });

  test("is read from the highest units a head heads in the company, and its default set by a head of the company alone", () => {
    const headed = [
      { id: 2, parent: 1, company: { id: 1 } },
      { id: 3, parent: 2, company: { id: 1 } },
      { id: 9, parent: 8, company: { id: 7 } }
    ];

    expect(permissionTops(headed, 1)).toEqual([2]);
    expect(headsCompany(headed, 1)).toBe(false);
    expect(headsCompany([{ id: 1, parent: null, company: { id: 1 } }, ...headed], 1)).toBe(true);
  });
});

describe("the own-BMO section", () => {
  test("is listed only for a reader with a user who may personalise their BMO", () => {
    expect(sectionsFor(false, true, true).some((section) => section.key === "agent")).toBe(true);
    expect(sectionsFor(false, true, false).some((section) => section.key === "agent")).toBe(false);
    expect(sectionsFor(true, false, true).some((section) => section.key === "agent")).toBe(false);
  });
});
