import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

// The console runs the libraries it shares with bmo-ui as the layer's release patches them: the install applies only
// the workspace's own patches, so a package the layer patches is patched here with every file section of the layer's
// own patch as it stands, or the layer's components would run on a library they were not released against. The
// console's patch of such a package may carry sections of its own beside them, for files of the library the layer's
// patch leaves alone. A package the console patches stands once in the lockfile: a copy nested under another package
// would run that package unpatched, and a library keeping two copies keeps two of its own states.

const CLIENT = join(import.meta.dir, "..");
const LAYER = dirname(Bun.resolveSync("bmo-ui/package.json", CLIENT));

function patches(root: string): Record<string, string> {
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { patchedDependencies?: Record<string, string> };

  return manifest.patchedDependencies ?? {};
}

// A patch's sections, one a file it changes, each from its `diff --git` line to the next.
function sections(patch: string): string[] {
  return patch.split(/^(?=diff --git )/m).filter((one) => one.startsWith("diff --git "));
}

test("every package the layer patches is patched here with each section of the layer's own file", () => {
  const ours = patches(CLIENT);

  for (const [name, file] of Object.entries(patches(LAYER))) {
    expect(ours[name], name).toBeDefined();

    const held = sections(readFileSync(join(CLIENT, ours[name]!), "utf8"));

    for (const section of sections(readFileSync(join(LAYER, file), "utf8"))) {
      expect(held, `${name}: ${section.split("\n")[0]}`).toContain(section);
    }
  }
});

test("every package the console patches stands once in the lockfile", () => {
  const keys = [...readFileSync(join(CLIENT, "bun.lock"), "utf8").matchAll(/^ {4}"([^"]+)": \[/gm)].map((found) => found[1]!);

  for (const patched of Object.keys(patches(CLIENT))) {
    const name = patched.slice(0, patched.lastIndexOf("@"));

    expect(keys.filter((key) => key !== name && key.endsWith(`/${name}`)), name).toEqual([]);
  }
});
