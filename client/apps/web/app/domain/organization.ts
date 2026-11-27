
import type { Component, ComputedRef, Ref } from "vue";
import type { LocationQuery } from "vue-router";
import type { InviteUnit, UnitRow } from "@web/server-client";
import type { OrgMemoryUnitView } from "#shared/org-memory";
import type { AgentSection } from "#shared/sections";
import type { AgentTab } from "./agent-settings";
import type { SideNode } from "bmo-ui/app/domain/side-parts";

import { useAdministrator } from "./access";
import { AGENT_TABS } from "./agent-settings";
import { inviteCompanies } from "./invites";
import { PERSON_PANE_KEY } from "./person-panes";
import { useRosterCompanies } from "./roster";
import { useSectionAccess, useSectionAccessReady } from "./section-access";
import { useSupplyReader, useSupplyUnits } from "./supply";
import { SETTINGS_QUERY } from "./settings-dialog";

import { AGENT_SECTIONS, agentSectionsRead } from "#shared/sections";

// The system and organisation screen (docs/web.md, 「System and organisation」): one tree of the organisations at
// its left, the node chosen at its right, and inside it a tab to a section, the platform's own settings among the
// tabs the platform node holds. Each tab is a component of its own; this is only the order they
// stand in, what each tab is called and who may open it, the tree, and which node the address chooses.

export const ORGANIZATION_PATH = "/organization";

/** The key of the address the organisation chosen stands in, kept as the reader moves between tabs. */
export const ORGANIZATION_KEY = "company";

/** The key of the address a unit chosen in the tree stands in beside its company, kept as the reader moves between
 * tabs; absent where the company itself is chosen. */
export const UNIT_KEY = "unit";

/** The node of the administrator's tree standing for the platform itself, above every company, and the value of
 * `?company=` that chooses it (docs/web.md, 「System and organisation」). */
export const PLATFORM_NODE = "platform";

/** The node of every tree of a reader with a user standing for the reader's own link, and the value of `?company=`
 * that chooses it. */
export const PERSON_NODE = "me";

/** A node of the tree that is a link of the delegation chain of its own rather than a company or a unit of one: the
 * platform's, or the reader's own. */
export type LinkNode = typeof PLATFORM_NODE | typeof PERSON_NODE;

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
  // Whether the reader heads a unit of the organisation chosen, so may invite into it.
  heads: boolean;
  // Which of the agency's agent sections the reader may read, from the account service's grants; whole for the
  // administrator whatever that read has yet answered. The agent tabs stand where their section is read.
  agents: readonly AgentSection[];
  known: boolean;
}

/** The groups the tabs stand in (docs/web.md, 「System and organisation」): the organisation, the values kept, how a
 * service runs, and who may do what. */
export type OrganizationGroup = "organization" | "status" | "settings" | "access";

/** The groups in the order their row stands, each with its name in the language pack. */
export const ORGANIZATION_GROUPS: readonly { value: OrganizationGroup; label: string }[] = [
  { value: "organization", label: "organization.label.group_organization" },
  { value: "status", label: "organization.label.group_status" },
  { value: "settings", label: "organization.label.group_settings" },
  { value: "access", label: "organization.label.group_access" }
];

export interface OrganizationTab {
  // Its key in the address, `?tab=<value>`; the first tab is the screen's own address.
  value: string;
  // The group it stands in.
  group: OrganizationGroup;
  // Its name in the language pack.
  label: string;
  icon: string;
  // Whether a reader opens it at a company or a unit of one: each tab says so for itself. A link of the chain instead
  // offers the tab by its declared view alone, so no tab needs to speak of a link here.
  opens: (reader: OrganizationReader) => boolean;
  // The keys of the address the tab owns besides `tab`, which go when the reader moves to another tab.
  keys: readonly string[];
  // Whether its content is laid across the whole body, unpadded and scrolling its own regions, rather than standing in
  // the body's centred reading column.
  wide: boolean;
  // The tab's own component, loaded when it is first opened.
  load: () => Promise<{ default: Component }>;
  // The components it shows while a link node is chosen, each reading and writing that link of the tab's settings:
  // the platform's own, and the reader's own. These are the whole of what a link node offers: a tab holding no view
  // of a link holds nothing to set there and is not offered at it. Where a link's view still turns on the reader's
  // rights — an agent tab at one's own link stands on its section alone — `opensLink` says so; left out, every
  // reader the link itself reaches opens the view.
  links?: Partial<Record<LinkNode, () => Promise<{ default: Component }>>>;
  opensLink?: (reader: OrganizationReader, link: LinkNode) => boolean;
}

