import { describe, expect, test } from "bun:test";

import {
  ORGANIZATION_GROUPS,
  ORGANIZATION_PATH,
  ORGANIZATION_TABS,
  PERSON_NODE,
  PLATFORM_NODE,
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
  linkChosen,
  linkNode,
  linkNodesFor,
  organizationLinkAddress,
  organizationRowTabs,
  organizationTabNamed,
  adminLanding,
  agentsLanding,
  platformOnlyTab,
  organizationTabOf,
  organizationTabsFor,
  unitBranches,
  unitPath
} from "../../../apps/web/app/domain/organization";

import { AGENT_SECTIONS } from "../../../apps/web/shared/sections";

import type { OrganizationReader, UnitBranch, UnitPlace, UnitStanding } from "../../../apps/web/app/domain/organization";
import type { SideNode } from "bmo-ui/app/domain/side-parts";
import { SETTINGS_SECTIONS, sectionsFor } from "../../../apps/web/app/domain/settings-dialog";
import { SCREENS, tabAddress } from "../../../apps/web/app/domain/screens";

// The settings dialog holds what a person sets for themselves alone, their own apps and skills and the voice briefing
// among it, and the organisation screen what is set for other people and for the reader's own link of the delegation
// chain, a tab to a section; the research supervisor stands on the research screen (docs/web.md, 「Settings」 and
// 「System and organisation」).

describe("the settings dialog", () => {
  test("holds the reader's own sections alone, the voice briefing under its own name", () => {
    expect(SETTINGS_SECTIONS.map((section) => section.key)).toEqual(["account", "machine", "desktop", "personal-apps", "skills", "theme", "palette", "notifications", "briefing"]);
    expect(SETTINGS_SECTIONS.find((section) => section.key === "briefing")?.label).toBe("settings.label.briefing");
  });

  test("holds no section that only led to the organisation screen", () => {
    const keys = SETTINGS_SECTIONS.map((section) => section.key);

    expect(keys).not.toContain("own-agents");
    expect(keys).not.toContain("secrets");
    expect(keys).not.toContain("supply");
    expect(keys).not.toContain("apps");
  });

  test("shows a member their account, machine, own apps, skills, theme and palette, and the administrator the notifications and the player too", () => {
    expect(sectionsFor(false, true).map((section) => section.key)).toEqual(["account", "machine", "personal-apps", "skills", "theme", "palette"]);
    expect(sectionsFor(true, true).map((section) => section.key)).toEqual(["account", "machine", "personal-apps", "skills", "theme", "palette", "notifications", "briefing"]);
  });

  test("shows the desktop app's section only in the app's window, to every reader", () => {
    for (const [administrator, user] of [[false, true], [true, true], [true, false]] as const) {
      expect(sectionsFor(administrator, user).map((section) => section.key)).not.toContain("desktop");
      expect(sectionsFor(administrator, user, true).map((section) => section.key)).toContain("desktop");
    }
    expect(sectionsFor(false, true, true).map((section) => section.key)).toEqual(["account", "machine", "desktop", "personal-apps", "skills", "theme", "palette"]);
  });

  test("shows no machine and no own apps to a login with no user, which holds no machine and made nothing", () => {
    const keys = sectionsFor(true, false).map((section) => section.key);

    expect(keys).not.toContain("machine");
    expect(keys).not.toContain("personal-apps");
    expect(keys).not.toContain("skills");
  });

  test("leads every key that moved to its tab of the merged screen, and keeps its own keys", () => {
    for (const key of ["organization", "invites", "providers", "secret-kinds", "mail"]) {
      expect({ key, moved: organizationTabNamed(key)?.value ?? null }).toEqual({ key, moved: key });
    }

    expect(organizationTabNamed("account")).toBeNull();
    expect(organizationTabNamed("research")).toBeNull();
    expect(organizationTabNamed("briefing")).toBeNull();
    expect(organizationTabNamed("secrets")?.value).toBe("secrets");
    expect(organizationTabNamed("permissions")?.value).toBe("permissions");
  });
});

