import { usePolling } from "./polling";

import type { AgentRunsView } from "#shared/agent-runs";
import type { Ref } from "vue";

// How often what the roles' agents are doing is read again while a tab showing it stands and the browser tab is seen
// (docs/web.md, 「What each agent is doing now」).
const RUNS_MS = 3_000;

/** What the roles' agents are doing now, read under one key by every tab that shows it and read again on its own clock.
 * `data` is the last answer read, kept through a later read that fails, so what stands on screen is never taken down
 * by one refused read; `error` is the last read's failure, none once a read answers again. */
export function useAgentRuns(): { data: Readonly<Ref<AgentRunsView | null>>; error: Readonly<Ref<unknown>>; refresh: () => Promise<void> } {
  const read = useFetch<AgentRunsView>("/api/agent-runs", { key: "agent-runs", lazy: true, server: false });
  const held = shallowRef<AgentRunsView | null>(read.data.value ?? null);

  watch(read.data, (answer) => {
    if (answer != null) held.value = answer;
  });

  usePolling(() => {
    if (document.visibilityState === "visible") void read.refresh();
  }, RUNS_MS);

  return { data: held, error: read.error, refresh: read.refresh };
}
