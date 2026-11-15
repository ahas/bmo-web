import type { Component, ComputedRef } from "vue";
import type { LocationQuery } from "vue-router";

import { adminAddress, adminTabNamed } from "./administration";
import { SETTINGS_QUERY } from "./settings-dialog";

// The organisation screen (docs/web.md, 「Organisation」): the organisation and the people in it, a tab to a
// section. Each tab is a component of its own; this is only the order they stand in,
// what each tab is called and who may open it.

export const ORGANIZATION_PATH = "/organization";

export interface OrganizationTab {
  // Its key in the address, `?tab=<value>`; the first tab is the screen's own address.
  value: string;
  // Its name in the language pack.
  label: string;
  icon: string;
  // Whether a member who heads a unit opens it as well as the administrator.
  inviters: boolean;
  // Whether its content is laid across the whole body, unpadded and scrolling its own regions, rather than standing in
  // the body's centred reading column.
  wide: boolean;
  // The tab's own component, loaded when it is first opened.
  load: () => Promise<{ default: Component }>;
}

export const ORGANIZATION_TABS: readonly OrganizationTab[] = [
  { value: "organization", label: "organization.label.chart", icon: "i-material-symbols-account-tree-outline", inviters: false, wide: true, load: () => import("~/components/OrganizationUnits.vue") },
  { value: "invites", label: "settings.label.invites", icon: "i-material-symbols-person-add-outline", inviters: true, wide: false, load: () => import("~/components/OrganizationInvites.vue") },
  { value: "permissions", label: "settings.label.permissions", icon: "i-material-symbols-admin-panel-settings-outline", inviters: false, wide: false, load: () => import("~/components/OrganizationPermissions.vue") }
];

// Where a section that once stood here as a tab stands now, by the key its tab had, so a link made before it moved
// still lands on it: the research supervisor with the research unit's settings, the voice briefing and a person's own
// secrets in the settings dialog over this screen, and the providers and the secret kinds on the administrator's
// screen.
const MOVED_AWAY: Readonly<Record<string, { path: string; query: LocationQuery }>> = {
  research: { path: "/research", query: { tab: "settings" } },
  briefing: { path: ORGANIZATION_PATH, query: { [SETTINGS_QUERY]: "briefing" } },
  secrets: { path: ORGANIZATION_PATH, query: { [SETTINGS_QUERY]: "secrets" } }
};

/** The address a key of a tab that moved away from this screen now leads to, where it names one. */
export function organizationMovedAway(key: unknown): { path: string; query: LocationQuery } | null {
  const admin = adminTabNamed(key);

  if (admin !== null) return adminAddress(admin.value);

  return typeof key === "string" && Object.hasOwn(MOVED_AWAY, key) ? MOVED_AWAY[key]! : null;
}

/** The tabs a reader opens: every one for the administrator, the inviters' for a member. */
export function organizationTabsFor(administrator: boolean): OrganizationTab[] {
  return ORGANIZATION_TABS.filter((tab) => administrator || tab.inviters);
}

/** The tab an address asks for among those a reader opens, the first of them where it names none. */
export function organizationTabOf(asked: unknown, tabs: readonly OrganizationTab[]): OrganizationTab {
  return tabs.find((tab) => tab.value === asked) ?? tabs[0] ?? ORGANIZATION_TABS[0]!;
}

/** The address of one tab: the screen's own for the first, `?tab=` for the rest. */
export function organizationAddress(value: string, query: LocationQuery = {}): { path: string; query: LocationQuery } {
  const rest = Object.fromEntries(Object.entries(query).filter(([key]) => key !== "tab" && key !== "unit"));

  return { path: ORGANIZATION_PATH, query: value === ORGANIZATION_TABS[0]!.value ? rest : { ...rest, tab: value } };
}

/** The tab of the organisation screen a key names, where it names one. */
export function organizationTabNamed(key: string): OrganizationTab | null {
  return ORGANIZATION_TABS.find((tab) => tab.value === key) ?? null;
}

/**
 * Whether the reader may invite into some unit, as the console's server answers: the administrator always, a member
 * where they head a unit. A member who may invite is listed the organisation screen with its invitations tab
 * alone (docs/web.md, 「Organisation」). Read once for the tab and kept while it stands.
 */