const ADMINISTRATOR: OrganizationReader = { administrator: true, roster: true, supply: false, plans: false, memory: false, heads: false, agents: AGENT_SECTIONS, known: true };
// A head manages the supply of the company they head, as the account service's read says (docs/web.md, the supply tab).
const COMPANY_HEAD: OrganizationReader = { administrator: false, roster: true, supply: true, plans: true, memory: true, heads: true, known: true , agents: [] };
// The same head with the agent sections granted, which is what stands the agency tabs at their nodes.
const COMPANY_SECTIONS: OrganizationReader = { ...COMPANY_HEAD, agents: AGENT_SECTIONS };
// A subscription manager who heads nothing holds the company's plan alone.
const PLAN_KEEPER: OrganizationReader = { administrator: false, roster: false, supply: false, plans: true, memory: false, heads: false, known: true , agents: [] };
// A member granted a unit's org memory write without heading one (docs/web.md, 「System and organisation」, the org memory tab).
const MEMORY_WRITER: OrganizationReader = { administrator: false, roster: false, supply: false, plans: false, memory: true, heads: false, known: true , agents: [] };
// A member who heads a unit below the company, so writes its memory and sets its agents.
const UNIT_HEAD: OrganizationReader = { administrator: false, roster: false, supply: false, plans: false, memory: true, heads: true, known: true , agents: [] };
const UNIT_SECTIONS: OrganizationReader = { ...UNIT_HEAD, agents: ["supervisors"] };
const MEMBER: OrganizationReader = { administrator: false, roster: false, supply: false, plans: false, memory: false, heads: false, known: true , agents: [] };
// A plain member granted one agent section: their own link holds their rows, whatever they head nowhere.
const SECTION_MEMBER: OrganizationReader = { ...MEMBER, agents: ["repositories"] };
// A member before the people roster has answered, as the server and the browser's first frame see them.
const UNKNOWN_MEMBER: OrganizationReader = { administrator: false, roster: false, supply: false, plans: false, memory: false, heads: false, known: false , agents: [] };

