import type { Component, ComputedRef } from "vue";
import type { LocationQuery } from "vue-router";

import { useAdministrator } from "./access";
import { adminAddress, adminTabNamed, administratorOpens } from "./administration";
import { PERSON_PANE_KEY } from "./person-panes";
import { useRosterCompanies } from "./roster";
import { SETTINGS_QUERY } from "./settings-dialog";

// The organisation screen (docs/web.md, 「Organisation」): the organisation and the people in it, a tab to a
// section. Each tab is a component of its own; this is only the order they stand in,
// what each tab is called and who may open it.

export const ORGANIZATION_PATH = "/organization";

/** Who reads the screen, as far as which tabs stand for them: the platform administrator, and whether the people
 * roster answers them any company to look through (docs/accounts.md, 「The people roster」). `known` is false until
 * what decides it has been read, so a tab not yet known to stand is neither drawn nor taken away from the address. */
export interface OrganizationReader {
  administrator: boolean;
  roster: boolean;
  known: boolean;
}

export interface OrganizationTab {
  // Its key in the address, `?tab=<value>`; the first tab is the screen's own address.
  value: string;
  // Its name in the language pack.
  label: string;
  icon: string;
  // Whether a reader opens it: each tab says so for itself.
  opens: (reader: OrganizationReader) => boolean;
  // The keys of the address the tab owns besides `tab`, which go when the reader moves to another tab.
  keys: readonly string[];
  // Whether its content is laid across the whole body, unpadded and scrolling its own regions, rather than standing in
  // the body's centred reading column.
  wide: boolean;
  // The tab's own component, loaded when it is first opened.
  load: () => Promise<{ default: Component }>;
}

// Every reader the screen stands for: the administrator, and a member who heads a unit, whose invitations tab says so
// where they head none.
function everyReaderOpens(): boolean {
  return true;
}

// The administrator, and a member who heads a company (docs/web.md, 「Organisation」, the people tab).
function rosterReaderOpens(reader: OrganizationReader): boolean {
  return reader.administrator || reader.roster;
}

// The people tab's key, which a section moved into one person's tab leads to.
const PEOPLE_TAB = "people";

export const ORGANIZATION_TABS: readonly OrganizationTab[] = [
  { value: "organization", label: "organization.label.chart", icon: "i-material-symbols-account-tree-outline", opens: administratorOpens, keys: ["unit", "kind"], wide: true, load: () => import("~/components/OrganizationUnits.vue") },
  { value: PEOPLE_TAB, label: "roster.label.tab", icon: "i-material-symbols-group-outline", opens: rosterReaderOpens, keys: ["q", "company", "unit", "kind", "role", "state", "user", PERSON_PANE_KEY], wide: true, load: () => import("~/components/OrganizationPeople.vue") },
  { value: "catalogue", label: "catalogue.label.tab", icon: "i-material-symbols-category-outline", opens: rosterReaderOpens, keys: ["company"], wide: false, load: () => import("~/components/OrganizationCatalogue.vue") },
  { value: "invites", label: "settings.label.invites", icon: "i-material-symbols-person-add-outline", opens: everyReaderOpens, keys: [], wide: false, load: () => import("~/components/OrganizationInvites.vue") },
  { value: "agent", label: "settings.label.bmo", icon: "i-material-symbols-face-outline", opens: everyReaderOpens, keys: ["company", "unit"], wide: false, load: () => import("~/components/OrganizationBmo.vue") }
];

// Where a section that once stood here as a tab stands now, by the key its tab had, so a link made before it moved
// still lands on it: the research supervisor with the research unit's settings, the voice briefing and a person's own
// secrets in the settings dialog over this screen, the providers and the secret kinds on the administrator's screen,
// and a person's sections on that person's own tab of the people tab. `carries` names the keys of the old address the
// new one keeps, such as the person it was open at.
const MOVED_AWAY: Readonly<Record<string, { path: string; query: LocationQuery; carries?: readonly string[] }>> = {
  research: { path: "/research", query: { tab: "settings" } },
  briefing: { path: ORGANIZATION_PATH, query: { [SETTINGS_QUERY]: "briefing" } },
  secrets: { path: ORGANIZATION_PATH, query: { [SETTINGS_QUERY]: "secrets" } },
  permissions: { path: ORGANIZATION_PATH, query: { tab: PEOPLE_TAB, [PERSON_PANE_KEY]: "permissions" }, carries: ["user"] }
};

