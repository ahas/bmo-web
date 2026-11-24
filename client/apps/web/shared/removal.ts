// The platform administrator's permanent delete as the console's screens and its script read it (docs/web.md,
// the organisation screen's permanent delete; docs/accounts.md, 「Deleting an account for good」, 「Deleting a unit or a company」): what a removal
// would take, unit by unit, and what it took. Each unit answers the kinds of record it keeps by their keys; a kind is
// said in the pack's word for it where one stands, and every other kind is summed as one line of other records, so a
// unit's new kind needs a word added here and in the packs, and nothing else.

import type { Translate } from "./wording";

/** Each kind of record and how many. */
export type RemovalCounts = Record<string, number>;

/** How one unit answered a count: counted, its address not set, or not read. */
export type UnitCountState = "counted" | "unset" | "failed";

/** One unit's count, by the unit's name. */
export interface RemovalUnitCount {
  unit: string;
  state: UnitCountState;
  counts: RemovalCounts;
}

/** Why a unit's step did not go through: its status, none where it did not answer, and its refusal's code. */
export interface RemovalFailure {
  status: number | null;
  code: string | null;
}

/** How one unit's step of a removal ended: removed, passed over as its address is not set, failed, or not reached. */
export type RemovalStepState = "removed" | "skipped" | "failed" | "pending";

export interface RemovalStep {
  unit: string;
  state: RemovalStepState;
  removed: RemovalCounts;
  failure: RemovalFailure | null;
}

/** What removing an account would take now. */
export interface AccountRemovalView {
  user: string;
  // The name the person is shown by, their login where none stands, which the confirmation is typed as.
  name: string;
  login: string;
  left: boolean;
  // The code the removal would be refused with now, or null.
  refusal: string | null;
  units: RemovalUnitCount[];
}

/** A person standing in a unit a removal would take. */
export interface RemovalPersonView {
  user: string;
  name: string;
  left: boolean;
  administrator: boolean;
}

/** What removing a unit and every unit under it would take now. */
export interface UnitRemovalView {
  unit: number;
  name: string;
  company: number;
  units: { id: number; name: string }[];
  people: RemovalPersonView[];
  refusal: string | null;
  counted: RemovalUnitCount[];
}

/** One person's account removed as a unit's removal goes. */
export interface PersonRemovalView {
  user: string;
  name: string;
  finished: boolean;
  steps: RemovalStep[];
}

/** What a removal did: whether it finished, whether it had finished before, the refusal that stopped it before any
 * unit was asked, each unit's step, and for a unit the people removed first. */
export interface RemovalOutcome {
  finished: boolean;
  already: boolean;
  refusal: string | null;
  steps: RemovalStep[];
  people: PersonRemovalView[];
}

/** What a removal is asked with: the name typed, and for a person whether to mark them left first, for a unit
 * whether to remove its people first. */
export interface RemovalAsk {
  confirm: string;
  leave?: boolean;
  withPeople?: boolean;
}

/** The name this service keeps its own result under, beside the content units'. */
export const OWN_UNIT = "web";

// The kinds the packs hold a word for, by the units' keys, each with its word's key.
const KIND_WORDS: Readonly<Record<string, string>> = {
  "users": "removal.label.kind.users",
  "sessions": "removal.label.kind.sessions",
  "remembered-devices": "removal.label.kind.remembered_devices",
  "second-factors": "removal.label.kind.second_factors",
  "recovery-codes": "removal.label.kind.recovery_codes",
  "account-links": "removal.label.kind.account_links",
  "email-checks": "removal.label.kind.email_checks",
  "senders": "removal.label.kind.senders",
  "grants": "removal.label.kind.grants",
  "roles": "removal.label.kind.roles",
  "posts": "removal.label.kind.posts",
  "appointments": "removal.label.kind.appointments",
  "history": "removal.label.kind.history",
  "invitations": "removal.label.kind.invitations",
  "profiles": "removal.label.kind.profiles",
  "own-agents": "removal.label.kind.own_agents",
  "console-settings": "removal.label.kind.console_settings",
  "sign-ins": "removal.label.kind.sign_ins",
  "supply": "removal.label.kind.supply",
  "memberships": "removal.label.kind.memberships",
  "chain-settings": "removal.label.kind.chain_settings",
  "departures": "removal.label.kind.departures",
  "machines": "removal.label.kind.machines",
  "keys": "removal.label.kind.keys",
  "access-records": "removal.label.kind.access_records",
  "secrets": "removal.label.kind.secrets",
  "units": "removal.label.kind.units",
  "unit-attributes": "removal.label.kind.unit_attributes",
  "unit-kinds": "removal.label.kind.unit_kinds",
  "company-agents": "removal.label.kind.company_agents",
  "supervisors": "removal.label.kind.supervisors",
  "role-agents": "removal.label.kind.role_agents",
  "repositories": "removal.label.kind.repositories",
  "items": "removal.label.kind.items",
  "jobs": "removal.label.kind.jobs",
  "rooms": "removal.label.kind.rooms",
  "private-rooms": "removal.label.kind.private_rooms",
  "identities": "removal.label.kind.identities",
  "names": "removal.label.kind.names",
  "mutes": "removal.label.kind.mutes",
  "memberships-in-rooms": "removal.label.kind.memberships_in_rooms",
  "messages": "removal.label.kind.messages",
  "files": "removal.label.kind.files",
  "folders": "removal.label.kind.folders",
  "documents": "removal.label.kind.documents",
  "brains": "removal.label.kind.brains",
  "memories": "removal.label.kind.memories",
  "notes": "removal.label.kind.notes",
  "member-shares": "removal.label.kind.member_shares",
  "bookmarks": "removal.label.kind.bookmarks",
  "opened": "removal.label.kind.opened",
  "imports": "removal.label.kind.imports",
  "reads": "removal.label.kind.reads",
  "unit-shares": "removal.label.kind.unit_shares",
  "slot-requests": "removal.label.kind.slot_requests",
  "attachments": "removal.label.kind.attachments",
  "mcp-servers": "removal.label.kind.mcp_servers",
  "skills": "removal.label.kind.skills",
  "repository-checkouts": "removal.label.kind.repository_checkouts",
  "registered-models": "removal.label.kind.registered_models",
  "claude-accounts": "removal.label.kind.claude_accounts",
  "personal-supply": "removal.label.kind.personal_supply",
  "organisation-supply": "removal.label.kind.organisation_supply",
  "supply-reservations": "removal.label.kind.supply_reservations",
  "call-keys": "removal.label.kind.call_keys",
  "gateway-requests": "removal.label.kind.gateway_requests",
  "person-nodes": "removal.label.kind.person_nodes",
  "workplaces": "removal.label.kind.workplaces",
  "isolation-users": "removal.label.kind.isolation_users",
  "personal-tools": "removal.label.kind.personal_tools",
  "installs": "removal.label.kind.installs",
  "seen-marks": "removal.label.kind.seen_marks",
  "catalogue-apps": "removal.label.kind.catalogue_apps",
  "mails": "removal.label.kind.mails",
  "mailboxes": "removal.label.kind.mailboxes",
  "accounts": "removal.label.kind.accounts",
  "servers": "removal.label.kind.servers",
  "servers-in-use": "removal.label.kind.servers_in_use",
  "calendars": "removal.label.kind.calendars",
  "events": "removal.label.kind.events",
  "schedules": "removal.label.kind.schedules",
  "resources": "removal.label.kind.resources",
  "bookings": "removal.label.kind.bookings",
  "reminders": "removal.label.kind.reminders",
  "watches": "removal.label.kind.watches",
  "calls": "removal.label.kind.calls",
  "pictures": "removal.label.kind.pictures",
  "settings": "removal.label.kind.settings",

};

