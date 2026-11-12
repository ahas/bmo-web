import { LAYER_VERSION, consoleManifest } from "bmo-ui/shared/console-manifest";

import type { ConsoleManifest } from "bmo-ui/shared/console-manifest";

// A manifest as a unit would answer it to this console: a member's screen under the unit's own name, built on the
// layer the console runs, with whatever a test lays over it.

/** The manifest's fields, as a unit answers them. */
export function manifestFields(name: string, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name,
    title: `${name}.title`,
    icon: "i-material-symbols-circle",
    screenPath: `/${name}`,
    serviceName: name,
    layer: LAYER_VERSION,
    bundle: "/console/bundle.js",
    words: "/console/words",
    role: "member",
    ...over
  };
}

/** The manifest as the console reads it. */
export function manifestOf(name: string, over: Record<string, unknown> = {}): ConsoleManifest {
  return consoleManifest(manifestFields(name, over));
}