export function useMayInvite(): ComputedRef<boolean> {
  const { data } = useFetch<{ id: number; name: string }[]>("/api/invites/units", { key: "invite-units", lazy: true, server: false, default: () => [] });

  return computed(() => (data.value ?? []).length > 0);
}

// The units tab's tree (docs/web.md, 「Organisation」, its chart): companies at its top, each unit under its
// parent to any depth. A unit is read by its number, its name and its parent alone, so the tree stands on whatever
// row the service answers.
export interface UnitPlace {
  id: number;
  name: string;
  parent?: number | null;
}

export interface UnitBranch<Unit extends UnitPlace> {
  unit: Unit;
  children: UnitBranch<Unit>[];
}

/** Whether a unit stands at the tree's top: a company, with no parent. */
export function isCompany(unit: UnitPlace): boolean {
  return unit.parent === undefined || unit.parent === null;
}

/**
 * The units as a tree in the order they are given: a company, or a unit whose parent is not among them, at the top,
 * and every other unit under its parent.
 */
export function unitBranches<Unit extends UnitPlace>(units: readonly Unit[]): UnitBranch<Unit>[] {
  const branches = new Map(units.map((unit) => [unit.id, { unit, children: [] as UnitBranch<Unit>[] }]));
  const roots: UnitBranch<Unit>[] = [];

  for (const branch of branches.values()) {
    const parent = isCompany(branch.unit) ? undefined : branches.get(branch.unit.parent!);

    (parent?.children ?? roots).push(branch);
  }

  return roots;
}

/** The units from the company down to the one named, itself last; none where it is not among them. */
export function unitPath<Unit extends UnitPlace>(units: readonly Unit[], id: number): Unit[] {
  const byId = new Map(units.map((unit) => [unit.id, unit]));
  const path: Unit[] = [];
  let unit = byId.get(id);

  // A unit met twice ends the walk, so a parent that loops back cannot keep it going.
  while (unit !== undefined && !path.includes(unit)) {
    path.unshift(unit);
    unit = isCompany(unit) ? undefined : byId.get(unit.parent!);
  }

  return path;
}

/** The branches to open so a unit is in view: every unit above it, from its company down. */
export function branchesAbove(units: readonly UnitPlace[], id: number): number[] {
  return unitPath(units, id)
    .slice(0, -1)
    .map((unit) => unit.id);
}

/** The branches open at first: every company's, and every one down to the unit chosen. */
export function branchesOpenAtFirst(units: readonly UnitPlace[], chosen: number | null): number[] {
  const open = units.filter(isCompany).map((unit) => unit.id);

  return [...new Set(chosen === null ? open : [...open, ...branchesAbove(units, chosen)])];
}

// A move of several people into one unit (docs/web.md, 「Organisation」, its chart): what the act will write,
// read off the units as they were last read, so the dialog shows who goes where before anything is written and the
// act names, for each person, the unit they stood in when it was shown.
export interface UnitStanding extends UnitPlace {
  heads: string[];
  members: string[];
}

/** One person of a move: where they stand now and go, and whether they head the one and will head the other. */
export interface MoveRow {
  user: string;
  from: number;
  to: number;
  // Whether they are granted head of the unit they stand in now, and whether they will head the unit they go to.
  wasHead: boolean;
  head: boolean;
  // Whether the act takes away their head grant on the unit they leave.
  headDropped: boolean;
  // Whether the act leaves them as they stand.
  unchanged: boolean;
}

/** What moving people into a unit, each heading it or not, writes for each; a person no unit holds is left out. */
export function movePlan(units: readonly UnitStanding[], people: readonly { user: string; head: boolean }[], to: number): MoveRow[] {
  return people.flatMap(({ user, head }) => {
    const from = units.find((unit) => unit.members.includes(user));

    if (from === undefined) return [];

    const wasHead = from.heads.includes(user);
    const moving = from.id !== to;

    return [{ user, from: from.id, to, wasHead, head, headDropped: moving && wasHead, unchanged: !moving && wasHead === head }];
  });
}
