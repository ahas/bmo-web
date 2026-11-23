import { describe, expect, test } from "bun:test";

import {
  ORGANIZATION_PATH,
  ORGANIZATION_TABS,
  administratorTreeUnits,
  branchesAbove,
  chosenOrganization,
  companyOfNode,
  memberOrganizations,
  memberTreeUnits,
  movePlan,
  organizationAddress,
  organizationMovedAway,
  organizationNodeAddress,
  organizationNodes,
  organizationRowTabs,
  organizationTabNamed,
  organizationTabOf,
  organizationTabsFor,
  unitBranches,
  unitPath
} from "../../../apps/web/app/domain/organization";

import type { OrganizationReader, UnitBranch, UnitPlace, UnitStanding } from "../../../apps/web/app/domain/organization";
import type { SideNode } from "bmo-ui/app/domain/side-parts";
import { ADMIN_PATH } from "../../../apps/web/app/domain/administration";
import { SETTINGS_SECTIONS, sectionsFor } from "../../../apps/web/app/domain/settings-dialog";
import { SCREENS, tabAddress } from "../../../apps/web/app/domain/screens";

// The settings dialog holds what a person sets for themselves alone, their secrets and the voice briefing among it, and the organisation
// settings screen what is set for the whole deployment or for other people, a tab to a section; the research
// supervisor stands on the research screen (docs/web.md, 「Settings」 and 「Organisation settings」).

describe("the settings dialog", () => {
  test("holds the personal sections alone, the voice briefing under its own name", () => {
    expect(SETTINGS_SECTIONS.map((section) => section.key)).toEqual(["account", "agent", "machine", "desktop", "secrets", "supply", "apps", "personal-apps", "theme", "palette", "notifications", "briefing"]);
    expect(SETTINGS_SECTIONS.find((section) => section.key === "briefing")?.label).toBe("settings.label.briefing");
  });

  test("shows a member their account, machine, secrets, theme and palette, and the administrator the notifications and the player too", () => {
    expect(sectionsFor(false, true).map((section) => section.key)).toEqual(["account", "machine", "secrets", "supply", "apps", "personal-apps", "theme", "palette"]);
    expect(sectionsFor(true, true).map((section) => section.key)).toEqual(["account", "machine", "secrets", "supply", "apps", "personal-apps", "theme", "palette", "notifications", "briefing"]);
  });

  test("shows the desktop app's section only in the app's window, to every reader", () => {
    for (const [administrator, user] of [[false, true], [true, true], [true, false]] as const) {
      expect(sectionsFor(administrator, user).map((section) => section.key)).not.toContain("desktop");
      expect(sectionsFor(administrator, user, false, true).map((section) => section.key)).toContain("desktop");
    }
    expect(sectionsFor(false, true, false, true).map((section) => section.key)).toEqual(["account", "machine", "desktop", "secrets", "supply", "apps", "personal-apps", "theme", "palette"]);
  });

  test("shows no secrets and no machine to a login with no user, which holds no space and no machine", () => {
    expect(sectionsFor(true, false).map((section) => section.key)).not.toContain("secrets");
    expect(sectionsFor(true, false).map((section) => section.key)).not.toContain("machine");
  });

  test("leads every key that moved to its tab of the organisation screen or the administrator's, and keeps its own keys", () => {
    for (const key of ["organization", "invites"]) {
      expect({ key, moved: organizationTabNamed(key)?.value ?? null }).toEqual({ key, moved: key });
    }

    expect(organizationMovedAway("providers")).toEqual({ path: ADMIN_PATH, query: {} });
    expect(organizationMovedAway("secret-kinds")).toEqual({ path: ADMIN_PATH, query: { tab: "secret-kinds" } });

    expect(organizationTabNamed("account")).toBeNull();
    expect(organizationTabNamed("research")).toBeNull();
    expect(organizationTabNamed("briefing")).toBeNull();
    expect(organizationTabNamed("secrets")).toBeNull();
    expect(organizationTabNamed("permissions")).toBeNull();
  });
});