// Every reader the screen stands for, wherever they stand in its tree.
function everyReaderOpens(): boolean {
  return true;
}

// The administrator's chart: the units of an organisation only they stand in whole.
function administratorOpens(reader: OrganizationReader): boolean {
  return reader.administrator;
}

// The administrator, and a member who heads a company (docs/web.md, 「System and organisation」, the people tab).
function rosterReaderOpens(reader: OrganizationReader): boolean {
  return reader.administrator || reader.roster;
}

// The supply tab's readers: the administrator, and a member the account service's read says holds any part of the
// organisation's supply — its policy and credits, or its plan alone (「System and organisation」, the supply tab).
function supplyReaderOpens(reader: OrganizationReader): boolean {
  return reader.administrator || reader.supply || reader.plans;
}

// The org memory tab's readers: the administrator, and a member the account service says writes the org memory of a
// unit of the organisation chosen (「System and organisation」, the org memory tab).
function memoryReaderOpens(reader: OrganizationReader): boolean {
  return reader.administrator || reader.memory;
}

// The agents, storage and mail servers tabs' readers: the administrator, and a member who heads a unit of the organisation chosen, a company's
// head or a unit's below it (「System and organisation」, the agents tab).
function headReaderOpens(reader: OrganizationReader): boolean {
  return reader.administrator || reader.heads;
}

// The platform's own tabs (docs/web.md, 「System and organisation」): what is set for the platform itself — the
// providers every run goes out on and the kinds every person's secret form asks in, with the system mail — stands at
// the platform link alone, which no reader's tree but the administrator's holds. They open for no reader at a
// company, a unit or the reader's own link, so the platform view is what brings them into a row at all.
function platformNodeOnlyOpens(): boolean {
  return false;
}

// The words and the icon of one part of agent management, kept in the one table the old agent screen stood
// the tabs on (docs/web.md, 「System and organisation」, the agent tabs).
function agentWord(value: AgentTab): string {
  return AGENT_TABS.find((one) => one.value === value)!.label;
}

function agentIcon(value: AgentTab): string {
  return AGENT_TABS.find((one) => one.value === value)!.icon;
}

// A row resource's tab — the supervisors with their roles' agents, the repositories, the registered models: its
// section says who may read it, and at a company or a unit the reader must head one of it as well, since the
// agency answers a node's list to its heads alone (「System and organisation」, the agent tabs; the agency's
// `docs/api.md`, 「Who a caller acts for」).
function agentRowsOpens(section: AgentSection) {
  return (reader: OrganizationReader): boolean => reader.administrator || (reader.heads && reader.agents.includes(section));
}

// The same section at a link of the chain without the heading: a reader's own link holds their own rows, which
// their section alone decides, and the platform's link reaches here only through the administrator's tree.
function agentRowsLinkOpens(section: AgentSection) {
  return (reader: OrganizationReader): boolean => reader.administrator || reader.agents.includes(section);
}

// The people tab's key, and the permissions tab's, where a person's sections moved from their pane on the people tab.
const PEOPLE_TAB = "people";
const PERMISSIONS_TAB = "permissions";

