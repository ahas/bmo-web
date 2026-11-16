import type { RoadView } from "./axes";
import type { OwnBmoView, PermissionSetting } from "./bmo-profile";

// The people roster as the organisation screen's people tab reads it (docs/web.md, 「Organisation」, the people tab;
// docs/accounts.md, 「The people roster」): the people of every company the reader looks through, a page at a time,
// and one person opened with what is theirs. The account service decides who looks through what; the groups past a
// person's BMO are the administrator's alone.

/** A company or a unit as the roster names it. */
export interface RosterUnit {
  id: number;
  name: string;
}

/** Where an account stands: in use, made by an invitation and not yet enabled, or marked left. */
export type RosterState = "active" | "pending" | "left";

export const ROSTER_STATES: readonly RosterState[] = ["active", "pending", "left"];

/** Whether a person heads the unit they stand in or stands in it as a member. */
export type RosterRole = "head" | "member";

export const ROSTER_ROLES: readonly RosterRole[] = ["head", "member"];

/** What a page of the roster is asked for; every field absent asks for everyone. */
export interface RosterAsk {
  q?: string;
  company?: number;
  unit?: number;
  role?: RosterRole;
  state?: RosterState;
  after?: string;
  limit?: number;
}

/** One person as a row of the roster stands. */
export interface RosterPerson {
  user: string;
  login: string;
  name: string;
  company: RosterUnit;
  unit: RosterUnit;
  head: boolean;
  administrator: boolean;
  state: RosterState;
  // The machine the account is bound to, by its name; none where it is bound to none.
  machine: string | null;
  madeAt: number;
  lastSignInAt: number | null;
  // Fields a row does not show but its search matches, so a hit only there is said under the row; the email for the
  // administrator alone.
  jobTitle: string;
  email?: string;
}

/** One page: its people, how many match the whole ask, and where the next page starts, none past the last. */
export interface RosterPage {
  people: RosterPerson[];
  total: number;
  next: string | null;
}

/** One person opened. The contact details stand for the administrator alone. */
export interface RosterDetail extends RosterPerson {
  landline?: string;
  mobile?: string;
  // The units from the company down to theirs.
  path: RosterUnit[];
  // The units they are granted head of directly.
  headOf: RosterUnit[];
  left: { at: number; byName: string } | null;
  machineStanding: { name: string; shared: boolean; provenAt: number | null } | null;
}

/** A person's own BMO as it stands for them, whether they may personalise it, what that follows, and the road its
 * supervisor goes out on. */
export interface RosterBmo {
  hasBmo: boolean;
  standing: Omit<OwnBmoView, "hasBmo" | "own">;
  // Set on the person themselves, or inherited from their unit.
  personalizeSetting: PermissionSetting;
  // Whether a picture stands, read from the person's own picture route.
  picture: boolean;
  road: RoadView | null;
  // The supervisor that is their BMO, where one stands.
  supervisor: string | null;
}

/** One room a person reads by their account. */
export interface RosterRoom {
  chatId: number;
  title: string;
  kind: "private" | "group";
  messageCount: number;
  lastMessageAt: number | null;
}

/** One agent filed under a person's account: a supervisor, or a role agent of a role. */
export interface RosterAgent {
  name: string;
  label: string;
  kind: "supervisor" | "role";
  // The role a role agent is a seat of.
  role: string | null;
  road: RoadView | null;
  enabled: boolean;
}

/** One session of a person's agents. */
export interface RosterSession {
  id: string;
  agent: string;
  scope: string;
  roomId: number | null;
  roomTitle: string | null;
  provider: string;
  model: string;
  // The context its last turn left, tokens against the model's window; none where none is known.
  context: { carried: number; window: number } | null;
}

/** One run of a person's agents. */
export interface RosterRun {
  id: number;
  name: string;
  agent: string;
  startedAt: number;
  endedAt: number | null;
  roomId: number | null;
  roomTitle: string | null;
  state: string;
  outcome: string | null;
}

/** How many runs a person's recent activity holds. */
export const ROSTER_RUNS = 20;
