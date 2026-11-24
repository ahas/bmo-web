import { ownScreenName } from "./own-screen-names";
import { useOpenedReadings } from "./text-reading";

import type { ConsoleScreen } from "#shared/console-bundles";
import type { ReadName } from "./own-screen-names";
import type { ComputedRef } from "vue";

// The names of a reader's own screens read in the reader's language for the sidebar (docs/web.md, 「Sidebar」, the
// my-apps section), through the console's translator as every text in another language is read.

/** The names of the reader's own screens that stand in a reading now, by screen path: each whose words carry no name
 * in the reader's language, read as this browser reads a text in another language on opening. */
export function useReadScreenNames(screens: () => readonly ConsoleScreen[]): ComputedRef<ReadonlyMap<string, ReadName>> {
  const { locale } = useI18n();
  const makers = computed(() =>
    screens().flatMap((screen) => {
      const name = ownScreenName(screen, locale.value);

      return name === null || name.own ? [] : [{ to: screen.screenPath, key: name.key, original: name.text }];
    })
  );
  const readings = useOpenedReadings(() => makers.value.map((maker) => maker.original));

  return computed(
    () =>
      new Map(
        makers.value.flatMap((maker) => {
          const text = readings.value.get(maker.original);

          return text === undefined ? [] : [[maker.to, { key: maker.key, text, original: maker.original }] as const];
        })
      )
  );
}