export const ORGANIZATION_TABS: readonly OrganizationTab[] = [
  { value: "organization", label: "organization.label.chart", group: "organization", icon: "i-material-symbols-account-tree-outline", opens: administratorOpens, keys: [], wide: false, load: () => import("~/components/OrganizationUnits.vue") },
  { value: PEOPLE_TAB, label: "roster.label.tab", group: "organization", icon: "i-material-symbols-group-outline", opens: rosterReaderOpens, keys: ["q", "kind", "role", "state", "user", PERSON_PANE_KEY], wide: true, load: () => import("~/components/OrganizationPeople.vue") },
  { value: "catalogue", label: "catalogue.label.tab", group: "organization", icon: "i-material-symbols-category-outline", opens: rosterReaderOpens, keys: [], wide: false, load: () => import("~/components/OrganizationCatalogue.vue") },
  // What it sets is a link made into a unit of the organisation chosen and the asks to share a machine into that
  // company, so it declares no view of a link of the chain and stands at an organisation node alone.
  { value: "invites", label: "settings.label.invites", group: "organization", icon: "i-material-symbols-person-add-outline", opens: everyReaderOpens, keys: [], wide: false, load: () => import("~/components/OrganizationInvites.vue") },
  { value: "agents", label: "org_agents.label.tab", group: "settings", icon: "i-material-symbols-smart-toy-outline", opens: headReaderOpens, keys: [], wide: false, load: () => import("~/components/OrganizationAgents.vue"), links: { platform: () => import("~/components/OrganizationPlatformAgents.vue"), me: () => import("~/components/OrganizationPersonAgents.vue") } },
  {
    value: "supervisors", group: "status",
    label: agentWord("supervisors"),
    icon: agentIcon("supervisors"),
    opens: agentRowsOpens("supervisors"),
    keys: [],
    wide: true,
    load: () => import("~/components/AgentsSupervisors.vue"),
    links: { platform: () => import("~/components/AgentsSupervisors.vue"), me: () => import("~/components/AgentsSupervisors.vue") },
    opensLink: agentRowsLinkOpens("supervisors")
  },
  { value: "roles", group: "status", label: agentWord("roles"), icon: agentIcon("roles"), opens: platformNodeOnlyOpens, keys: [], wide: true, load: () => import("~/components/AgentsRoles.vue"), links: { platform: () => import("~/components/AgentsRoles.vue") } },
  {
    value: "repositories", group: "status",
    label: agentWord("repositories"),
    icon: agentIcon("repositories"),
    opens: agentRowsOpens("repositories"),
    keys: [],
    wide: true,
    load: () => import("~/components/AgentsRepositories.vue"),
    links: { platform: () => import("~/components/AgentsRepositories.vue"), me: () => import("~/components/AgentsRepositories.vue") },
    opensLink: agentRowsLinkOpens("repositories")
  },
  {
    value: "models", group: "status",
    label: agentWord("models"),
    icon: agentIcon("models"),
    opens: agentRowsOpens("models"),
    keys: [],
    wide: true,
    load: () => import("~/components/AgentsRegistry.vue"),
    links: { platform: () => import("~/components/AgentsRegistry.vue"), me: () => import("~/components/AgentsRegistry.vue") },
    opensLink: agentRowsLinkOpens("models")
  },
  { value: "model-files", group: "status", label: agentWord("model-files"), icon: agentIcon("model-files"), opens: platformNodeOnlyOpens, keys: [], wide: true, load: () => import("~/components/AgentsCatalogue.vue"), links: { platform: () => import("~/components/AgentsCatalogue.vue") } },
  { value: "apps", label: "apps.label.tab", group: "status", icon: "i-material-symbols-apps", opens: everyReaderOpens, keys: [], wide: false, load: () => import("~/components/OrganizationApps.vue"), links: { platform: () => import("~/components/OrganizationPlatformApps.vue"), me: () => import("~/components/OrganizationPersonApps.vue") } },
  { value: "storage", label: "org_storage.label.tab", group: "settings", icon: "i-material-symbols-hard-drive-outline", opens: headReaderOpens, keys: [], wide: false, load: () => import("~/components/OrganizationArtifactStorage.vue") },
  { value: "mail-servers", label: "org_mail.label.tab", group: "settings", icon: "i-material-symbols-mail-outline", opens: headReaderOpens, keys: [], wide: false, load: () => import("~/components/OrganizationMailServers.vue"), links: { platform: () => import("~/components/OrganizationPlatformMailServers.vue") } },
  // The platform's system mail, beside the servers it sends through. Its own content and its platform view are the
  // one component, since the tab stands nowhere else.
  { value: "mail", label: "security.label.mail_tab", group: "settings", icon: "i-material-symbols-outgoing-mail", opens: platformNodeOnlyOpens, keys: [], wide: false, load: () => import("~/components/OrganizationSystemMail.vue"), links: { platform: () => import("~/components/OrganizationSystemMail.vue") } },
  { value: "secrets", label: "settings.label.secrets", group: "status", icon: "i-material-symbols-key-outline", opens: headReaderOpens, keys: [], wide: false, load: () => import("~/components/OrganizationSecrets.vue"), links: { platform: () => import("~/components/OrganizationPlatformSecrets.vue"), me: () => import("~/components/OrganizationPersonSecrets.vue") } },
  // The secret kinds every person's secret form asks in, beside the secrets themselves.
  { value: "secret-kinds", label: "secrets.label.kinds", group: "settings", icon: "i-material-symbols-key-vertical-outline", opens: platformNodeOnlyOpens, keys: [], wide: false, load: () => import("~/components/OrganizationSecretKinds.vue"), links: { platform: () => import("~/components/OrganizationSecretKinds.vue") } },
  { value: "memory", label: "org_memory.label.tab", group: "status", icon: "i-material-symbols-psychology-outline", opens: memoryReaderOpens, keys: [], wide: false, load: () => import("~/components/OrganizationMemory.vue"), links: { platform: () => import("~/components/OrganizationPlatformMemory.vue") } },
  { value: PERMISSIONS_TAB, label: "settings.label.permissions", group: "access", icon: "i-material-symbols-admin-panel-settings-outline", opens: headReaderOpens, keys: ["user"], wide: false, load: () => import("~/components/OrganizationPermissions.vue") },
  // The supply tab stands for a reader who holds any part of the organisation's supply — its policy and credits, or
  // its plan alone — the administrator everywhere (docs/web.md, 「System and organisation」, the supply tab).
  { value: "supply", label: "supply.label.tab", group: "status", icon: "i-material-symbols-bolt-outline", opens: supplyReaderOpens, keys: [], wide: false, load: () => import("~/components/OrganizationSupplyTab.vue"), links: { platform: () => import("~/components/OrganizationPlatformSupply.vue"), me: () => import("~/components/OrganizationPersonSupply.vue") } },
  // The providers every run goes out on, beside the supply they carry.
  { value: "providers", label: "settings.label.providers", group: "settings", icon: "i-material-symbols-hub-outline", opens: platformNodeOnlyOpens, keys: [], wide: false, load: () => import("~/components/OrganizationProviders.vue"), links: { platform: () => import("~/components/OrganizationProviders.vue") } },
  // Whether the people under a node must hold a second factor: its heads and the administrator, and the platform's own
  // link for the administrator (docs/web.md, 「System and organisation」, the security tab).
  { value: "security", label: "security.label.security_tab", group: "access", icon: "i-material-symbols-shield-lock-outline", opens: headReaderOpens, keys: [], wide: false, load: () => import("~/components/OrganizationSecurity.vue"), links: { platform: () => import("~/components/OrganizationPlatformSecurity.vue") } }
];

