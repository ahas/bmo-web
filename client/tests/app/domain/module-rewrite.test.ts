import { expect, test } from "bun:test";

import { bare, edited, editsOf, shimSource } from "../../../apps/web/app/domain/module-rewrite";

// A console bundle's module as the console rewrites it before it runs (docs/web.md, 「Screens a unit brings」): a
// shared library's import points at the module standing for the console's copy, a file beside the module at its
// own module, a dynamic import goes through the loader with the module's address, and `import.meta` is the
// module's own address in a browser.

const MODULE = "https://console.invalid/base/api/unit-a/console/bundle.js";

async function rewrite(source: string): Promise<string> {
  return edited(source, await editsOf(source, MODULE, async (specifier) => (bare(specifier) ? `shared:${specifier}` : `file:${new URL(specifier, MODULE).href}`)));
}

test("a library's path is bare and a file's is not", () => {
  expect(bare("vue")).toBe(true);
  expect(bare("@nuxt/ui/components/Button.vue")).toBe(true);
  expect(bare("./chunks/a.js")).toBe(false);
  expect(bare("/base/api/unit-a/b.js")).toBe(false);
  expect(bare("https://elsewhere.invalid/c.js")).toBe(false);
});

test("a static import points at the address it is given, a library's and a file's alike", async () => {
  const text = await rewrite(`import { ref as a } from "vue";\nimport b from "./chunks/b.js";\nexport { a, b };\n`);

  expect(text).toContain(`from "shared:vue"`);
  expect(text).toContain(`from "file:https://console.invalid/base/api/unit-a/console/chunks/b.js"`);
});

test("a dynamic import goes through the loader with the module's own address", async () => {
  const text = await rewrite(`const later = () => import("./chunks/c.js");\n`);

  expect(text).toBe(`const later = () => globalThis[Symbol.for("bmo.console.import")].bind(null, ${JSON.stringify(MODULE)})("./chunks/c.js");\n`);
});

test("import.meta is the module's address, in a browser", async () => {
  const text = await rewrite(`export const where = import.meta.url; export const client = import.meta.client;\n`);

  expect(text).toContain(`({ url: ${JSON.stringify(MODULE)}, client: true, server: false, dev: false }).url`);
  expect(text).toContain(`({ url: ${JSON.stringify(MODULE)}, client: true, server: false, dev: false }).client`);
});

test("the module standing for a library exports every name it can bind, and its default", () => {
  const source = shimSource("vue", ["ref", "computed", "default", "in", "not-a-name"]);

  expect(source).toContain(`.get("vue");`);
  expect(source).toContain("export default m.default;");
  expect(source).toContain("export const { ref, computed } = m;");
});
