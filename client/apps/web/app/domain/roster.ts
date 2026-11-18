import { matchFields } from "bmo-ui/shared/search";

import { ROSTER_ROLES, ROSTER_STATES } from "#shared/roster";

import { ORGANIZATION_PATH } from "./organization";

import type { RosterAsk, RosterDetail, RosterPerson, RosterRole, RosterRun, RosterState, RosterUnit } from "#shared/roster";
import type { ComputedRef, Ref } from "vue";
import type { LocationQuery, LocationQueryRaw } from "vue-router";

// The organisation screen's people tab (docs/web.md, 「Organisation」, the people tab; docs/accounts.md, 「The people
// roster」): the view the address carries, the page it asks the roster for, what one person's management menu offers
// the reader, and where a person found by the console search opens.

/** How many people one page of the roster brings. */
export const ROSTER_PAGE = 50;

/** The tab's own key in the address. */
export const ROSTER_TAB = "people";

/** What the list shows, as the address carries it: the words and the five filters. None set shows everyone. */
export interface RosterView {
  q: string;
  company: number | null;
  unit: number | null;
  // A unit kind's key, of the company whose tree the unit filter offers.
  kind: string | null;
  role: RosterRole | null;
  state: RosterState | null;
}

/** The keys of the address the list is read by; the person open is `user`, which reads nothing of the list. */
export const ROSTER_LIST_KEYS = ["q", "company", "unit", "kind", "role", "state"] as const;

function first(value: LocationQuery[string] | undefined): string {
  const one = Array.isArray(value) ? value[0] : value;

  return typeof one === "string" ? one : "";
}

function whole(value: LocationQuery[string] | undefined): number | null {
  const text = first(value);

  return /^[1-9][0-9]*$/.test(text) ? Number(text) : null;
}

/** The view an address names; a key that does not read as its kind is none. */
export function rosterViewOf(query: LocationQuery): RosterView {
  const role = first(query.role);
  const state = first(query.state);

  return {
    q: first(query.q).trim(),
    company: whole(query.company),
    unit: whole(query.unit),
    kind: first(query.kind).trim() || null,
    role: ROSTER_ROLES.find((one) => one === role) ?? null,
    state: ROSTER_STATES.find((one) => one === state) ?? null
  };
}

/** The person an address opens, where it names one. */
export function rosterUserOf(query: LocationQuery): string | null {
  const user = first(query.user);

  return /^[1-9][0-9]*$/.test(user) ? user : null;
}

/** The view as the address carries it: every key set, and none of those left unset. */
export function rosterQueryOf(view: RosterView): LocationQueryRaw {
  return {
    ...(view.q === "" ? {} : { q: view.q }),
    ...(view.company === null ? {} : { company: String(view.company) }),
    ...(view.unit === null ? {} : { unit: String(view.unit) }),
    ...(view.kind === null ? {} : { kind: view.kind }),
    ...(view.role === null ? {} : { role: view.role }),
    ...(view.state === null ? {} : { state: view.state })
  };
}

/** The address with the view laid over it: the list's keys as the view sets them, every other key as it stood. */
export function withRosterView(query: LocationQuery, view: RosterView): LocationQueryRaw {
  const rest = Object.fromEntries(Object.entries(query).filter(([key]) => !(ROSTER_LIST_KEYS as readonly string[]).includes(key)));

  return { ...rest, ...rosterQueryOf(view) };
}

/** One page of the roster as the view asks it, after the place a page before it ended. */
export function rosterAsk(view: RosterView, after: string | null = null): RosterAsk {
  return {
    ...(view.q === "" ? {} : { q: view.q }),
    ...(view.company === null ? {} : { company: view.company }),
    ...(view.unit === null ? {} : { unit: view.unit }),
    ...(view.kind === null ? {} : { kind: view.kind }),
    ...(view.role === null ? {} : { role: view.role }),
    ...(view.state === null ? {} : { state: view.state }),
    ...(after === null ? {} : { after }),
    limit: ROSTER_PAGE
  };
}

/** One key the list is read by, so the list is read again only as the words or a filter change. */
export function rosterListKey(view: RosterView): string {
  return JSON.stringify([view.q, view.company, view.unit, view.kind, view.role, view.state]);
}

/** How many of the five filters are set, which the narrow screen's filter button carries. */
export function rosterFiltersSet(view: RosterView): number {
  return [view.company, view.unit, view.kind, view.role, view.state].filter((one) => one !== null).length;
}

/** The company whose tree the unit filter offers: the one chosen, or the reader's only company. */
export function rosterTreeCompany(view: RosterView, companies: readonly RosterUnit[]): number | null {
  if (view.company !== null) return view.company;

  return companies.length === 1 ? companies[0]!.id : null;
}

/** The view with one filter changed. A company changed takes the unit and the kind chosen under the one before with it. */
export function withRosterFilter<Key extends keyof Omit<RosterView, "q">>(view: RosterView, key: Key, value: RosterView[Key]): RosterView {
  return key === "company" ? { ...view, company: value as number | null, unit: null, kind: null } : { ...view, [key]: value };
}

/** The pack's word for a state, a state's mark in the list and its colour. */
export const ROSTER_STATE_FACES: Readonly<Record<RosterState, { label: string; icon: string; tone: string; color: "success" | "warning" | "neutral" }>> = {
  active: { label: "roster.status.active", icon: "i-material-symbols-check-circle-outline", tone: "text-success", color: "success" },
  pending: { label: "roster.status.pending", icon: "i-material-symbols-hourglass-top", tone: "text-warning", color: "warning" },
  left: { label: "roster.status.left", icon: "i-material-symbols-person-off-outline", tone: "text-muted", color: "neutral" }
};

