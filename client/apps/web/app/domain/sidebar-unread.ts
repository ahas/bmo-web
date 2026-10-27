import { onBeforeUnmount, onMounted, ref } from "vue";

import type { ScreenCounts } from "./screens";
import type { Ref } from "vue";
import type { ConsoleScreen } from "#shared/console-bundles";

// The sidebar counts the bundles declare (docs/web.md, 「Sidebar」; bmo-ui's `docs/console-bundles.md`, the sidebar
// count): each bundle whose manifest names one is read through the console's relay with the reader's own credential
// and owner key, so the count is the reader's own, and the last count stands where a read does not answer. The
// sidebar reads them when it stands, again every minute while the tab is open, and the moment a tab brought back into
// view looks at them, since what arrived while it was out of sight is not in the count it holds.

// How often a standing sidebar asks again: a minute, the console's own clock, since no stream announces a count.
const READ_EVERY_MS = 60_000;

/** The bundles that declare a sidebar count, each by the address of the screen it stands on. */
export interface CountedBundle {
  to: string;
  url: string;
  field: string;
}

export function countedBundles(screens: readonly ConsoleScreen[]): CountedBundle[] {
  return screens.flatMap((screen) => (screen.unread == null ? [] : [{ to: screen.screenPath, url: screen.unread.url, field: screen.unread.field }]));
}

// What an answer holds at the field a manifest named: a whole number nought or more, or null where it holds none.
export function countOf(answer: unknown, field: string): number | null {
  if (typeof answer !== "object" || answer === null) return null;

  const held = (answer as Record<string, unknown>)[field];

  return typeof held === "number" && Number.isSafeInteger(held) && held >= 0 ? held : null;
}

/**
 * The sidebar counts, read for the reader whose sidebar stands. Nothing is drawn before a read has answered, and a
 * read that fails leaves the count the sidebar last held.
 */
export function useSidebarUnread(screens: readonly ConsoleScreen[]): Ref<ScreenCounts> {
  const counts = ref<Record<string, number>>({});
  let clock: ReturnType<typeof setInterval> | null = null;
  let reading = false;

  async function read(): Promise<void> {
    if (reading) return;

    reading = true;

    try {
      for (const bundle of countedBundles(screens)) {
        try {
          const answer = await $fetch(bundle.url, { headers: { accept: "application/json" } });
          const count = countOf(answer, bundle.field);

          if (count !== null) counts.value = { ...counts.value, [bundle.to]: count };
        } catch {
          // A unit that did not answer leaves the count it last gave standing; the sidebar keeps drawing it.
        }
      }
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
