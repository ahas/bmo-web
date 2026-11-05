import type { DelegationView } from "#shared/types";
import type { Translate } from "#shared/wording";

// How the owner's own chat stands the work of a supervisor's double (docs/web.md, the room screen's delegated-run
// marker): a task the supervisor delegated is one line under the conversation while it waits for a slot or runs, and
// once it ends that line carries what it came to rather than going away. The role names the run and its title says
// what it was asked to do; a run the agency no longer carries stands no line at all.

const WAITING = "room.status.delegation_waiting";
const WAITING_UNTITLED = "room.status.delegation_waiting_untitled";
const RUNNING = "room.status.delegation_running";
const RUNNING_UNTITLED = "room.status.delegation_running_untitled";
const ENDED = "room.status.delegation_ended";
const ENDED_OUTCOME = "room.status.delegation_ended_outcome";

export interface DelegationLine {
  // The delegation's own token, so a line keeps its place as the list changes.
  key: string;
  stage: DelegationView["stage"];
  text: string;
}

// What the run was asked to do, or the agent it was bound to where it carries no title of its own.
function askedOf(delegation: DelegationView): string {
  const title = delegation.title?.trim() ?? "";

  return title === "" ? (delegation.agentName?.trim() ?? "") : title;
}

/**
 * The delegations this room stands: those its answerers asked for, so a double's work stands where the supervisor that
 * asked for it answers. A delegation the agency names no asker for belongs to no room.
 */
export function roomDelegations(items: readonly DelegationView[], answerers: readonly string[]): DelegationView[] {
  const names = new Set(answerers.filter((name) => name !== ""));

  return items.filter((item) => item.askedBy !== null && names.has(item.askedBy));
}

/** One delegated run's line: what it is at while it waits or runs, or what it came to once it ended. */
export function delegationLine(t: Translate, delegation: DelegationView): DelegationLine {
  const asked = askedOf(delegation);

  if (delegation.stage === "ended") {
    const outcome = delegation.outcome?.trim() ?? "";

    return {
      key: delegation.token,
      stage: "ended",
      text: outcome === "" ? t(ENDED, { role: delegation.role }) : t(ENDED_OUTCOME, { role: delegation.role, outcome })
    };
  }

  const key = delegation.stage === "waiting"
    ? (asked === "" ? WAITING_UNTITLED : WAITING)
    : (asked === "" ? RUNNING_UNTITLED : RUNNING);

  return {
    key: delegation.token,
    stage: delegation.stage,
    text: asked === "" ? t(key, { role: delegation.role }) : t(key, { role: delegation.role, title: asked })
  };
}

/**
 * The lines the room stands: every run waiting or running, in the order the agency asked them, and the latest ended
 * run's outcome only where nothing waits or runs, so an ended run takes the marker's place rather than standing beside
 * it. Nothing is kept between reads, so a run the agency dropped leaves no line behind.
 */
export function delegationLines(t: Translate, items: readonly DelegationView[]): DelegationLine[] {
  const active = items.filter((item) => item.stage !== "ended").map((item) => delegationLine(t, item));

  if (active.length > 0) return active;

  const ended = items.find((item) => item.stage === "ended");

  return ended === undefined ? [] : [delegationLine(t, ended)];
}
