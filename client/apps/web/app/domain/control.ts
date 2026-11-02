import { computed, getCurrentScope, onScopeDispose, ref, type ComputedRef, type Ref } from "vue";
import { CONTROL_CHECKING, CONTROL_UNREACHABLE, POLL_INTERVAL_MS } from "#shared/config";

import type { ControlStatus } from "#shared/types";
import type { Translate } from "#shared/wording";

// What a screen knows of the bot's control API: it has not heard yet, nothing took the call, or the
// bot answered. A busy bot is waited for, so it reads as not heard yet; not having heard is no failure
// and a busy bot is no gone one, so the three are kept apart all the way to the words and the colour
// (docs/web.md).
export type ControlLink = "checking" | "unreachable" | "reachable";

export function controlLink(reachable: boolean | null): ControlLink {
  return reachable === null ? "checking" : reachable ? "reachable" : "unreachable";
}

// The line a screen stands where the bot's part of it would be, and nothing once the bot answers.
export function controlLine(t: Translate, link: ControlLink): string {
  return link === "reachable" ? "" : t({ checking: CONTROL_CHECKING, unreachable: CONTROL_UNREACHABLE }[link]);
}

// Only a failure that was actually met wears the error colour; asking is neutral.
export function controlTone(link: ControlLink): "neutral" | "error" {
  return link === "unreachable" ? "error" : "neutral";
}

export interface ControlReading {
  control: Ref<ControlStatus | null>;
  link: ComputedRef<ControlLink>;
  reachable: ComputedRef<boolean>;
  read: () => Promise<void>;
}

// When the screen asks again: the work to do after a pause, with a way to call it off. A test hands
// its own, so no reading waits on the real clock.
export type Later = (work: () => void, ms: number) => () => void;

const onTheClock: Later = (work, ms) => {
  const timer = setTimeout(work, ms);

  return () => clearTimeout(timer);
};

// Whether this app answered the call of the bot. A refusal of its own carries the response it sent; a
// call that never reached it — a browser offline for a moment, a phone waking with its requests
// cut — carries none, and a call refused for the login is about the login; neither says anything of
// the bot (docs/web.md).
function answeredHere(error: unknown): boolean {
  const response = (error as { response?: { status?: number } } | null)?.response;

  return response != null && response.status !== 401;
}

// The screen's own reading of the control API. Nothing is known until the first answer; the bot
// reported gone, or a refusal of this app's, is a bot that did not answer; a call this app never
// answered leaves the reading as it stood. A reading other than an answer is asked again on its own
// clock, so one missed read never stands until the next turn ends somewhere.
export function useControlStatus(
  fetcher: () => Promise<ControlStatus> = () => $fetch<ControlStatus>("/api/control"),
  later: Later = onTheClock,
  againMs: number = POLL_INTERVAL_MS
): ControlReading {
  const control = ref<ControlStatus | null>(null);
  let cancel: (() => void) | null = null;
  let disposed = false;

  async function read(): Promise<void> {
    cancel?.();
    cancel = null;

    try {
      control.value = await fetcher();
    } catch (error) {
      if (answeredHere(error)) {
        control.value = { reachable: false, ownerChatId: null };
      }
    }

    if (!disposed && cancel === null && control.value?.reachable !== true) {
      cancel = later(() => {
        cancel = null;
        void read();
      }, againMs);
    }
  }

  if (getCurrentScope() !== undefined) {
    onScopeDispose(() => {
      disposed = true;
      cancel?.();
    });
  }

  const link = computed(() => controlLink(control.value === null ? null : control.value.reachable));

  return { control, link, reachable: computed(() => link.value === "reachable"), read };
}