// The units the packs hold a name for, by their names.
const UNIT_NAMES: Readonly<Record<string, string>> = {
  web: "removal.label.unit.web",
  agency: "removal.label.unit.agency",
  receiver: "removal.label.unit.receiver",
  brain: "removal.label.unit.brain",
  artifact: "removal.label.unit.artifact",
  note: "removal.label.unit.note",
  mail: "removal.label.unit.mail",
  pocket: "removal.label.unit.pocket",
  calendar: "removal.label.unit.calendar",

};

/** Each step's state in the pack's word. */
export const STEP_WORDS: Readonly<Record<RemovalStepState, string>> = {
  removed: "removal.label.removed",
  skipped: "removal.label.skipped",
  failed: "removal.label.failed",
  pending: "removal.label.pending"
};

/** One line of what a unit counted or removed: the words for its kind and how many. */
export interface KindLine {
  label: string;
  count: number;
}

/** A unit's counts as lines: each kind with a word in its own line, every other kind summed as other records last,
 * and a kind of none left out. */
export function kindLines(counts: RemovalCounts, t: Translate): KindLine[] {
  const lines: KindLine[] = [];
  let other = 0;

  for (const [kind, count] of Object.entries(counts)) {
    if (!Number.isFinite(count) || count <= 0) continue;

    const word = Object.hasOwn(KIND_WORDS, kind) ? KIND_WORDS[kind] : undefined;

    if (word === undefined) other += count;
    else lines.push({ label: t(word), count });
  }

  lines.sort((a, b) => a.label.localeCompare(b.label));

  if (other > 0) lines.push({ label: t("removal.label.kind.other"), count: other });

  return lines;
}

/** A unit's name in the pack's words; a unit the pack names not stands by its own name. */
export function unitLabel(unit: string, t: Translate): string {
  const name = Object.hasOwn(UNIT_NAMES, unit) ? UNIT_NAMES[unit] : undefined;

  return name === undefined ? unit : t(name);
}

// Each refusal's sentence, by the code the account service gives it.
const REFUSALS: Readonly<Record<string, string>> = {
  "own-account": "removal.error.own_account",
  "owner-account": "removal.error.owner_account",
  "last-administrator": "removal.error.last_administrator",
  "not-left": "removal.error.not_left",
  "unit-holds-administrator": "removal.error.unit_holds_administrator",
  "unit-holds-people": "removal.error.unit_holds_people"
};

/** A refusal's sentence; a code the pack holds none for is said as a refusal of its own. */
export function refusalSentence(code: string, t: Translate): string {
  const key = REFUSALS[code];

  return key === undefined ? t("removal.error.refused_code", { code }) : t(key);
}

/** Why a unit's step failed, in the pack's words. */
export function failureSentence(failure: RemovalFailure, t: Translate): string {
  if (failure.status === null) return t("removal.error.unit_unreachable");
  const refused = failure.code === null ? undefined : REFUSALS[failure.code];

  if (refused !== undefined) return t(refused);

  return failure.code === null ? t("removal.error.unit_status", { status: failure.status }) : t("removal.error.unit_code", { status: failure.status, code: failure.code });
}