const ADMINISTRATOR: OrganizationReader = { administrator: true, roster: true, supply: false, plans: false, memory: false, heads: false, known: true };
// A head manages the supply of the company they head, as the account service's read says (docs/web.md, the supply tab).
const COMPANY_HEAD: OrganizationReader = { administrator: false, roster: true, supply: true, plans: true, memory: true, heads: true, known: true };
// A subscription manager who heads nothing holds the company's plan alone.
const PLAN_KEEPER: OrganizationReader = { administrator: false, roster: false, supply: false, plans: true, memory: false, heads: false, known: true };
// A member granted a unit's org memory write without heading one (docs/web.md, 「Organisation」, the org memory tab).
const MEMORY_WRITER: OrganizationReader = { administrator: false, roster: false, supply: false, plans: false, memory: true, heads: false, known: true };
// A member who heads a unit below the company, so writes its memory and sets its agents.
const UNIT_HEAD: OrganizationReader = { administrator: false, roster: false, supply: false, plans: false, memory: true, heads: true, known: true };
const MEMBER: OrganizationReader = { administrator: false, roster: false, supply: false, plans: false, memory: false, heads: false, known: true };
// A member before the people roster has answered, as the server and the browser's first frame see them.
const UNKNOWN_MEMBER: OrganizationReader = { administrator: false, roster: false, supply: false, plans: false, memory: false, heads: false, known: false };