// Where a section that once stood here as a tab stands now, by the key its tab had, so a link made before it moved
// still lands on it: the research supervisor with the research unit's settings, and the voice briefing in the
// settings dialog over this screen. `carries` names the
// keys of the old address the new one keeps, such as the person it was open at.
const MOVED_AWAY: Readonly<Record<string, { path: string; query: LocationQuery; carries?: readonly string[] }>> = {
  // A company's BMO default, and an address still naming the reader's own agents `agent` or `own-agents`, stand on the
  // agents tab, and the plans on the supply tab.
  agent: { path: ORGANIZATION_PATH, query: { tab: "agents" }, carries: [ORGANIZATION_KEY, UNIT_KEY] },
  "own-agents": { path: ORGANIZATION_PATH, query: { tab: "agents" }, carries: [ORGANIZATION_KEY, UNIT_KEY] },
  plans: { path: ORGANIZATION_PATH, query: { tab: "supply" }, carries: [ORGANIZATION_KEY, UNIT_KEY] },
  research: { path: "/research", query: { tab: "settings" } },
  briefing: { path: ORGANIZATION_PATH, query: { [SETTINGS_QUERY]: "briefing" } }
};

// A person's pane that moved off the people tab, by its key: their sections, now the permissions tab's with the person
// open, the organisation kept.
const MOVED_PANES: Readonly<Record<string, string>> = { permissions: PERMISSIONS_TAB };