describe("the organisation screen", () => {
  test("stands its tabs in order, the units first, the platform's three beside their kin", () => {
    expect(ORGANIZATION_TABS.map((tab) => tab.value)).toEqual(["organization", "people", "catalogue", "invites", "agents", "supervisors", "roles", "repositories", "models", "model-files", "apps", "storage", "mail-servers", "mail", "secrets", "secret-kinds", "memory", "permissions", "supply", "providers", "security"]);
  });

  test("stands the platform's three tabs at the platform link node alone, and knows them by their keys", () => {
    for (const key of ["providers", "secret-kinds", "mail"]) {
      expect(platformOnlyTab(key)?.value).toBe(key);
    }

    for (const key of ["organization", "apps", "secrets", "supply", "security", "memory", "people", "stray", undefined]) {
      expect(platformOnlyTab(key)).toBeNull();
    }
  });

  test("leads the keys of the sections that moved away to where they stand now, and no other key", () => {
    expect(organizationMovedAway("research")).toEqual({ path: "/research", query: { tab: "settings" } });
    expect(organizationMovedAway("briefing")).toEqual({ path: ORGANIZATION_PATH, query: { settings: "briefing" } });

    for (const key of [...ORGANIZATION_TABS.map((tab) => tab.value), "account", "toString", undefined, ["research"]]) {
      expect({ key, moved: organizationMovedAway(key) }).toEqual({ key, moved: null });
    }
  });

  test("leads the BMO, own-agents and plans keys to the tabs they stand on now, keeping the node", () => {
    expect(organizationMovedAway("agent", { company: "3", unit: "5", tab: "agent" })).toEqual({ path: ORGANIZATION_PATH, query: { company: "3", unit: "5", tab: "agents" } });
    expect(organizationMovedAway("own-agents", { company: "me" })).toEqual({ path: ORGANIZATION_PATH, query: { company: "me", tab: "agents" } });
    expect(organizationMovedAway("plans", { company: "3" })).toEqual({ path: ORGANIZATION_PATH, query: { company: "3", tab: "supply" } });
  });

  test("leads a person's permissions pane on the people tab to the permissions tab with that person open", () => {
    expect(organizationMovedAway("people", { tab: "people", pane: "permissions", user: "7", q: "a" })).toEqual({ path: ORGANIZATION_PATH, query: { tab: "permissions", user: "7" } });
    expect(organizationMovedAway("people", { tab: "people", pane: "permissions", company: "3", user: "7" })).toEqual({ path: ORGANIZATION_PATH, query: { tab: "permissions", company: "3", user: "7" } });
    expect(organizationMovedAway("people", { tab: "people", pane: "bmo", user: "7" })).toBeNull();
  });

  test("opens every tab but the platform's five to the administrator at a company, the agent tabs only to a head whose section was granted, and the invitations tab to every member", () => {
    expect(organizationTabsFor(ADMINISTRATOR)).toHaveLength(ORGANIZATION_TABS.length - 5);
    expect(organizationTabsFor(ADMINISTRATOR).map((tab) => tab.value)).not.toContain("providers");
    expect(organizationTabsFor(ADMINISTRATOR, PLATFORM_NODE)).toHaveLength(ORGANIZATION_TABS.length - 6);
    expect(organizationTabsFor(COMPANY_HEAD).map((tab) => tab.value)).toEqual(["people", "catalogue", "invites", "agents", "apps", "storage", "mail-servers", "secrets", "memory", "permissions", "supply", "security"]);
    // Heading and section together stand the three row tabs at the node; the roles and the model files do not open there at all.
    expect(organizationTabsFor(COMPANY_SECTIONS).map((tab) => tab.value)).toEqual(["people", "catalogue", "invites", "agents", "supervisors", "repositories", "models", "apps", "storage", "mail-servers", "secrets", "memory", "permissions", "supply", "security"]);
    expect(organizationTabsFor(UNIT_SECTIONS).map((tab) => tab.value)).toEqual(["invites", "agents", "supervisors", "apps", "storage", "mail-servers", "secrets", "memory", "permissions", "security"]);
    expect(organizationTabsFor(UNIT_HEAD).map((tab) => tab.value)).toEqual(["invites", "agents", "apps", "storage", "mail-servers", "secrets", "memory", "permissions", "security"]);
    expect(organizationTabsFor(MEMORY_WRITER).map((tab) => tab.value)).toEqual(["invites", "apps", "memory"]);
    expect(organizationTabsFor(MEMBER).map((tab) => tab.value)).toEqual(["invites", "apps"]);
  });

  test("opens the supply tab to a reader who holds the company's plan alone", () => {
    expect(organizationTabsFor(PLAN_KEEPER).map((tab) => tab.value)).toEqual(["invites", "apps", "supply"]);
  });

  test("stands at a link node every tab declaring a view of it, and the same row whatever the reader rights are", () => {
    // The node's views are the whole of its row, save the agent tabs, whose view of one's own link stands or falls
    // by the section alone, and the platform's link, which only the administrator's tree holds.
    expect(organizationTabsFor(MEMBER, PERSON_NODE).map((tab) => tab.value)).toEqual(["agents", "apps", "secrets", "supply"]);
    expect(organizationTabsFor(SECTION_MEMBER, PERSON_NODE).map((tab) => tab.value)).toEqual(["agents", "repositories", "apps", "secrets", "supply"]);
    expect(organizationTabsFor(UNIT_HEAD, PERSON_NODE).map((tab) => tab.value)).toEqual(["agents", "apps", "secrets", "supply"]);
    expect(organizationTabsFor(ADMINISTRATOR, PERSON_NODE).map((tab) => tab.value)).toEqual(["agents", "supervisors", "repositories", "models", "apps", "secrets", "supply"]);
    expect(organizationTabsFor(ADMINISTRATOR, PLATFORM_NODE).map((tab) => tab.value)).toEqual(["agents", "supervisors", "roles", "repositories", "models", "model-files", "apps", "mail-servers", "mail", "secrets", "secret-kinds", "memory", "supply", "providers", "security"]);
    expect(organizationTabsFor(MEMBER, null).map((tab) => tab.value)).toEqual(["invites", "apps"]);
  });

  test("leaves no link node with a tab that holds nothing to set there", () => {
    for (const link of [PERSON_NODE, PLATFORM_NODE] as const) {
      for (const reader of [MEMBER, UNIT_HEAD, COMPANY_HEAD, ADMINISTRATOR]) {
        const row = organizationTabsFor(reader, link);

        expect(row.every((tab) => tab.links?.[link] !== undefined)).toBe(true);
        expect(ORGANIZATION_TABS.filter((tab) => tab.links?.[link] === undefined).every((tab) => !row.includes(tab))).toBe(true);
      }
    }

    // A tab with no view of a link stands nowhere there, however the reader rights reach it at an organisation.
    expect(organizationTabsFor(UNIT_HEAD, PERSON_NODE).map((tab) => tab.value)).not.toContain("storage");
    expect(organizationTabsFor(UNIT_HEAD, PERSON_NODE).map((tab) => tab.value)).not.toContain("permissions");
    expect(organizationTabsFor(ADMINISTRATOR, PLATFORM_NODE).map((tab) => tab.value)).not.toContain("organization");
    expect(organizationTabsFor(ADMINISTRATOR, PLATFORM_NODE).map((tab) => tab.value)).not.toContain("people");
  });

  test("stands the invitations tab at a company or a unit alone, where its links and machine-share asks are set", () => {
    expect(organizationTabsFor(MEMBER, null).map((tab) => tab.value)).toContain("invites");
    expect(organizationTabsFor(COMPANY_HEAD, null).map((tab) => tab.value)).toContain("invites");
    expect(organizationTabsFor(ADMINISTRATOR, null).map((tab) => tab.value)).toContain("invites");
    expect(organizationTabsFor(MEMBER, PERSON_NODE).map((tab) => tab.value)).not.toContain("invites");
    expect(organizationTabsFor(UNIT_HEAD, PERSON_NODE).map((tab) => tab.value)).not.toContain("invites");
    expect(organizationTabsFor(ADMINISTRATOR, PLATFORM_NODE).map((tab) => tab.value)).not.toContain("invites");
  });

  test("opens the first tab a reader may for a key naming none of theirs", () => {
    expect(organizationTabOf("people", ADMINISTRATOR)?.value).toBe("people");
    expect(organizationTabOf("people", MEMBER)?.value).toBe("invites");
    expect(organizationTabOf(undefined, ADMINISTRATOR)?.value).toBe("organization");
    expect(organizationTabOf(undefined, COMPANY_HEAD)?.value).toBe("people");
    // A link node arrives on the first tab holding a view of it, never on a tab that could only say it has nothing.
    expect(organizationTabOf(undefined, MEMBER, PERSON_NODE)?.value).toBe("agents");
    expect(organizationTabOf("invites", MEMBER, PERSON_NODE)?.value).toBe("agents");
    expect(organizationTabOf(undefined, ADMINISTRATOR, PLATFORM_NODE)?.value).toBe("agents");
    expect(organizationTabOf("organization", ADMINISTRATOR, PLATFORM_NODE)?.value).toBe("agents");
    expect(organizationTabOf("catalogue", ADMINISTRATOR, PLATFORM_NODE)?.value).toBe("agents");
  });

  test("draws no tab a member is not yet known to open, and the one they are, before the roster answers", () => {
    expect(organizationTabOf("catalogue", UNKNOWN_MEMBER)).toBeNull();
    expect(organizationTabOf(undefined, UNKNOWN_MEMBER)).toBeNull();
    expect(organizationTabOf("invites", UNKNOWN_MEMBER)?.value).toBe("invites");
  });

  test("holds the tab the address names in the row while who reads is read, and only the reader's once known", () => {
    expect(organizationRowTabs(UNKNOWN_MEMBER, "catalogue").map((tab) => tab.value)).toEqual(["catalogue", "invites", "apps"]);
    expect(organizationRowTabs(UNKNOWN_MEMBER, undefined).map((tab) => tab.value)).toEqual(["invites", "apps"]);
    expect(organizationRowTabs(MEMBER, "catalogue").map((tab) => tab.value)).toEqual(["invites", "apps"]);
  });

  test("widens no link node's row for a tab the address names, and answers such an address on the spot", () => {
    // The row of a link is its declared views before the reads answer as after them, and an address naming a tab the
    // node does not hold is drawn on the node's arrival tab rather than left waiting over nothing.
    expect(organizationRowTabs(UNKNOWN_MEMBER, "invites", PERSON_NODE).map((tab) => tab.value)).toEqual(["agents", "apps", "secrets", "supply"]);
    expect(organizationRowTabs(UNKNOWN_MEMBER, "storage", PLATFORM_NODE).map((tab) => tab.value)).toEqual(["agents", "roles", "model-files", "apps", "mail-servers", "mail", "secrets", "secret-kinds", "memory", "supply", "providers", "security"]);
    expect(organizationTabOf("invites", UNKNOWN_MEMBER, PERSON_NODE)?.value).toBe("agents");
    expect(organizationTabOf("storage", UNKNOWN_MEMBER, PLATFORM_NODE)?.value).toBe("agents");
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
    expect(organizationAddress("agents", { tab: "people", user: "7" }, { company: "1", unit: "2" })).toEqual({ path: ORGANIZATION_PATH, query: { tab: "agents", company: "1", unit: "2" } });
  });

  test("stands among the administrator services as the screen's one entry and in the search with its tabs, the platform's three among them", () => {
    const screen = SCREENS.find((one) => one.to === ORGANIZATION_PATH)!;

    expect(screen.to).toBe(ORGANIZATION_PATH);
    expect(screen.everyone).toBe(true);
    expect(screen.administratorKeeps).toBe(true);
    expect(screen.feature).toBe("organizations");
    expect(screen.tabs?.map((tab) => tabAddress(screen, tab))).toEqual(["/organization", "/organization?tab=people", "/organization?tab=catalogue", "/organization?tab=invites", "/organization?tab=agents", "/organization?tab=supervisors", "/organization?tab=roles", "/organization?tab=repositories", "/organization?tab=models", "/organization?tab=model-files", "/organization?tab=apps", "/organization?tab=storage", "/organization?tab=mail-servers", "/organization?tab=mail", "/organization?tab=secrets", "/organization?tab=secret-kinds", "/organization?tab=memory", "/organization?tab=permissions", "/organization?tab=supply", "/organization?tab=providers", "/organization?tab=security"]);
    expect(screen.section).toBe("administration");
    expect(SCREENS.some((entry) => entry.to === "/admin")).toBe(false);
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
    // A unit under a company carries no mark of its own.
    expect(nodes[0]!.children![0]!.icon).toBeUndefined();
    expect(nodes[0]!.children![0]!.children![0]!.icon).toBeUndefined();
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

// The link nodes of the tree (docs/web.md, 「System and organisation」): the reader's own for every reader with a user and the
// platform for the administrator, above every company, chosen by `?company=me` and `?company=platform`, every tab
// standing for them and saying for itself what it shows there.
describe("the link nodes", () => {
  const ADMIN = { administrator: true, user: true };
  const PERSON = { administrator: false, user: true };
  const LOGIN = { administrator: true, user: false };

  test("stand in the tree by the reader's reach, their own first", () => {
    expect(linkNodesFor(ADMIN)).toEqual([PERSON_NODE, PLATFORM_NODE]);
    expect(linkNodesFor(PERSON)).toEqual([PERSON_NODE]);
    expect(linkNodesFor(LOGIN)).toEqual([PLATFORM_NODE]);
    expect(linkNodesFor({ administrator: false, user: false })).toEqual([]);
  });

  test("are chosen by the address where the reader's tree holds them", () => {
    expect(linkChosen({ company: PLATFORM_NODE }, ADMIN)).toBe(PLATFORM_NODE);
    expect(linkChosen({ company: PLATFORM_NODE }, PERSON)).toBeNull();
    expect(linkChosen({ company: PERSON_NODE }, PERSON)).toBe(PERSON_NODE);
    expect(linkChosen({ company: PERSON_NODE }, LOGIN)).toBeNull();
    expect(linkChosen({ company: "1" }, ADMIN)).toBeNull();
  });

  test("are drawn with their own mark and words", () => {
    expect(linkNode(PLATFORM_NODE, (key) => key)).toEqual({ key: PLATFORM_NODE, label: "organization.label.platform", icon: "i-material-symbols-public" });
    expect(linkNode(PERSON_NODE, (key) => key)).toEqual({ key: PERSON_NODE, label: "organization.label.person", icon: "i-material-symbols-person-outline" });
  });

  test("keep the tab open as they are chosen, and drop the unit and what the tab held of the company", () => {
    expect(organizationLinkAddress(PLATFORM_NODE, { company: "1", unit: "4", tab: "apps" })).toEqual({ path: ORGANIZATION_PATH, query: { company: PLATFORM_NODE, tab: "apps" } });
    expect(organizationLinkAddress(PERSON_NODE, { company: "1", tab: "people", q: "kim", user: "7" })).toEqual({ path: ORGANIZATION_PATH, query: { company: PERSON_NODE, tab: "people" } });
    expect(organizationLinkAddress(PLATFORM_NODE, { company: "1" })).toEqual({ path: ORGANIZATION_PATH, query: { company: PLATFORM_NODE } });
    expect(organizationLinkAddress(PERSON_NODE, { company: "1", tab: "people" }, "apps")).toEqual({ path: ORGANIZATION_PATH, query: { company: PERSON_NODE, tab: "apps" } });
  });

  test("are shown by the tabs that declare a view of them, the agents, apps, secrets and supply tabs declaring both, the mail servers, org memory, security tabs and the platform's own three the platform", () => {
    expect(ORGANIZATION_TABS.filter((tab) => tab.links !== undefined).map((tab) => [tab.value, Object.keys(tab.links!).toSorted()])).toEqual([
      ["agents", ["me", "platform"]],
      ["supervisors", ["me", "platform"]],
      ["roles", ["platform"]],
      ["repositories", ["me", "platform"]],
      ["models", ["me", "platform"]],
      ["model-files", ["platform"]],
      ["apps", ["me", "platform"]],
      ["mail-servers", ["platform"]],
      ["mail", ["platform"]],
      ["secrets", ["me", "platform"]],
      ["secret-kinds", ["platform"]],
      ["memory", ["platform"]],
      ["supply", ["me", "platform"]],
      ["providers", ["platform"]],
      ["security", ["platform"]]
    ]);
    // The roles and the model files declare no company view at all: the platform's own tabs stand nowhere else.
    expect(organizationTabsFor(ADMINISTRATOR)).toHaveLength(ORGANIZATION_TABS.length - 5);
  });

  test("hold where the old administrator screen's addresses lead, each naming the platform node", () => {
    expect(adminLanding({})).toEqual({ path: ORGANIZATION_PATH, query: { company: PLATFORM_NODE, tab: "providers" } });
    expect(adminLanding({ tab: "providers" })).toEqual({ path: ORGANIZATION_PATH, query: { company: PLATFORM_NODE, tab: "providers" } });
    expect(adminLanding({ tab: "secret-kinds" })).toEqual({ path: ORGANIZATION_PATH, query: { company: PLATFORM_NODE, tab: "secret-kinds" } });
    // The old agent screen lands on the tab it stood, at the platform node; an unknown or absent tab lands on the first.
    expect(agentsLanding({})).toEqual({ path: ORGANIZATION_PATH, query: { company: PLATFORM_NODE } });
    expect(agentsLanding({ tab: "repositories" })).toEqual({ path: ORGANIZATION_PATH, query: { company: PLATFORM_NODE, tab: "repositories" } });
    expect(agentsLanding({ tab: "no-section" })).toEqual({ path: ORGANIZATION_PATH, query: { company: PLATFORM_NODE } });
    expect(adminLanding({ tab: "mail" })).toEqual({ path: ORGANIZATION_PATH, query: { company: PLATFORM_NODE, tab: "mail" } });
    expect(adminLanding({ tab: "apps" })).toEqual({ path: ORGANIZATION_PATH, query: { company: PLATFORM_NODE, tab: "apps" } });
    expect(adminLanding({ tab: "plans" })).toEqual({ path: ORGANIZATION_PATH, query: { company: PLATFORM_NODE, tab: "supply" } });
    expect(adminLanding({ tab: "credits" })).toEqual({ path: ORGANIZATION_PATH, query: { company: PLATFORM_NODE, tab: "supply" } });
    expect(adminLanding({ tab: "stray", company: "5" })).toEqual({ path: ORGANIZATION_PATH, query: { company: PLATFORM_NODE, tab: "providers" } });
  });
});

// The tabs stand in four groups (docs/web.md, 「System and organisation」): a value kept and the setting of how a
// service runs never stand in one group, and every tab stands in one.
test("each tab stands in one of the four groups, values apart from the settings of how a service runs", () => {
  const groupOf = (value: string) => ORGANIZATION_TABS.find((tab) => tab.value === value)?.group;

  expect(ORGANIZATION_TABS.every((tab) => ORGANIZATION_GROUPS.some((group) => group.value === tab.group))).toBe(true);
  expect([groupOf("supply"), groupOf("providers")]).toEqual(["status", "settings"]);
  expect([groupOf("secrets"), groupOf("secret-kinds")]).toEqual(["status", "settings"]);
  expect([groupOf("supervisors"), groupOf("agents")]).toEqual(["status", "settings"]);
  expect([groupOf("permissions"), groupOf("security")]).toEqual(["access", "access"]);
});