describe("the organisation screen", () => {
  test("stands its tabs in order, the units first", () => {
    expect(ORGANIZATION_TABS.map((tab) => tab.value)).toEqual(["organization", "people", "catalogue", "invites", "agent", "agents", "apps", "storage", "memory", "supply", "plans"]);
  });

  test("leads the keys of the sections that moved away to where they stand now, and no other key", () => {
    expect(organizationMovedAway("research")).toEqual({ path: "/research", query: { tab: "settings" } });
    expect(organizationMovedAway("briefing")).toEqual({ path: ORGANIZATION_PATH, query: { settings: "briefing" } });
    expect(organizationMovedAway("secrets")).toEqual({ path: ORGANIZATION_PATH, query: { settings: "secrets" } });
    expect(organizationMovedAway("secrets", { user: "7" })).toEqual({ path: ORGANIZATION_PATH, query: { settings: "secrets" } });

    for (const key of [...ORGANIZATION_TABS.map((tab) => tab.value), "account", "toString", undefined, ["research"]]) {
      expect({ key, moved: organizationMovedAway(key) }).toEqual({ key, moved: null });
    }
  });

  test("leads the permissions key to the person it named on the people tab, at their permissions tab", () => {
    expect(organizationMovedAway("permissions", { tab: "permissions", user: "7", q: "a" })).toEqual({ path: ORGANIZATION_PATH, query: { tab: "people", user: "7", pane: "permissions" } });
    expect(organizationMovedAway("permissions", { tab: "permissions", company: "3", user: "7" })).toEqual({ path: ORGANIZATION_PATH, query: { tab: "people", company: "3", user: "7", pane: "permissions" } });
    expect(organizationMovedAway("permissions")).toEqual({ path: ORGANIZATION_PATH, query: { tab: "people", pane: "permissions" } });
  });

  test("opens every tab to the administrator, the people and the roles and kinds tabs to a member who heads a company, the agents tab to a member who heads a unit, and the invitations and BMO tabs to every member", () => {
    expect(organizationTabsFor(ADMINISTRATOR)).toHaveLength(ORGANIZATION_TABS.length);
    expect(organizationTabsFor(COMPANY_HEAD).map((tab) => tab.value)).toEqual(["people", "catalogue", "invites", "agent", "agents", "apps", "storage", "memory", "supply", "plans"]);
    expect(organizationTabsFor(UNIT_HEAD).map((tab) => tab.value)).toEqual(["invites", "agent", "agents", "apps", "storage", "memory"]);
    expect(organizationTabsFor(MEMORY_WRITER).map((tab) => tab.value)).toEqual(["invites", "agent", "apps", "memory"]);
    expect(organizationTabsFor(MEMBER).map((tab) => tab.value)).toEqual(["invites", "agent", "apps"]);
  });

  test("opens the plans tab and not the supply tab to a reader who holds the company's plan alone", () => {
    expect(organizationTabsFor(PLAN_KEEPER).map((tab) => tab.value)).toEqual(["invites", "agent", "apps", "plans"]);
  });

  test("opens the first tab a reader may for a key naming none of theirs", () => {
    expect(organizationTabOf("people", ADMINISTRATOR)?.value).toBe("people");
    expect(organizationTabOf("people", MEMBER)?.value).toBe("invites");
    expect(organizationTabOf(undefined, ADMINISTRATOR)?.value).toBe("organization");
    expect(organizationTabOf(undefined, COMPANY_HEAD)?.value).toBe("people");
  });

  test("draws no tab a member is not yet known to open, and the one they are, before the roster answers", () => {
    expect(organizationTabOf("catalogue", UNKNOWN_MEMBER)).toBeNull();
    expect(organizationTabOf(undefined, UNKNOWN_MEMBER)).toBeNull();
    expect(organizationTabOf("invites", UNKNOWN_MEMBER)?.value).toBe("invites");
  });

  test("holds the tab the address names in the row while who reads is read, and only the reader's once known", () => {
    expect(organizationRowTabs(UNKNOWN_MEMBER, "catalogue").map((tab) => tab.value)).toEqual(["catalogue", "invites", "agent", "apps"]);
    expect(organizationRowTabs(UNKNOWN_MEMBER, undefined).map((tab) => tab.value)).toEqual(["invites", "agent", "apps"]);
    expect(organizationRowTabs(MEMBER, "catalogue").map((tab) => tab.value)).toEqual(["invites", "agent", "apps"]);
  });

  test("keeps a tab in the address, the first being the organisation's own, and lets the keys of the tab left go with it while the node chosen stays", () => {
    expect(organizationAddress("organization", { unit: "3", kind: "1:team" })).toEqual({ path: ORGANIZATION_PATH, query: { unit: "3" } });
    expect(organizationAddress("catalogue", { unit: "3", tab: "invites", company: "4" })).toEqual({ path: ORGANIZATION_PATH, query: { tab: "catalogue", company: "4", unit: "3" } });
    expect(organizationAddress("invites", { tab: "people", q: "a", company: "1", unit: "2", role: "head", state: "left", user: "7", pane: "bmo", settings: "theme" })).toEqual({
      path: ORGANIZATION_PATH,
      query: { tab: "invites", company: "1", unit: "2", settings: "theme" }
    });
    expect(organizationAddress("organization", { tab: "plans", company: "1" })).toEqual({ path: ORGANIZATION_PATH, query: { company: "1" } });
  });

  test("chooses a node of another company as a step that keeps the tab open and lets what that tab held of the one before go", () => {
    expect(organizationNodeAddress(5, null, { tab: "people", company: "1", q: "a", unit: "2", user: "7", settings: "theme" })).toEqual({ path: ORGANIZATION_PATH, query: { tab: "people", company: "5", settings: "theme" } });
    expect(organizationNodeAddress(5, 8, { tab: "people", company: "1", q: "a" })).toEqual({ path: ORGANIZATION_PATH, query: { tab: "people", company: "5", unit: "8" } });
    // The person's tab stays for the person opened next.
    expect(organizationNodeAddress(5, null, { tab: "people", user: "7", pane: "permissions" })).toEqual({ path: ORGANIZATION_PATH, query: { tab: "people", company: "5", pane: "permissions" } });
    expect(organizationNodeAddress(5, null, {})).toEqual({ path: ORGANIZATION_PATH, query: { company: "5" } });
  });

  test("chooses a node of the same company keeping all the tab held, the unit beside the company or gone for the company itself", () => {
    expect(organizationNodeAddress(1, 3, { tab: "people", company: "1", q: "a", unit: "2", role: "head" })).toEqual({ path: ORGANIZATION_PATH, query: { tab: "people", company: "1", q: "a", role: "head", unit: "3" } });
    expect(organizationNodeAddress(1, null, { tab: "people", company: "1", q: "a", unit: "2" })).toEqual({ path: ORGANIZATION_PATH, query: { tab: "people", company: "1", q: "a" } });
  });

  test("carries the keys a deliberate open hands the tab entered", () => {
    expect(organizationAddress("agent", { tab: "people", user: "7" }, { company: "1", unit: "2" })).toEqual({ path: ORGANIZATION_PATH, query: { tab: "agent", company: "1", unit: "2" } });
  });

  test("stands in the sidebar's organisation section as one entry and in the search with its tabs, the administrator's under the administrator services", () => {
    const screen = SCREENS.find((one) => one.to === ORGANIZATION_PATH)!;
    const admin = SCREENS.find((one) => one.to === ADMIN_PATH)!;

    expect(screen.to).toBe(ORGANIZATION_PATH);
    expect(screen.unitKeepers).toBe(true);
    expect(screen.tabs?.map((tab) => tabAddress(screen, tab))).toEqual(["/organization", "/organization?tab=people", "/organization?tab=catalogue", "/organization?tab=invites", "/organization?tab=agent", "/organization?tab=agents", "/organization?tab=apps", "/organization?tab=storage", "/organization?tab=memory", "/organization?tab=supply", "/organization?tab=plans"]);
    expect(admin.to).toBe(ADMIN_PATH);
    expect(admin.administrator).toBe(true);
    expect(admin.tabs?.map((tab) => tabAddress(admin, tab))).toEqual(["/admin", "/admin?tab=secret-kinds", "/admin?tab=plans", "/admin?tab=credits", "/admin?tab=apps"]);
    expect([screen.section, admin.section]).toEqual(["organization", "administration"]);
  });
});