/** Where the `/agents` address lands: the platform node's own link, with the agent tab its `tab=` key names
 * where it names one of the five and no tab where it names none (docs/web.md, 「System and organisation」,
 * 「Agent management screen」). */
export function agentsLanding(query: LocationQuery = {}): { path: string; query: LocationQuery } {
  const asked = Array.isArray(query.tab) ? query.tab[0] : query.tab;
  const tab = AGENT_TABS.find((one) => one.value === asked);

  return { path: ORGANIZATION_PATH, query: { [ORGANIZATION_KEY]: PLATFORM_NODE, ...(tab === undefined ? {} : { tab: tab.value }) } };
}

/** The address a key of a tab that moved away from this screen now leads to, where it names one, read off the address it was asked on. */
export function organizationMovedAway(key: unknown, query: LocationQuery = {}): { path: string; query: LocationQuery } | null {
  const pane = query[PERSON_PANE_KEY];

  if (key === PEOPLE_TAB && typeof pane === "string" && Object.hasOwn(MOVED_PANES, pane)) {
    const carried = Object.fromEntries(["user", ORGANIZATION_KEY].flatMap((one) => (query[one] === undefined ? [] : [[one, query[one]]])));

    return { path: ORGANIZATION_PATH, query: { ...carried, tab: MOVED_PANES[pane]! } };
  }

  if (typeof key !== "string" || !Object.hasOwn(MOVED_AWAY, key)) return null;

  const { path, query: lands, carries = [] } = MOVED_AWAY[key]!;
  const carried = Object.fromEntries(carries.flatMap((one) => (query[one] === undefined ? [] : [[one, query[one]]])));

  return { path, query: { ...carried, ...lands } };
}

// Whether a tab stands in the row of the node chosen: at a company or a unit of one, by the reader's own say; at a
// link of the chain, only where the tab declares its view of that link, which is what the node can show at all. A tab
// holding no view of a link is not offered there, so no node falls back to saying it has nothing to set.
function opensAt(tab: OrganizationTab, reader: OrganizationReader, link: LinkNode | null): boolean {
  return link === null ? tab.opens(reader) : tab.links?.[link] !== undefined && (tab.opensLink?.(reader, link) ?? true);
}

/** The tabs a reader opens at the node chosen: each reader's own say at a company or a unit of one, the views the tab
 * declares of that link at a link of the chain. */
export function organizationTabsFor(reader: OrganizationReader, link: LinkNode | null = null): OrganizationTab[] {
  return ORGANIZATION_TABS.filter((tab) => opensAt(tab, reader, link));
}

/**
 * The tabs the row holds: those the reader opens, and while who reads is still read, the one the address names as
 * well, so the tab asked for stands chosen from the server's picture on. A link node's row is its declared views
 * alone, which no unread reader widens: a tab with no view there is never offered, nor chosen.
 */
export function organizationRowTabs(reader: OrganizationReader, asked: unknown, link: LinkNode | null = null): OrganizationTab[] {
  return ORGANIZATION_TABS.filter((tab) => opensAt(tab, reader, link) || (link === null && !reader.known && tab.value === asked));
}

// Where a node arrives with no tab named: an organisation on the screen's own tab, the chart, and a link of the chain
// on the first tab holding a view of it, since a link holds no chart of its own.
function arrivalTab(tabs: readonly OrganizationTab[], link: LinkNode | null): string | undefined {
  return link === null ? ORGANIZATION_TABS[0]?.value : tabs[0]?.value;
}

/**
 * The tab drawn for the tab an address asks for, the node's own arrival tab where it names none: that tab where the
 * reader opens it, else the first they open once who reads is known. None while who reads is still read and the tab is
 * not yet known to stand for them, so the server's picture never holds a tab the browser then takes away.
 */