/** The address a key of a tab that moved away from this screen now leads to, where it names one, read off the address it was asked on. */
export function organizationMovedAway(key: unknown, query: LocationQuery = {}): { path: string; query: LocationQuery } | null {
  const admin = adminTabNamed(key);

  if (admin !== null) return adminAddress(admin.value);

  if (typeof key !== "string" || !Object.hasOwn(MOVED_AWAY, key)) return null;

  const { path, query: lands, carries = [] } = MOVED_AWAY[key]!;
  const carried = Object.fromEntries(carries.flatMap((one) => (query[one] === undefined ? [] : [[one, query[one]]])));

  return { path, query: { ...carried, ...lands } };
}

/** The tabs a reader opens, each by its own say. */
export function organizationTabsFor(reader: OrganizationReader): OrganizationTab[] {
  return ORGANIZATION_TABS.filter((tab) => tab.opens(reader));
}

/**
 * The tabs the row holds: those the reader opens, and while who reads is still read, the one the address names as
 * well, so the tab asked for stands chosen from the server's picture on.
 */
export function organizationRowTabs(reader: OrganizationReader, asked: unknown): OrganizationTab[] {
  return ORGANIZATION_TABS.filter((tab) => tab.opens(reader) || (!reader.known && tab.value === asked));
}

/**
 * The tab drawn for the tab an address asks for, the screen's own where it names none: that tab where the reader opens
 * it, else the first they open once who reads is known. None while who reads is still read and the tab is not yet
 * known to stand for them, so the server's picture never holds a tab the browser then takes away.
 */
export function organizationTabOf(asked: unknown, reader: OrganizationReader): OrganizationTab | null {
  const tabs = organizationTabsFor(reader);
  const named = tabs.find((tab) => tab.value === (asked ?? ORGANIZATION_TABS[0]!.value));

  return named ?? (reader.known ? (tabs[0] ?? null) : null);
}

// Every key a tab owns, so whichever tab the address stood on, its keys go as the reader moves to another.
const TAB_KEYS = new Set(ORGANIZATION_TABS.flatMap((tab) => tab.keys));

/**
 * The address of one tab: the screen's own for the first, `?tab=` for the rest. What the tab left owned goes, and
 * every other key of the address stays; `carried` names the keys a deliberate open hands the tab entered, such as
 * the company and the unit the BMO tab opens at.
 */
export function organizationAddress(value: string, query: LocationQuery = {}, carried: LocationQuery = {}): { path: string; query: LocationQuery } {
  const rest = Object.fromEntries(Object.entries(query).filter(([key]) => key !== "tab" && !TAB_KEYS.has(key)));
  const kept = { ...rest, ...carried };

  return { path: ORGANIZATION_PATH, query: value === ORGANIZATION_TABS[0]!.value ? kept : { ...kept, tab: value } };
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

/**
 * Who reads the organisation screen, for the tabs that stand for them: the administrator at once, and a member once
 * the people roster has said whether they look through any company. A read that failed leaves them as one who looks
 * through none. Once the roster has answered they stay known: a tab that reads the roster itself asks it again as it
 * opens, and that read must not make the reader unknown and take the tab away.
 */
export function useOrganizationReader(): ComputedRef<OrganizationReader> {
  const administrator = useAdministrator();
  const { companies, status } = useRosterCompanies();
  const answered = ref(false);

  watch(
    status,
    (now) => {
      if (now === "success" || now === "error") answered.value = true;
    },
    { immediate: true }
  );

  return computed(() => ({
    administrator: administrator.value,
    roster: companies.value.length > 0,
    known: administrator.value || answered.value
  }));
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
  // The people holding a post in it.
  concurrent?: string[];
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
  // Whether the act ends the post they hold in the unit they go to, which becomes their home.
  postDropped: boolean;
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

    const postDropped = moving && (units.find((unit) => unit.id === to)?.concurrent ?? []).includes(user);

    return [{ user, from: from.id, to, wasHead, head, headDropped: moving && wasHead, postDropped, unchanged: !moving && wasHead === head }];
  });
}
