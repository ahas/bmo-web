import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { nuxtUiFiles } from "../apps/web/modules/console-shared";

// The console hands a bundle every component and composable of Nuxt UI it can load, and none that imports an
// optional peer of Nuxt UI the console has not installed: the shared module imports each file it lists, so such a
// file would stop the console's production build (docs/web.md, 「Screens a unit brings」).

const APP = join(import.meta.dir, "..", "apps", "web");
const scratch = mkdtempSync(join(tmpdir(), "console-shared-"));

afterAll(() => rmSync(scratch, { recursive: true, force: true }));

// A stand-in of the component library: a manifest naming one optional peer nothing installs, and a component and a
// composable of its runtime for each case.
function standIn(): string {
  const root = join(scratch, "ui");
  const runtime = join(root, "dist", "runtime");

  mkdirSync(join(runtime, "components"), { recursive: true });
  mkdirSync(join(runtime, "composables"), { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "ui", peerDependenciesMeta: { "absent-peer": { optional: true } } }));
  writeFileSync(join(runtime, "components", "Plain.vue"), `<script setup>\nimport { ref } from "vue";\n</script>\n<template><div /></template>\n`);
  writeFileSync(join(runtime, "components", "Plot.vue"), `<script setup>\nimport { draw } from "absent-peer/vue";\n</script>\n<template><div /></template>\n`);
  writeFileSync(join(runtime, "composables", "usePlot.js"), `import { draw } from "absent-peer";\nexport const usePlot = () => draw;\n`);
  writeFileSync(join(runtime, "composables", "useLocal.js"), `import { ref } from "vue";\nexport const useLocal = () => ref(0);\n`);

  return root;
}

test("a file importing an optional peer nothing installs is not handed, and every other file is", async () => {
  const paths = (await nuxtUiFiles(standIn())).map(([path]) => path).sort();

  expect(paths).toEqual(["@nuxt/ui/components/Plain.vue", "@nuxt/ui/composables/useLocal", "@nuxt/ui/composables/useLocal.js"]);
});

test("the installed library's chart, on its optional charts peer the console does not install, is not handed", async () => {
  const packageDir = dirname(dirname(Bun.resolveSync("@nuxt/ui", APP)));
  const paths = (await nuxtUiFiles(packageDir)).map(([path]) => path);

  expect(paths).toContain("@nuxt/ui/components/Button.vue");
  expect(paths).not.toContain("@nuxt/ui/components/Chart.vue");
});
