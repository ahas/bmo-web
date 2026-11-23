// The deployment's features (docs/web.md, 「The console's features」): the parts of the console's own a deployment
// may leave out, each standing unless the features file says `false`.

/** Every feature the console reads, by the name the features file gives it. */
export const CONSOLE_FEATURES = ["organizations", "research", "siren", "monitor"] as const;

export type ConsoleFeature = (typeof CONSOLE_FEATURES)[number];

/** Whether each feature stands. */
export type ConsoleFeatures = Readonly<Record<ConsoleFeature, boolean>>;

/** A whole console: every feature standing. */
export const EVERY_FEATURE: ConsoleFeatures = { organizations: true, research: true, siren: true, monitor: true };

/** The features a read file names: each `false` it holds leaves its feature out, and anything else leaves it standing. */
export function featuresFrom(read: unknown): ConsoleFeatures {
  const named = typeof read === "object" && read !== null ? (read as Record<string, unknown>) : {};
  const features = { ...EVERY_FEATURE };

  for (const feature of CONSOLE_FEATURES) {
    if (named[feature] === false) features[feature] = false;
  }

  return features;
}
