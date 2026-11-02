import { onBeforeUnmount, onMounted, ref } from "vue";

import type { ScreenCounts } from "./screens";
import type { Ref } from "vue";

// The sidebar counts the bundles declare (docs/web.md, 「Sidebar」; bmo-ui's `docs/console-bundles.md`, the sidebar
// count). The console reads them itself, from its server, for the reader signed in; the sidebar asks the console's own
// route for them, so no call is made from whatever bundle's page is open, and the last count stands where one did not
// answer. The sidebar asks when it stands, again every minute while the tab is open — a clock that paces, since no
// stream announces a count — and the moment a tab brought back into view looks at them.

const READ_EVERY_MS = 60_000;

// The console's route the counts are read at, under its base path.
const COUNTS_ROUTE = "/api/console-bundles/unread";

/** The counts an answer adds over those the sidebar held: each that answered replaces its own, the rest stand. */
export function mergedCounts(held: ScreenCounts, answer: unknown): ScreenCounts {
  if (typeof answer !== "object" || answer === null || Array.isArray(answer)) return held;

  const next: Record<string, number> = { ...held };

  for (const [to, count] of Object.entries(answer as Record<string, unknown>)) {
    if (typeof count === "number" && Number.isSafeInteger(count) && count >= 0) next[to] = count;
  }

  return next;
}

/**
 * The sidebar counts, read for the reader whose sidebar stands. Nothing is drawn before a read has answered, and a
 * count that did not answer stays as the sidebar last held it.
 */
export function useSidebarUnread(): Ref<ScreenCounts> {
  const counts = ref<ScreenCounts>({});
  let clock: ReturnType<typeof setInterval> | null = null;
  let reading = false;

  async function read(): Promise<void> {
    if (reading) return;

    reading = true;

    try {
      counts.value = mergedCounts(counts.value, await $fetch(COUNTS_ROUTE, { headers: { accept: "application/json" } }));
    } catch {
      // A console that did not answer leaves every count standing; the sidebar keeps drawing them.
    } finally {
      reading = false;
    }
  }

  // A tab that came back into view reads again, since a minute's clock does not run while the browser holds it.
  function onVisible(): void {
    if (document.visibilityState === "visible") void read();
  }

  onMounted(() => {
    void read();
    clock = setInterval(() => void read(), READ_EVERY_MS);
    document.addEventListener("visibilitychange", onVisible);
  });

  onBeforeUnmount(() => {
    if (clock !== null) clearInterval(clock);

    document.removeEventListener("visibilitychange", onVisible);
  });

  return counts;
}
