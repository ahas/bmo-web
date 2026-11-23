import { readFile } from "node:fs/promises";

import { EVERY_FEATURE, featuresFrom } from "#shared/console-features";

import type { ConsoleFeatures } from "#shared/console-features";

/**
 * The deployment's features, read afresh from the file `WEB_FEATURES_FILE` names (docs/web.md, 「The console's
 * features」). No file named, one that does not stand and one that does not read leave every feature standing.
 */
export async function consoleFeatures(): Promise<ConsoleFeatures> {
  const file = process.env.WEB_FEATURES_FILE?.trim() ?? "";

  if (file === "") return EVERY_FEATURE;

  try {
    return featuresFrom(Bun.TOML.parse(await readFile(file, "utf8")));
  } catch {
    return EVERY_FEATURE;
  }
}
