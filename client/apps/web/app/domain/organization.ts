
import type { Component, ComputedRef, Ref } from "vue";
import type { LocationQuery } from "vue-router";
import type { InviteUnit, UnitRow } from "@web/server-client";
import type { OrgMemoryUnitView } from "#shared/org-memory";

import { useAdministrator } from "./access";
import { adminAddress, adminTabNamed, administratorOpens } from "./administration";
import { inviteCompanies } from "./invites";
import { PERSON_PANE_KEY } from "./person-panes";
import { useRosterCompanies } from "./roster";
import { useSupplyReader, useSupplyUnits } from "./supply";
import { SETTINGS_QUERY } from "./settings-dialog";

// The organisation screen (docs/web.md, 「Organisation」): the organisations at its left, the one chosen at its right,
// and inside it a tab to a section. Each tab is a component of its own; this is only the order they stand in, what
// each tab is called and who may open it, and which organisation the address chooses.

export const ORGANIZATION_PATH = "/organization";

/** The key of the address the organisation chosen stands in, kept as the reader moves between tabs. */
export const ORGANIZATION_KEY = "company";

/** Who reads the screen, as far as which tabs stand for them: the platform administrator, whether the people
 * roster answers them the organisation chosen to look through (docs/accounts.md, 「The people roster」), and which
 * part of its supply they hold. `known` is false until what decides it has been read, so a tab not yet known to stand
 * is neither drawn nor taken away from the address. */
