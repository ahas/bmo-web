import { failureText } from "bmo-ui/app/domain/errors";

import type { StopTarget } from "#shared/types";
import type { Translate } from "#shared/wording";
import type { Ref } from "vue";

// The one place the console holds what a stop is doing. Every screen that stands one — the live
// board's rows, a co-worker tile, an agent's own screen — drives this rather than keeping a flag
// of its own, so the question, the wait, the word stopping and a refusal read the same wherever a
// stop is pressed (`docs/web.md`, 「Live status screen」).
//
// Three things it holds: a refusal belongs to the row it was pressed on and stays with that row, so
// switching sections does not take it away; a stop waits for the bot's answer however long the run
// takes to end, and each row's stop is its own, so a row whose stop is out holds only its own button;
// and the row whose stop is out says so, so a person who pressed one can see which.

/** What a row is known by here: the target it names, in the shape every road writes it. */
export function stopKey(target: StopTarget): string {
  return `${target.kind}:${target.id}`;
}

/** What a press on the stop button does, which is the endpoint on every screen and a stand-in in a test. */
export type StopCall = (target: StopTarget) => Promise<{ state?: string } | void>;

export interface Stops {
  /** The row whose question stands open, or null. One at a time: two open questions is two answers. */
  asking: Ref<StopTarget | null>;
  /** Whether this row is the one asking. */
  isAsking: (target: StopTarget) => boolean;
  /** Whether this row's own stop is out and unanswered, which holds its button. */
  isSending: (target: StopTarget) => boolean;
  /** Whether this row was asked to stop and has not been seen gone: the row reads stopping. */
  isStopping: (target: StopTarget) => boolean;
  /** What was refused or could not be carried for this row, or "". */
  errorOf: (target: StopTarget) => string;
  ask: (target: StopTarget) => void;
  cancel: () => void;
  stop: (target: StopTarget) => Promise<void>;
  /** The rows the picture now draws. What is no longer among them is forgotten. */
  seen: (keys: readonly string[]) => void;
}

export function useStops(t: Translate, call: StopCall): Stops {
  const asking = ref<StopTarget | null>(null);
  const out = ref(new Set<string>());
  const stopping = ref(new Set<string>());
  const errors = ref(new Map<string, string>());
  const isAsking = (target: StopTarget): boolean => asking.value !== null && stopKey(asking.value) === stopKey(target);
  const isSending = (target: StopTarget): boolean => out.value.has(stopKey(target));
  const isStopping = (target: StopTarget): boolean => stopping.value.has(stopKey(target));
  const errorOf = (target: StopTarget): string => errors.value.get(stopKey(target)) ?? "";

  function forget(key: string): void {
    const left = new Map(errors.value);

    left.delete(key);
    errors.value = left;
  }

  function ask(target: StopTarget): void {
    asking.value = target;
    forget(stopKey(target));
  }

  function cancel(): void {
    asking.value = null;
  }

  async function stop(target: StopTarget): Promise<void> {
    const key = stopKey(target);

    // One stop a row: pressing it again while its stop is out asks nothing more.
    if (out.value.has(key)) {
      return;
    }

    out.value = new Set(out.value).add(key);
    forget(key);

    try {
      const answer = await call(target);

      // The question closes with its own answer; one opened on another row since stays open.
      if (asking.value !== null && stopKey(asking.value) === key) {
        asking.value = null;
      }

      // The verb answers that the stop was asked, not that the run is already gone, so the row
      // says stopping until the picture no longer draws it.
      if (answer === undefined || answer === null || answer.state !== "confirmed") {
        stopping.value = new Set(stopping.value).add(key);
      }
    } catch (error) {
      const left = new Map(errors.value);

      left.set(key, failureText(error, t("live.error.stop_failed")));
      errors.value = left;
    } finally {
      const left = new Set(out.value);

      left.delete(key);
      out.value = left;
    }
  }

  function seen(keys: readonly string[]): void {
    const drawn = new Set(keys);
    const kept = new Set([...stopping.value].filter((key) => drawn.has(key)));
    const left = new Map([...errors.value].filter(([key]) => drawn.has(key)));

    if (kept.size !== stopping.value.size) {
      stopping.value = kept;
    }

    if (left.size !== errors.value.size) {
      errors.value = left;
    }

    if (asking.value !== null && !drawn.has(stopKey(asking.value))) {
      asking.value = null;
    }
  }

  return { asking, isAsking, isSending, isStopping, errorOf, ask, cancel, stop, seen };
}