export function organizationTabOf(asked: unknown, reader: OrganizationReader, link: LinkNode | null = null): OrganizationTab | null {
  const tabs = organizationTabsFor(reader, link);
  const named = tabs.find((tab) => tab.value === (asked ?? arrivalTab(tabs, link)));

  // A link node's row stands whatever the reader rights turn out to be, so an address naming a tab it does not hold
  // is answered on the spot rather than waiting for the reads to say who reads.
  if (named === undefined && link !== null) return tabs[0] ?? null;

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
 * The address of one node chosen in the tree, a company or a unit of it: the tab open stays; where the company
 * changes, what that tab held of the company before — its words, its filters, the person open — goes, the person's
 * tab kept for the person opened next; where it stays, the tab keeps all it held. Every other key of the address
 * stays, and the unit stands beside its company, or goes where the company itself is chosen.
 */
export function organizationNodeAddress(company: number, unit: number | null, query: LocationQuery = {}): { path: string; query: LocationQuery } {
  const same = query[ORGANIZATION_KEY] === String(company);
  const rest = Object.fromEntries(Object.entries(query).filter(([key]) => key !== UNIT_KEY && (same || key === PERSON_PANE_KEY || !TAB_KEYS.has(key))));

  return { path: ORGANIZATION_PATH, query: { ...rest, [ORGANIZATION_KEY]: String(company), ...(unit === null ? {} : { [UNIT_KEY]: String(unit) }) } };
}

/**
 * The address of a link node chosen in the tree: the tab open stays, what it held of the company before goes, and the
 * unit with it; `tab` names the tab to open instead, as a door to one tab's settings at that link does.
 */
export function organizationLinkAddress(node: LinkNode, query: LocationQuery = {}, tab?: string): { path: string; query: LocationQuery } {
  const rest = Object.fromEntries(Object.entries(query).filter(([key]) => key !== UNIT_KEY && !TAB_KEYS.has(key) && (tab === undefined || key !== "tab")));
  const open: LocationQuery = tab === undefined || tab === ORGANIZATION_TABS[0]!.value ? {} : { tab };

  return { path: ORGANIZATION_PATH, query: { ...rest, [ORGANIZATION_KEY]: node, ...open } };
}

/** Who the link nodes stand for: the platform for the administrator, and the reader's own link for a reader with a
 * user of the account service. */
export interface LinkReach {
  administrator: boolean;
  user: boolean;
}

/** The link nodes a reader's tree holds, in the tree's order: their own first, then the platform. */
export function linkNodesFor(reach: LinkReach): LinkNode[] {
  return [...(reach.user ? [PERSON_NODE] : []), ...(reach.administrator ? [PLATFORM_NODE] : [])] as LinkNode[];
}

/** The link node an address chooses, where it names one the reader's tree holds. */
export function linkChosen(query: LocationQuery, reach: LinkReach): LinkNode | null {
  return linkNodesFor(reach).find((node) => node === query[ORGANIZATION_KEY]) ?? null;
}

/** What each link node of the tree is called and marked by. */
export const LINK_NODES: Readonly<Record<LinkNode, { icon: string; label: string }>> = {
  me: { icon: "i-material-symbols-person-outline", label: "organization.label.person" },
  platform: { icon: "i-material-symbols-public", label: "organization.label.platform" }
};

/** The unit a tab of the screen stands for: the one the tree chooses, `?unit=` beside its company, else the company
 * itself. */
export function useChosenUnit(company: () => number): ComputedRef<number> {
  const route = useRoute();

  return computed(() => {
    const chosen = Number(route.query[UNIT_KEY]);

    return Number.isInteger(chosen) && chosen > 0 ? chosen : company();
  });
}

/** A link node of the tree, named in the reader's words. */
export function linkNode(node: LinkNode, t: (key: string) => string): SideNode {
  return { key: node, label: t(LINK_NODES[node].label), icon: LINK_NODES[node].icon };
}

/** A unit of the organisation tree: where it stands, the company it stands in, and the kind it carries in its
 * company's words, where it carries one. */
export interface TreeUnit extends UnitPlace {
  company: number;
  kind?: string;
}

// The tree's mark of a company, a building. Only the top level carries a mark: every node under a company is a unit,
// told apart by its indentation and its branch's chevron alone.
const COMPANY_ICON = "i-material-symbols-domain";

/**
 * The organisation tree (docs/web.md, 「System and organisation」): each company the reader may set at the top level, in its
 * order, and under it the units given of that company, each under its parent where the parent is among them and
 * under the company otherwise, keyed by their numbers. A unit given that is a company itself stands as that company.
 */
export function organizationNodes(companies: readonly Organization[], units: readonly TreeUnit[]): SideNode[] {
  const nodeOf = (branch: UnitBranch<TreeUnit>): SideNode => ({
    key: branch.unit.id,
    label: branch.unit.name,
    ...(branch.unit.kind ? { badge: branch.unit.kind } : {}),
    ...(branch.children.length === 0 ? {} : { children: branch.children.map(nodeOf) })
  });

  return companies.map((company) => {
    const own = units.find((unit) => unit.id === company.id);
    const under = units.filter((unit) => unit.company === company.id && unit.id !== company.id).map((unit) => (unit.parent === company.id ? { ...unit, parent: null } : unit));
    const children = unitBranches(under).map(nodeOf);

    return { key: company.id, label: company.name, icon: COMPANY_ICON, ...(own?.kind ? { badge: own.kind } : {}), ...(children.length === 0 ? {} : { children }) };
  });
}

/** Every unit as the administrator's tree holds it, each with its company and its kind. */
export function administratorTreeUnits(units: readonly (UnitPlace & { kind?: { name: string } | null })[]): TreeUnit[] {
  return units.map((unit) => ({ id: unit.id, name: unit.name, parent: unit.parent ?? null, company: unitPath(units, unit.id)[0]?.id ?? unit.id, ...(unit.kind ? { kind: unit.kind.name } : {}) }));
}

/** The units a member's tree holds: those they may invite into and those whose org memory they write, each once. */
export function memberTreeUnits(inviteUnits: readonly InviteUnit[], memoryUnits: readonly OrgMemoryUnitView[]): TreeUnit[] {
  const all = new Map<number, TreeUnit>();

  for (const unit of [...inviteUnits, ...memoryUnits]) if (!all.has(unit.id)) all.set(unit.id, { id: unit.id, name: unit.name, parent: unit.parent ?? null, company: unit.company.id });

  return [...all.values()];
}

/** The company a node of the tree stands in, itself for a company; none for a number the tree does not hold. */
export function companyOfNode(companies: readonly Organization[], units: readonly TreeUnit[], node: number): number | null {
  if (companies.some((company) => company.id === node)) return node;

  return units.find((unit) => unit.id === node)?.company ?? null;
}

/** People and the like carried by the pointer onto a unit of the organisation tree, as the open tab takes them: the
 * kinds of data it takes, whether a unit takes them, and what their drop on a unit does. */
export interface TreeDrop {
  types: readonly string[];
  takes: (unit: number) => boolean;
  onto: (unit: number, event: DragEvent) => void;
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
 * and those the roster, the supply reach and the org memory read answer them (docs/web.md, 「System and organisation」). They stand in the tree's order
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

// A reader who holds every part of the screen, for asking which tabs stand by their own say at any node: a tab not
// open to even this reader stands only where a link node's row takes it in.
const EVERY_REACH: OrganizationReader = { administrator: true, roster: true, supply: true, plans: true, memory: true, heads: true, agents: AGENT_SECTIONS, known: true };

/** The tab that stands at the platform link node alone, where a key names one: an address may name it without naming
 * a node, and the node then comes from here (docs/web.md, 「System and organisation」). */
export function platformOnlyTab(asked: unknown): OrganizationTab | null {
  return ORGANIZATION_TABS.find((tab) => tab.value === asked && !tab.opens(EVERY_REACH) && tab.links?.platform !== undefined) ?? null;
}

// The old administrator screen's address is this screen's platform node now, by the tab each key it held opens
// there; a key naming none of them opens the providers tab, the first tab of that old screen (docs/web.md,
// 「System and organisation」).
const ADMIN_LANDINGS: Readonly<Record<string, string>> = { providers: "providers", "secret-kinds": "secret-kinds", mail: "mail", apps: "apps", plans: "supply", credits: "supply" };

/** The address an old `/admin` address lands on: the platform node named, with the tab its `?tab=` key held. */
export function adminLanding(query: LocationQuery): { path: string; query: LocationQuery } {
  const asked = Array.isArray(query.tab) ? query.tab[0] : query.tab;
  const tab = typeof asked === "string" && Object.hasOwn(ADMIN_LANDINGS, asked) ? ADMIN_LANDINGS[asked]! : "providers";

  return organizationLinkAddress(PLATFORM_NODE, {}, tab);
}

/**
 * The units the reader heads, as the account service answers them: the units they may invite into
 * (docs/accounts.md, 「Invitations and a person's machine」), each with its company. One read shared by the shell, the
 * screen and the invitations tab; a read that failed holds none.
 */
export function useHeadedUnits(): { units: ComputedRef<InviteUnit[]>; status: Ref<string> } {
  const { data, status } = useFetch<InviteUnit[]>("/api/invites/units", { key: "invite-units", lazy: true, server: false, default: () => [] });

  return { units: computed(() => (status.value === "error" ? [] : (data.value ?? []))), status };
}

/**
 * The units whose org memory the reader writes, as the account service answers them, and whether that read has
 * answered, in either direction (docs/web.md, 「System and organisation」, the org memory tab). One read shared by the shell, the
 * screen and the tab; the units last answered stand while it is asked again, as the tab asks it when it opens, so the
 * tab is never taken away from the reader for the length of that read. A read that failed holds none.
 */
export function useOrgMemoryUnits(): { units: ComputedRef<OrgMemoryUnitView[]>; status: Ref<string>; failed: ComputedRef<boolean>; refresh: () => Promise<void> } {
  const { data, status, refresh } = useFetch<OrgMemoryUnitView[]>("/api/organization/memory/units", { key: "org-memory-units", lazy: true, server: false, default: () => [] });

  return {
    units: computed(() => (status.value === "error" ? [] : (data.value ?? []))),
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
  const headed = useHeadedUnits();
  const sections = useSectionAccess();
  const sectionsReady = useSectionAccessReady();
  const rosterAnswered = useAnswered(status);
  const memoryAnswered = useAnswered(memory.status);
  const headsAnswered = useAnswered(headed.status);
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
    heads: covers(headed.units.value.map((one) => one.company)),
    agents: administrator.value ? AGENT_SECTIONS : sectionsReady.value ? agentSectionsRead(sections.value) : [],
    known: administrator.value || (rosterAnswered.value && supply.value.known && memoryAnswered.value && headsAnswered.value && sectionsReady.value)
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
  // The units the tree holds under those companies, read with them; null until they answer.
  units: ComputedRef<TreeUnit[] | null>;
  // Why the read failed, empty while it has not.
  failure: ComputedRef<string>;
  // The company a unit stands in, where the reads hold it: an old link naming a unit lands in its organisation.
  companyOf: (unit: number) => number | null;
  reading: ComputedRef<boolean>;
  refresh: () => Promise<void>;
}

/**
 * The organisations the screen lists (docs/web.md, 「System and organisation」): every company for the administrator, read off
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
  const treeUnits = computed<TreeUnit[] | null>(() => {
    if (list.value === null) return null;
    if (administrator.value) return administratorTreeUnits(units.data.value ?? []);

    return memberTreeUnits(invites.status.value === "success" ? (invites.data.value ?? []) : [], memory.units.value);
  });

  function companyOf(unit: number): number | null {
    if (administrator.value) return unitPath(units.data.value ?? [], unit)[0]?.id ?? null;

    return [...(invites.data.value ?? []), ...memory.units.value].find((one) => one.id === unit)?.company.id ?? null;
  }

  return {
    list,
    units: treeUnits,
    failure,
    companyOf,
    reading: computed(() => units.status.value === "pending"),
    refresh: async () => {
      if (administrator.value) await units.refresh();
    }
  };
}

// The units tab's tree (docs/web.md, 「System and organisation」, its chart): companies at its top, each unit under its
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

// A move of several people into one unit (docs/web.md, 「System and organisation」, its chart): what the act will write,
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
