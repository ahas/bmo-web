import { EVERY_FEATURE } from "#shared/console-features";

import type { ConsoleFeatures } from "#shared/console-features";

/** The deployment's features as the page last read them (docs/web.md, 「The console's features」); every feature
 * stands until they are read. */
export function useConsoleFeatures() {
  return useState<ConsoleFeatures>("console-features", () => EVERY_FEATURE);
}

/** Reads the features again into the page's state; a read that fails leaves every feature standing. */
export async function readConsoleFeatures(): Promise<void> {
  const features = useConsoleFeatures();
  const fetching = useRequestFetch();

  features.value = await fetching<ConsoleFeatures>("/api/console-features").catch(() => EVERY_FEATURE);
}