export interface OrganizationReader {
  administrator: boolean;
  roster: boolean;
  // Whether the reader holds the supply policy and credits of the organisation chosen — their own read, not the
  // roster's.
  supply: boolean;
  // Whether the reader holds any part of its supply, its plan alone among them, as a subscription manager does.
  plans: boolean;
  // Whether the reader writes the org memory of a unit of the organisation chosen, heading it or holding its grant.
  memory: boolean;
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

// The supply tab's readers: the administrator, and a member the account service's read says holds the supply policy
// and credits of the organisation chosen (「Organisation」, the supply tab).
function supplyReaderOpens(reader: OrganizationReader): boolean {
  return reader.administrator || reader.supply;
}

// The plans tab's readers: the administrator, and a member the account service's read says holds any part of the
// organisation's supply — its policy, or its plan alone (「Organisation」, the plans tab).
function plansReaderOpens(reader: OrganizationReader): boolean {
  return reader.administrator || reader.supply || reader.plans;
}

// The org memory tab's readers: the administrator, and a member the account service says writes the org memory of a
// unit of the organisation chosen (「Organisation」, the org memory tab).
function memoryReaderOpens(reader: OrganizationReader): boolean {
  return reader.administrator || reader.memory;
}

// The people tab's key, which a section moved into one person's tab leads to.
const PEOPLE_TAB = "people";

export const ORGANIZATION_TABS: readonly OrganizationTab[] = [
  { value: "organization", label: "organization.label.chart", icon: "i-material-symbols-account-tree-outline", opens: administratorOpens, keys: ["unit", "kind"], wide: true, load: () => import("~/components/OrganizationUnits.vue") },
  { value: PEOPLE_TAB, label: "roster.label.tab", icon: "i-material-symbols-group-outline", opens: rosterReaderOpens, keys: ["q", "unit", "kind", "role", "state", "user", PERSON_PANE_KEY], wide: true, load: () => import("~/components/OrganizationPeople.vue") },
  { value: "catalogue", label: "catalogue.label.tab", icon: "i-material-symbols-category-outline", opens: rosterReaderOpens, keys: [], wide: false, load: () => import("~/components/OrganizationCatalogue.vue") },
  { value: "invites", label: "settings.label.invites", icon: "i-material-symbols-person-add-outline", opens: everyReaderOpens, keys: [], wide: false, load: () => import("~/components/OrganizationInvites.vue") },
  { value: "agent", label: "settings.label.bmo", icon: "i-material-symbols-face-outline", opens: everyReaderOpens, keys: ["unit"], wide: false, load: () => import("~/components/OrganizationBmo.vue") },
  { value: "memory", label: "org_memory.label.tab", icon: "i-material-symbols-psychology-outline", opens: memoryReaderOpens, keys: ["unit"], wide: false, load: () => import("~/components/OrganizationMemory.vue") },
  // The supply tab stands only for a reader who holds the organisation's supply policy, and the plans tab for one who
  // holds any part of its supply — the administrator everywhere (docs/web.md, 「Organisation」, the supply and plans
  // tabs).
  { value: "supply", label: "supply.label.tab", icon: "i-material-symbols-bolt-outline", opens: supplyReaderOpens, keys: ["unit"], wide: false, load: () => import("~/components/OrganizationSupply.vue") },
  { value: "plans", label: "supply.label.plans", icon: "i-material-symbols-receipt-long-outline", opens: plansReaderOpens, keys: [], wide: false, load: () => import("~/components/OrganizationPlans.vue") }
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
  permissions: { path: ORGANIZATION_PATH, query: { tab: PEOPLE_TAB, [PERSON_PANE_KEY]: "permissions" }, carries: ["user", ORGANIZATION_KEY] }
};

/** The address a key of a tab that moved away from this screen now leads to, where it names one, read off the address it was asked on. */
export function organizationMovedAway(key: unknown, query: LocationQuery = {}): { path: string; query: LocationQuery } | null {
  // A key this screen's own tab holds stands here, whatever tab of the administrator's carries the same key.
  if (typeof key === "string" && organizationTabNamed(key) !== null) return null;

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
 * every other key of the address stays, the organisation chosen among them; `carried` names the keys a deliberate open
 * hands the tab entered, such as the organisation and the unit the BMO tab opens at.
 */
export function organizationAddress(value: string, query: LocationQuery = {}, carried: LocationQuery = {}): { path: string; query: LocationQuery } {
  const rest = Object.fromEntries(Object.entries(query).filter(([key]) => key !== "tab" && !TAB_KEYS.has(key)));
  const kept = { ...rest, ...carried };

  return { path: ORGANIZATION_PATH, query: value === ORGANIZATION_TABS[0]!.value ? kept : { ...kept, tab: value } };
}

/**
 * The address of one organisation chosen from the list: the tab open stays, what that tab held of the organisation
 * before — its words, its filters, the person open — goes, and every other key of the address stays, the person's tab
 * kept for the person opened next among them.
 */
export function organizationChosenAddress(company: number, query: LocationQuery = {}): { path: string; query: LocationQuery } {
  const rest = Object.fromEntries(Object.entries(query).filter(([key]) => key === PERSON_PANE_KEY || !TAB_KEYS.has(key)));

  return { path: ORGANIZATION_PATH, query: { ...rest, [ORGANIZATION_KEY]: String(company) } };
}

/** One organisation of the list: a company at the top of the tree of units, by its number and its name. */
export interface Organization {
  id: number;
  name: string;
}

/**
 * The organisation an address chooses among those the reader may set: the one `?company=` names; else, for a link
 * made before the screen chose an organisation first, the one whose tree holds the unit `?unit=` names; else the
 * first. None where the reader may set none.
 */
export function chosenOrganization(query: LocationQuery, organizations: readonly Organization[], companyOfUnit: (unit: number) => number | null = () => null): Organization | null {
  const named = (value: LocationQuery[string] | undefined): Organization | undefined => {
    const text = Array.isArray(value) ? value[0] : value;

    return typeof text === "string" && /^[1-9][0-9]*$/.test(text) ? organizations.find((one) => one.id === Number(text) || one.id === companyOfUnit(Number(text))) : undefined;
  };
  const asked = Array.isArray(query[ORGANIZATION_KEY]) ? query[ORGANIZATION_KEY][0] : query[ORGANIZATION_KEY];
  const byCompany = typeof asked === "string" ? organizations.find((one) => String(one.id) === asked) : undefined;

  return byCompany ?? named(query.unit) ?? organizations[0] ?? null;
}

/** The companies a member may set something in, each once: those where they head a unit — the invitations' units —
 * and those the roster, the supply reach and the org memory read answer them (docs/web.md, 「Organisation」). They stand in the tree's order
 * whichever read named them, which for companies is the order of their numbers, as the account service lays its tree. */
export function memberOrganizations(inviteUnits: readonly InviteUnit[], ...more: readonly (readonly Organization[])[]): Organization[] {
  const all = new Map<number, Organization>();

  for (const one of [...inviteCompanies(inviteUnits), ...more.flat()]) if (!all.has(one.id)) all.set(one.id, { id: one.id, name: one.name });

  return [...all.values()].sort((one, other) => one.id - other.id);
}

/** The tab of the organisation screen a key names, where it names one. */
export function organizationTabNamed(key: string): OrganizationTab | null {
  return ORGANIZATION_TABS.find((tab) => tab.value === key) ?? null;
}

/**
 * Whether the reader keeps something of a unit, as the console's server answers: the administrator always, a member
 * where they head a unit, so may invite into it, or write a unit's org memory. Such a member is listed the
 * organisation screen (docs/web.md, 「Organisation」). Read once for the shell and kept while it stands.
 */
export function useKeepsUnits(): ComputedRef<boolean> {
  const { data } = useFetch<{ id: number; name: string }[]>("/api/invites/units", { key: "invite-units", lazy: true, server: false, default: () => [] });
  const { units } = useOrgMemoryUnits();

  return computed(() => (data.value ?? []).length > 0 || units.value.length > 0);
}

/**
 * The units whose org memory the reader writes, as the account service answers them, and whether that read has
 * answered, in either direction (docs/web.md, 「Organisation」, the org memory tab). One read shared by the shell, the
 * screen and the tab.
 */
export function useOrgMemoryUnits(): { units: ComputedRef<OrgMemoryUnitView[]>; status: Ref<string>; failed: ComputedRef<boolean>; refresh: () => Promise<void> } {
  const { data, status, refresh } = useFetch<OrgMemoryUnitView[]>("/api/organization/memory/units", { key: "org-memory-units", lazy: true, server: false, default: () => [] });

  return {
    units: computed(() => (status.value === "success" ? (data.value ?? []) : [])),
    status,
    failed: computed(() => status.value === "error"),
    refresh: async () => await refresh()
  };
}

/**
 * Who reads the organisation screen, for the tabs that stand for them: the administrator at once, and a member once
 * the people roster has said which companies they look through, the supply read which their supply reach covers and
 * the org memory read whose units' memory they write. Where an organisation is chosen, each says whether it covers that
 * one; where none is, whether it covers any. A read that failed leaves them as one who looks through none, manages none
 * and writes none. Once all have answered they stay known: a
 * tab that reads one of them itself asks it again as it opens, and that read must not make the reader unknown and
 * take the tab away.
 */
export function useOrganizationReader(chosen: () => number | null = () => null): ComputedRef<OrganizationReader> {
  const administrator = useAdministrator();
  const { companies, status } = useRosterCompanies();
  const supply = useSupplyReader();
  const supplied = useSupplyUnits();
  const memory = useOrgMemoryUnits();
  const rosterAnswered = useAnswered(status);
  const memoryAnswered = useAnswered(memory.status);
  const covers = (list: readonly { id: number }[]): boolean => {
    const company = chosen();

    return company === null ? list.length > 0 : list.some((one) => one.id === company);
  };

  return computed(() => ({
    administrator: administrator.value,
    roster: covers(companies.value),
    supply: covers(supplied.value.filter((one) => one.policy)),
    plans: covers(supplied.value),
    memory: covers(memory.units.value.map((one) => one.company)),
    known: administrator.value || (rosterAnswered.value && supply.value.known && memoryAnswered.value)
  }));
}

// Whether a read has answered once, either way; it stays answered as the read is asked again.
function useAnswered(status: Ref<string>): Ref<boolean> {
  const answered = ref(false);

  watch(
    status,
    (now) => {
      if (now === "success" || now === "error") answered.value = true;
    },
    { immediate: true }
  );

  return answered;
}

/** The key the administrator's read of every unit is kept under, which a change of a company's name reads again. */
export const ORGANIZATION_UNITS_KEY = "organization-units";

/** The organisations the reader may set something in, and what the screen needs to choose one. */
export interface Organizations {
  // Every company the reader may set anything in, in the tree's order; null until the reads that say so answer.
  list: ComputedRef<Organization[] | null>;
  // Why the read failed, empty while it has not.
  failure: ComputedRef<string>;
  // The company a unit stands in, where the reads hold it: an old link naming a unit lands in its organisation.
  companyOf: (unit: number) => number | null;
  reading: ComputedRef<boolean>;
  refresh: () => Promise<void>;
}

/**
 * The organisations the screen lists (docs/web.md, 「Organisation」): every company for the administrator, read off
 * every unit; for a member the companies where they head a unit, manage the supply, write a unit's org memory or head
 * the company itself. Read once the page stands in the browser and kept while it stands.
 */
export function useOrganizations(failed: (error: unknown) => string): Organizations {
  const administrator = useAdministrator();
  const units = useFetch<UnitRow[]>("/api/organization/units", { key: ORGANIZATION_UNITS_KEY, lazy: true, server: false, immediate: false, default: () => [] });
  const invites = useFetch<InviteUnit[]>("/api/invites/units", { key: "invite-units", lazy: true, server: false, default: () => [] });
  const roster = useRosterCompanies();
  const supply = useSupplyReader();
  const supplied = useSupplyUnits();
  const memory = useOrgMemoryUnits();
  const invitesAnswered = useAnswered(invites.status);
  const rosterAnswered = useAnswered(roster.status);
  const memoryAnswered = useAnswered(memory.status);

  // The administrator's read is asked in the browser alone. Asked while the server draws the page, an answer that came
  // back before the drawing ended would ride to the browser in the page's payload as already read, and the browser
  // would never ask for the list itself.
  if (import.meta.client) {
    watch(
      administrator,
      (now) => {
        if (now && units.status.value === "idle") void units.execute();
      },
      { immediate: true }
    );
  }

  const list = computed<Organization[] | null>(() => {
    if (administrator.value) return units.status.value === "success" ? (units.data.value ?? []).filter(isCompany).map((one) => ({ id: one.id, name: one.name })) : null;
    if (!invitesAnswered.value || !rosterAnswered.value || !supply.value.known || !memoryAnswered.value) return null;

    return memberOrganizations(invites.status.value === "success" ? (invites.data.value ?? []) : [], roster.companies.value, supplied.value, memory.units.value.map((one) => one.company));
  });
  const failure = computed(() => (administrator.value && units.error.value ? failed(units.error.value) : ""));

  function companyOf(unit: number): number | null {
    if (administrator.value) return unitPath(units.data.value ?? [], unit)[0]?.id ?? null;

    return [...(invites.data.value ?? []), ...memory.units.value].find((one) => one.id === unit)?.company.id ?? null;
  }

  return {
    list,
    failure,
    companyOf,
    reading: computed(() => units.status.value === "pending"),
    refresh: async () => {
      if (administrator.value) await units.refresh();
    }
  };
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
