import { clockUnder, dayKey } from "bmo-ui/app/domain/time";

import { usePolling } from "./polling";

import type { RestView } from "#shared/rest";
import type { Translate } from "#shared/wording";
import type { Ref } from "vue";

// How often the rest is read again while a tab showing an agent's state stands and the browser tab is seen, the
// cadence the roles' agents' state is read at (docs/web.md, 「What each agent is doing now」). No stream the console
// holds carries the rest's beginning or its end, so the clock alone moves it.
const REST_MS = 3_000;

/** Whether the deployment rests and which agents it closes, read under one key and again on its own clock. `data` is
 * the last answer read, kept through a later read that fails, so a mark is never taken down by one refused read. */
export function useRest(): { data: Readonly<Ref<RestView | null>>; refresh: () => Promise<void>; take: (view: RestView) => void } {
  const read = useFetch<RestView>("/api/rest", { key: "rest", lazy: true, server: false });
  const held = shallowRef<RestView | null>(read.data.value ?? null);

  watch(read.data, (answer) => {
    if (answer != null) held.value = answer;
  });

  usePolling(() => {
    if (document.visibilityState === "visible") void read.refresh();
  }, REST_MS);

  // An answer a change of the rest came back with stands at once, ahead of the next read.
  const take = (view: RestView): void => {
    held.value = view;
  };

  return { data: held, refresh: read.refresh, take };
}

/** The rest's mark as an agent's state reads it, at `now` in epoch seconds: until when, the time alone on the day it
 * ends and the date with it on another, or the rest alone where it ends at no known moment. */
export function restMarkText(t: Translate, until: number | null, now: number): string {
  if (until === null) return t("live.label.agent_resting");

  return t("live.label.agent_resting_until", { until: clockUnder(until, dayKey(now)) });
}

/** The rest's mark for one agent, none where the rest does not close its road. */
export function restMarkOf(t: Translate, rest: RestView | null, name: string, now: number): string | null {
  if (rest === null || !rest.resting) return null;
  if (!rest.supervisors.includes(name) && !rest.agents.includes(name)) return null;

  return restMarkText(t, rest.until, now);
}
