import { describe, expect, test } from "bun:test";

// The page area a bundle's screen stands in (docs/web.md, 「Screens a unit brings」): both layouts mark it while the
// path open is a bundle's, and the mark makes it the box the screen's fixed positions are laid out in.

const read = (path: string) => Bun.file(new URL(`../../../apps/web/${path}`, import.meta.url)).text();

describe("the page area of a bundle's screen", () => {
  test("each layout binds the area's attributes to the box its page stands in", async () => {
    for (const layout of ["app/layouts/default.vue", "app/layouts/member.vue"]) {
      const source = await read(layout);

      expect(source).toContain('<div class="relative flex min-h-0 min-w-0 flex-1" v-bind="bundleArea">\n');
      expect(source).toContain("const bundleArea = useBundleArea();");
    }
  });

  test("the area is marked for a bundle's path alone, and contains the screen's layout", async () => {
    const source = await read("app/domain/console-screens.ts");

    expect(source).toContain('screenAt(screens.value, route.path) === null ? {} : { [BUNDLE_AREA]: "", style: { contain: "layout" } }');
  });
});
