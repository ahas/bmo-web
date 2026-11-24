import type { RosterDetail, RosterPerson } from "#shared/roster";
import type { Component } from "vue";
import type { LocationQuery, LocationQueryRaw } from "vue-router";

// One person on the organisation screen's people tab (docs/web.md, 「Organisation」, the people tab): a head over a row
// of tabs, one tab a part of what is the person's. Each tab is a component of its own; this is only the order they
// stand in, what each is called, who may open it and how the address carries the one open.

/** The address's key for the person's tab open; the first tab is the person's own address. */
export const PERSON_PANE_KEY = "pane";

/** Who reads the person, as far as which tabs stand for them. */
export interface PersonPaneReader {
  administrator: boolean;
  // Whether the reader may open the person's supply tab: the administrator, or whoever the account service says
  // manages supply for the unit this person stands in (docs/web.md, 「Organisation」, the people tab).
  supply?: boolean;
}

/** What every tab is handed: the person, and the one read of them the head stands on, which some tabs show. */
export interface PersonPaneProps {
  user: string;
  person: RosterDetail | null;
  // Why the read of the person failed, empty while it has not.
  failure: string;
  // Whether the person is being read again after a failure.
  reading: boolean;
  // Whether the person is a platform administrator, as soon as the screen knows it: from the list row they were opened
  // from, else from their read; null until either has said.
  administrator: boolean | null;
}

export interface PersonPane {
  // Its key in the address, `pane=<value>`.
  value: string;
  // Its name in the language pack.
  label: string;
  // Whether a reader opens it: each tab says so for itself.
  opens: (reader: PersonPaneReader) => boolean;
  // The tab's own component, loaded when it is first opened.
  load: () => Promise<{ default: Component }>;
}

function everyReaderOpens(): boolean {
  return true;
}

// The parts only the administrator reads: a person's rooms, agents, sessions and runs, which quote what they said in
// their own rooms (docs/web.md, 「Access」).
function administratorOpens(reader: PersonPaneReader): boolean {
  return reader.administrator;
}

// The supply tab stands for the administrator and for a reader who manages supply for the unit the person stands
// in; the screen holds it where that reader's own read says so (docs/web.md, 「Organisation」, the people tab).
function supplyReaderOpens(reader: PersonPaneReader): boolean {
  return reader.administrator || reader.supply === true;
}

export const PERSON_PANES: readonly PersonPane[] = [
  { value: "account", label: "settings.label.account", opens: everyReaderOpens, load: () => import("~/components/PersonAccount.vue") },
  { value: "organization", label: "people.label.organization", opens: everyReaderOpens, load: () => import("~/components/PersonOrganization.vue") },
  { value: "bmo", label: "settings.label.bmo", opens: everyReaderOpens, load: () => import("~/components/PersonBmo.vue") },
  { value: "supply", label: "supply.label.tab", opens: supplyReaderOpens, load: () => import("~/components/PersonSupply.vue") },
  { value: "activity", label: "roster.label.activity", opens: administratorOpens, load: () => import("~/components/PersonActivity.vue") }
];

/** The tabs a reader opens, each by its own say. */
export function personPanesFor(reader: PersonPaneReader): PersonPane[] {
  return PERSON_PANES.filter((pane) => pane.opens(reader));
}

function asked(query: LocationQuery): string | null {
  const value = query[PERSON_PANE_KEY];
  const one = Array.isArray(value) ? value[0] : value;

  return typeof one === "string" ? one : null;
}

/** The tab an address opens among those a reader opens, the first of them where it names none they may. */
export function personPaneOf(query: LocationQuery, panes: readonly PersonPane[]): PersonPane {
  const value = asked(query);

  return panes.find((pane) => pane.value === value) ?? panes[0] ?? PERSON_PANES[0]!;
}

/** Whether the address names a tab the reader may not open, which is taken off it. */
export function personPaneRefused(query: LocationQuery, panes: readonly PersonPane[]): boolean {
  const value = asked(query);

  return value !== null && !panes.some((pane) => pane.value === value);
}

/** Whether the person is a platform administrator, from their read where it stands, else from the list row. */
export function personAdministrator(person: Pick<RosterPerson, "administrator"> | null, listed: Pick<RosterPerson, "administrator"> | null): boolean | null {
  return person?.administrator ?? listed?.administrator ?? null;
}

/** Where the console's server answers what is the person's, each part under it. */
export function personBase(user: string): string {
  return `/api/organization/people/${encodeURIComponent(user)}`;
}

/** The address with one tab of the person open: the first is the person's own address, every other key stays. */
export function withPersonPane(query: LocationQuery, value: string): LocationQueryRaw {
  const { [PERSON_PANE_KEY]: _open, ...rest } = query;

  return value === PERSON_PANES[0]!.value ? rest : { ...rest, [PERSON_PANE_KEY]: value };
}
