import type { StopTarget } from "./types";

// What the roles' agents are doing now, as agent management's agents and roles tabs read it (docs/web.md, 「What each
// agent is doing now」; the agency's docs/role-slots.md): every run let in on a role's slot, read from the agency's
// `GET /slots`, and the slots each role keeps by a reservation.

/** One run let in on a role's slot, on the agent the agency names. */
export interface AgentRun {
  role: string;
  // The agent of the role the run was let in on, by its registered name; none where the agency names none.
  agent: string | null;
  // What the run works in: the repository whose checkout its path is, by its label, or the folder's last part.
  place: string;
  path: string | null;
  // The source that asked for the slot, in the pack's words.
  source: string;
  provider: string | null;
  model: string | null;
  // Since when the run holds the slot, in epoch milliseconds; none where the agency does not say.
  since: number | null;
  // The line naming the work the slot was asked for, where its asker named one.
  title: string | null;
  // The item the run is a job of, where it is one.
  itemId: number | null;
  // The run its log opens at: its job's run where the agency names the job, else the run its binding names; none
  // while no run is named.
  log: string | null;
  // The role session the slot is bound to, which with no run named holds the slot between two of its turns; none
  // where it is bound to no session.
  session: string | null;
  // What a stop of the run names: a job's run is stopped through its item, as every job is; a run the console can
  // tie to no item names none.
  stop: StopTarget | null;
}

/** A role's slots kept by a reservation for an owner that has not used them yet. */
export interface RoleReservation {
  role: string;
  reserved: number;
}

export interface AgentRunsView {
  // When the agency was read, in epoch milliseconds.
  readAt: number;
  runs: AgentRun[];
  reservations: RoleReservation[];
}