/** The pack's word for a role in a unit. */
export const ROSTER_ROLE_LABELS: Readonly<Record<RosterRole, string>> = {
  head: "organization.label.role_head",
  member: "organization.label.role_member"
};

/** A person's role in the unit they stand in. */
export function rosterRoleOf(person: Pick<RosterPerson, "head">): RosterRole {
  return person.head ? "head" : "member";
}

/** One act of a person's management menu. */
export type RosterAct = "move" | "post" | "machine" | "profile" | "bmo" | "leave";

/** Who asks, as far as what the routes behind the acts let them do. */
export interface RosterActor {
  administrator: boolean;
  // The signed-in reader's own account, which keeps its own profile.
  user: string | null;
}

/**
 * The acts the reader may do for one person, in the menu's order (docs/web.md, 「Organisation」, the people tab). The
 * administrator does every one; anyone else only what the console's routes open to them: the BMO permission of the
 * people under a unit they head, marking them left, and their own profile. Nobody marks themselves left. A person who
 * left keeps only their profile, the one record of theirs that still stands for anyone.
 */
export function rosterActs(actor: RosterActor, person: Pick<RosterPerson, "user" | "state">): RosterAct[] {
  const own = actor.user !== null && actor.user === person.user;
  const offered: RosterAct[] = person.state === "left" ? ["profile"] : ["move", "post", "machine", "profile", "bmo", "leave"];
  const may: Record<RosterAct, boolean> = {
    move: actor.administrator,
    // A reader of a person on the roster heads their company or is the administrator, so may give them a post.
    post: true,
    machine: actor.administrator,
    profile: actor.administrator || own,
    bmo: true,
    // So may they mark them left, the company's unit standing above every unit of it.
    leave: !own
  };

  return offered.filter((act) => may[act]);
}

/** The list with one person's row as they now stand, read again after an act; a person not in it leaves it as it is. */
export function withRosterRow(people: readonly RosterPerson[], person: RosterDetail): RosterPerson[] {
  return people.map((one) =>
    one.user === person.user
      ? {
          user: person.user,
          login: person.login,
          name: person.name,
          company: person.company,
          unit: person.unit,
          head: person.head,
          acting: person.acting,
          administrator: person.administrator,
          state: person.state,
          machine: person.machine,
          madeAt: person.madeAt,
          lastSignInAt: person.lastSignInAt,
          jobTitle: person.jobTitle,
          rank: person.rank,
          role: person.role,
          duty: person.duty,
          // The post a row counts through is the list's narrowing, which a person read alone does not carry.
          post: one.post,
          ...(person.email === undefined ? {} : { email: person.email })
        }
      : one
  );
}

/** How a run of a person's agents ended, in the pack's words: still running, ended in one of the outcomes the console
 * has a word for, or ended in another the line names as the agency wrote it. */
export function runEnding(run: Pick<RosterRun, "state" | "outcome">): { key: string; outcome: string | null } {
  if (run.state !== "closed") return { key: "roster.status.run_running", outcome: null };

  if (run.outcome === null) return { key: "roster.status.run_ended", outcome: null };

  return Object.hasOwn(RUN_OUTCOMES, run.outcome) ? { key: RUN_OUTCOMES[run.outcome]!, outcome: null } : { key: "roster.status.run_ended_as", outcome: run.outcome };
}

// The outcomes a run's line says in words.
const RUN_OUTCOMES: Readonly<Record<string, string>> = {
  ok: "roster.status.run_completed",
  completed: "roster.status.run_completed",
  failed: "roster.status.run_failed",
  stopped: "roster.status.run_stopped"
};

/** Where one person opens on the people tab. */
export function rosterAddress(user: string): string {
  return `${ORGANIZATION_PATH}?tab=${ROSTER_TAB}&user=${encodeURIComponent(user)}`;
}

/**
 * The companies the reader looks through on the roster, read once for the screen and kept while it stands; none for a
 * reader who looks through none, and none until the read has answered.
 */
export function useRosterCompanies(): { companies: ComputedRef<RosterUnit[]>; status: Ref<string> } {
  const { data, status } = useFetch<RosterUnit[]>("/api/organization/people/companies", { key: "roster-companies", lazy: true, server: false, default: () => [] });

  return { companies: computed(() => data.value ?? []), status };
}

/**
 * A search hit that landed only in a field a row does not show — the job title, or the email the administrator reads —
 * said as one line under the row (docs/web.md, 「Organisation」, the people tab): its field's name and the words around
 * the hit. None where the row's own words hold the hit, or where nothing is searched.
 */
export function rosterHiddenHit(
  person: RosterPerson,
  q: string,
  shown: readonly string[],
  labels: { jobTitle: string; email: string; rank?: string; duty?: string }
): { label: string; snippet: string } | null {
  const match = matchFields(
    [
      ...shown.map((text) => ({ label: "", text, shown: true })),
      { label: labels.jobTitle, text: person.jobTitle, shown: false },
      { label: labels.rank ?? labels.jobTitle, text: person.rank ?? "", shown: false },
      { label: labels.duty ?? labels.jobTitle, text: person.duty ?? "", shown: false },
      { label: labels.email, text: person.email ?? "", shown: false }
    ],
    q
  );

  return match?.hidden ?? null;
}
