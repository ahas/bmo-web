import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

// The console runs the libraries it shares with bmo-ui as the layer's release patches them: the install applies only
// the workspace's own patches, so a package both patch is patched here with the very file the installed layer carries,
// or the layer's components would run on a library they were not released against.

const CLIENT = join(import.meta.dir, "..");
const LAYER = dirname(Bun.resolveSync("bmo-ui/package.json", CLIENT));

function patches(root: string): Record<string, string> {
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { patchedDependencies?: Record<string, string> };

  return manifest.patchedDependencies ?? {};
}

test("every package the layer patches is patched here with the layer's own file", () => {
  const ours = patches(CLIENT);

  for (const [name, file] of Object.entries(patches(LAYER))) {
    expect(ours[name], name).toBeDefined();
    expect(readFileSync(join(CLIENT, ours[name]!), "utf8"), name).toBe(readFileSync(join(LAYER, file), "utf8"));
  }
});
