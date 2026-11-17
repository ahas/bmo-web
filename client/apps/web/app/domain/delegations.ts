import { computed, getCurrentScope, onScopeDispose, ref } from "vue";

import type { DelegationRun, DelegationView } from "#shared/types";
import type { Translate } from "#shared/wording";
import type { ComputedRef } from "vue";

// How the owner's own chat stands the work of a supervisor's double (docs/web.md, the room screen's delegated-run
// marker): a task the supervisor delegated is one line under the conversation while it waits for a slot or runs. When
// the screen watched a run end, its line says what it came to for a moment and then goes; a run that had already ended
// when the room opened stands nothing. The role names the run and its title says what it was asked to do; a run the
// agency no longer carries stands no line at all. A line whose run is known opens that run's log, and the notice of an
// ended run opens the run it was last seen running as, since the agency names a run only while its slot holds it.

const WAITING = "room.status.delegation_waiting";
const WAITING_UNTITLED = "room.status.delegation_waiting_untitled";
const RUNNING = "room.status.delegation_running";
const RUNNING_UNTITLED = "room.status.delegation_running_untitled";
const ENDED = "room.status.delegation_ended";
const ENDED_OUTCOME = "room.status.delegation_ended_outcome";

// How long an ended run's line stays once this screen has watched it end: long enough to read what it came to, short
// enough that nothing of a finished run hangs in the conversation.
export const DELEGATION_NOTICE_MS = 10_000;

export interface DelegationLine {
  // The delegation's own token, so a line keeps its place as the list changes.
  key: string;
  stage: DelegationView["stage"];
  text: string;
  // The run whose log the line opens; none while it is not known.
  run: DelegationRun | null;
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
      text: outcome === "" ? t(ENDED, { role: delegation.role }) : t(ENDED_OUTCOME, { role: delegation.role, outcome }),
      run: delegation.run
    };
  }

  const key = delegation.stage === "waiting"
    ? (asked === "" ? WAITING_UNTITLED : WAITING)
    : (asked === "" ? RUNNING_UNTITLED : RUNNING);

  return {
    key: delegation.token,
    stage: delegation.stage,
    text: asked === "" ? t(key, { role: delegation.role }) : t(key, { role: delegation.role, title: asked }),
    run: delegation.run
  };
}

/**
 * The lines a room stands now: every run waiting or running, in the order the agency asked them. An ended run stands
 * nothing here; the room's own reading announces one it watched end for a moment, and that notice is never left behind.
 */
export function delegationLines(t: Translate, items: readonly DelegationView[]): DelegationLine[] {
  return items.filter((item) => item.stage !== "ended").map((item) => delegationLine(t, item));
}

// When the notice of an ended run goes, and how: a clock a test hands its own, so no test waits on the real one.
export type Later = (work: () => void, ms: number) => () => void;

const onTheClock: Later = (work, ms) => {
  const timer = setTimeout(work, ms);

  return () => clearTimeout(timer);
};

export interface DelegationReading {
  // The lines the conversation stands now: each run waiting or running, then the notice of one this screen watched
  // end, for as long as that notice lasts.
  lines: ComputedRef<DelegationLine[]>;
  // Takes one answer from the agency, for the answerers of this room. Every call replaces what stood before.
  take: (items: readonly DelegationView[], answerers: readonly string[]) => void;
  // Nothing stands, and no notice is owed: a read that failed, a room this line does not belong to.
  clear: () => void;
  // Stops the notice's clock, without moving what stands.
  stop: () => void;
}

export interface DelegationReadingOptions {
  noticeMs?: number;
  later?: Later;
}

/**
 * What the owner's own chat stands of the agency's delegations, kept as the screen's view rather than the service's
 * record. A run the screen saw waiting or running and now sees ended says what it came to for the notice's length and
 * is then gone; a run that was already ended at the first answer, or that the agency dropped between answers, leaves
 * nothing at all.
 */
export function useDelegationReading(t: Translate, options: DelegationReadingOptions = {}): DelegationReading {
  const noticeMs = options.noticeMs ?? DELEGATION_NOTICE_MS;
  const later = options.later ?? onTheClock;
  const standing = ref<DelegationLine[]>([]);
  const notice = ref<DelegationLine | null>(null);
  // The tokens waiting or running at the last answer, which is how a run this screen watched end is told apart from
  // one that had already ended when it opened.
  let seen = new Set<string>();
  // The run each of those was last seen running as, which an ended one's notice opens once the agency names it no
  // longer.
  let runs = new Map<string, DelegationRun>();
  let cancel: (() => void) | null = null;

  function stop(): void {
    cancel?.();
    cancel = null;
  }

  function clear(): void {
    stop();
    notice.value = null;
    standing.value = [];
    seen = new Set();
    runs = new Map();
  }

  function announce(line: DelegationLine): void {
    stop();
    notice.value = line;
    cancel = later(() => {
      cancel = null;
      notice.value = null;
    }, noticeMs);
  }

  function take(items: readonly DelegationView[], answerers: readonly string[]): void {
    const relevant = roomDelegations(items, answerers);
    const active = relevant.filter((item) => item.stage !== "ended");
    const tokens = new Set(active.map((item) => item.token));

    for (const token of seen) {
      if (tokens.has(token)) continue;

      const ended = relevant.find((item) => item.token === token && item.stage === "ended");

      if (ended !== undefined) announce(delegationLine(t, { ...ended, run: ended.run ?? runs.get(token) ?? null }));
    }

    // A run that waits or runs again is no longer an ending to announce.
    if (notice.value !== null && tokens.has(notice.value.key)) {
      stop();
      notice.value = null;
    }

    // A run keeps the run it was seen as while the slot names none between two of its turns.
    runs = new Map(active.flatMap((item) => {
      const run = item.run ?? runs.get(item.token);

      return run === undefined ? [] : [[item.token, run] as const];
    }));
    standing.value = delegationLines(t, active.map((item) => ({ ...item, run: runs.get(item.token) ?? null })));
    seen = tokens;
  }

  if (getCurrentScope() !== undefined) onScopeDispose(stop);

  return {
    lines: computed(() => (notice.value === null ? standing.value : [...standing.value, notice.value])),
    take,
    clear,
    stop
  };
}
