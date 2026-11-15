import { formatElapsed, modelLabel } from "./status";

import type { AgentRun, RoleReservation } from "#shared/agent-runs";
import type { Translate } from "#shared/wording";
import type { LogPlace } from "./log";

// How agent management's agents tab reads what each agent is doing now (docs/web.md, 「What each agent is doing now」):
// a role's agent by every run let in on it, a supervisor by the rooms its turns run in, and nothing going as idle.

// The width the state column stands at most at, cutting its line there; the whole of it is in the cell's tooltip.
export const STATE_CEILING = 320;

/** One thing an agent is doing now, as its row's state cell says it. */
export interface AgentDoing {
  // The cell's one line, without how long.
  line: string;
  // The line naming the work, where the line itself names it by an item's number alone.
  note: string | null;
  // The item a job's run is a run of, which the item's own tooltip names; none for any other.
  item: number | null;
  // What the tooltip says under the line or the item: where the run works and on what road, without how long.
  detail: string[];
  // Since when, in epoch milliseconds; none where nothing says.
  since: number | null;
  // Where pressing the cell opens the log; null for the log's newest lines.
  place: LogPlace | null;
}

/** Every run let in on an agent of a role, the earliest first. An agent carries more than one where a job of its waits
 * in the machine's turn and it takes another meanwhile (the agency's `docs/role-agents.md`, 「When an agent is busy」). */
export function runsOfAgent(runs: readonly AgentRun[], agent: string): AgentRun[] {
  return runs
    .filter((run) => run.agent === agent)
    .sort((one, other) => (one.since ?? Number.MAX_SAFE_INTEGER) - (other.since ?? Number.MAX_SAFE_INTEGER));
}

/** Where a run opens its role's log, in the order the agency's `docs/api.md` (「slots」) gives: at the run it names,
 * from its start; with no run named but a role session held, at the log's newest lines, which is no place (null); with
 * neither, at the moment the run took the slot; and at the newest lines where even that is not known. */
export function runLogPlace(run: Pick<AgentRun, "log" | "session" | "since">): LogPlace | null {
  if (run.log !== null) return { run: run.log };
  if (run.session !== null || run.since === null) return null;

  return { at: Math.floor(run.since / 1000) };
}

/** What a run works on: the item's number for a job of an item, else the line naming its work, else its place. */
function subjectOf(t: Translate, run: AgentRun): string {
  if (run.itemId !== null) return t("live.label.run_item", { id: run.itemId });

  return run.title ?? run.place;
}

/** A role's agent at work: the source that asked its run and what it works on, and in its tooltip the path it works
 * in and the road it goes out on as well. */
export function runDoing(t: Translate, run: AgentRun): AgentDoing {
  const line = `${run.source} · ${subjectOf(t, run)}`;
  const road = [run.provider, run.model === null ? null : modelLabel(run.model)].filter((part): part is string => part !== null);

  return {
    line,
    note: run.itemId === null ? null : run.title,
    item: run.itemId,
    detail: [run.path ?? run.place, ...(road.length === 0 ? [] : [road.join(" · ")])],
    since: run.since,
    place: runLogPlace(run)
  };
}

/** A supervisor's turn in one room: the room it runs in and when it began, in epoch seconds. */
export interface SupervisorTurn {
  chatId: number;
  startedAt: number;
}

/** A supervisor at work: the answering word and the rooms its turns run in, opening its log at its earliest turn. */
export function turnsDoing(t: Translate, turns: readonly SupervisorTurn[], roomName: (chatId: number) => string): AgentDoing | null {
  if (turns.length === 0) return null;

  const ordered = [...turns].sort((one, other) => one.startedAt - other.startedAt);
  const first = ordered[0]!;
  const line = t("live.label.answering", { rooms: ordered.map((turn) => roomName(turn.chatId)).join(", ") });

  return { line, note: null, item: null, detail: [], since: first.startedAt * 1000, place: { at: first.startedAt, chat: first.chatId } };
}

/** How long an agent has been at it, from `since` to `now`, both in epoch milliseconds. */
export function doingFor(t: Translate, since: number, now: number): string {
  return formatElapsed(t, (now - since) / 1000);
}

/** How many of a role's slots a reservation keeps. */
export function reservedOf(reservations: readonly RoleReservation[], role: string): number {
  return reservations.find((one) => one.role === role)?.reserved ?? 0;
}