describe("the organisation list", () => {
  const LIST = [
    { id: 1, name: "North Works" },
    { id: 4, name: "South Works" },
    { id: 9, name: "Harbour" }
  ];
  // The units of the list's companies, each by the company it stands in, as a link made before names them.
  const COMPANY_OF: Record<number, number> = { 2: 1, 3: 1, 5: 4 };
  const companyOf = (unit: number): number | null => COMPANY_OF[unit] ?? null;

  test("chooses the organisation the address names, else the first, and none where the reader may set none", () => {
    expect(chosenOrganization({ company: "4" }, LIST)?.id).toBe(4);
    expect(chosenOrganization({}, LIST)?.id).toBe(1);
    expect(chosenOrganization({ company: "7" }, LIST)?.id).toBe(1);
    expect(chosenOrganization({ company: "four" }, LIST)?.id).toBe(1);
    expect(chosenOrganization({ company: ["9", "4"] }, LIST)?.id).toBe(9);
    expect(chosenOrganization({}, [])).toBeNull();
  });

  test("lands a link made before the organisation came first in the organisation its unit stands in", () => {
    // The supply tab's old `?unit=` named a company; the chart's and the BMO tab's a unit of one.
    expect(chosenOrganization({ tab: "supply", unit: "4" }, LIST, companyOf)?.id).toBe(4);
    expect(chosenOrganization({ unit: "5" }, LIST, companyOf)?.id).toBe(4);
    expect(chosenOrganization({ unit: "8" }, LIST, companyOf)?.id).toBe(1);
    // The organisation the address names stands before its unit's.
    expect(chosenOrganization({ company: "9", unit: "5" }, LIST, companyOf)?.id).toBe(9);
  });

  test("holds for a member each company they head a unit of, manage the supply of or head, once, in the tree's order whichever read named it", () => {
    const units = [
      { id: 3, name: "team", parent: 2, company: { id: 1, name: "North Works" } },
      { id: 2, name: "centre", parent: 1, company: { id: 1, name: "North Works" } }
    ];

    expect(memberOrganizations(units, [{ id: 9, name: "Harbour" }], [{ id: 1, name: "North Works" }, { id: 4, name: "South Works" }])).toEqual([
      { id: 1, name: "North Works" },
      { id: 4, name: "South Works" },
      { id: 9, name: "Harbour" }
    ]);
    expect(memberOrganizations([], [], [])).toEqual([]);
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

  test("opens every branch down to a unit", () => {
    expect(branchesAbove(UNITS, 4)).toEqual([2, 3]);
    expect(branchesAbove(UNITS, 2)).toEqual([]);
  });
});

// The organisation tree the screen chooses its node from: the companies the reader may set, and the units under them.
const COMPANIES = [
  { id: 2, name: "company-a" },
  { id: 6, name: "company-b" }
];

// A tree of nodes as nested labels, a node's badge after its label, a node's children in brackets after it.
function outline(nodes: readonly SideNode[]): unknown[] {
  return nodes.map((node) => {
    const label = node.badge === undefined ? node.label : `${node.label} (${node.badge})`;

    return node.children === undefined ? label : [label, outline(node.children)];
  });
}

describe("the organisation tree", () => {
  test("stands each company at its top in its order and its units under it, each under its parent, wearing its kind", () => {
    const rows: Parameters<typeof administratorTreeUnits>[0] = [
      { id: 2, name: "company-a" },
      { id: 3, name: "team-a", parent: 2, kind: { name: "Team" } },
      { id: 4, name: "part-a", parent: 3 },
      { id: 6, name: "company-b" }
    ];
    const units = administratorTreeUnits(rows);
    const nodes = organizationNodes(COMPANIES, units);

    expect(outline(nodes)).toEqual([["company-a", [["team-a (Team)", ["part-a"]]]], "company-b"]);
    expect(nodes.map((node) => [node.key, node.icon])).toEqual([
      [2, "i-material-symbols-domain"],
      [6, "i-material-symbols-domain"]
    ]);
    expect(nodes[0]!.children![0]!.icon).toBe("i-material-symbols-groups-outline");
    expect(units.map((unit) => unit.company)).toEqual([2, 2, 2, 6]);
  });

  test("stands a member's units under their parent where it holds it and under the company otherwise, each once", () => {
    const company = { id: 2, name: "company-a" };
    const invite = [
      { id: 2, name: "company-a", company },
      { id: 4, name: "part-a", parent: 3, company },
      { id: 7, name: "part-b", parent: 4, company }
    ];
    const memory = [
      { id: 4, name: "part-a", parent: 3, company, head: true },
      { id: 5, name: "team-b", parent: 2, company, head: false }
    ];

    expect(outline(organizationNodes(COMPANIES, memberTreeUnits(invite, memory)))).toEqual([["company-a", [["part-a", ["part-b"]], "team-b"]], "company-b"]);
  });

  test("names the company a node stands in, itself for a company, and none for a node it does not hold", () => {
    const units = memberTreeUnits([], [{ id: 5, name: "team-b", parent: 2, company: { id: 2, name: "company-a" }, head: false }]);

    expect(companyOfNode(COMPANIES, units, 6)).toBe(6);
    expect(companyOfNode(COMPANIES, units, 5)).toBe(2);
    expect(companyOfNode(COMPANIES, units, 9)).toBeNull();
  });
});

// A move of several people shows who goes where before anything is written (docs/web.md, 「Organisation settings」,
// its chart): each person from the unit they stand in, their role before and after, the head grant the move takes and
// the post it ends where a person moves into the unit they hold one in.
describe("a move of several people", () => {
  const units: UnitStanding[] = [
    { id: 1, name: "company-a", parent: null, heads: [], members: [] },
    { id: 2, name: "team-a", parent: 1, heads: ["10"], members: ["10", "11"] },
    { id: 3, name: "team-b", parent: 1, heads: ["12"], members: ["12"], concurrent: ["11"] }
  ];

  test("moves each person from the unit they stand in, and takes away the head grant of the unit a head leaves", () => {
    expect(movePlan(units, [{ user: "10", head: false }, { user: "11", head: true }], 3)).toEqual([
      { user: "10", from: 2, to: 3, wasHead: true, head: false, headDropped: true, postDropped: false, unchanged: false },
      { user: "11", from: 2, to: 3, wasHead: false, head: true, headDropped: false, postDropped: true, unchanged: false }
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
