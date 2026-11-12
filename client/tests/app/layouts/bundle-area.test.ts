import { describe, expect, test } from "bun:test";

// The page area a bundle's screen stands in (docs/web.md, 「Screens a unit brings」): both layouts mark it while the
// path open is a bundle's, and the mark makes it the box the screen's fixed positions are laid out in.

const read = (path: string) => Bun.file(new URL(`../../../apps/web/${path}`, import.meta.url)).text();

describe("the page area of a bundle's screen", () => {
  test("each layout stands its page in the frame, and offers the console's bar to the screens under it", async () => {
    for (const layout of ["app/layouts/default.vue", "app/layouts/member.vue"]) {
      const source = await read(layout);

      expect(source).toMatch(/<BundleScreenFrame>\s*<slot \/>\s*<\/BundleScreenFrame>/);
      expect(source).toContain("provideConsoleTitleBar();");
    }

    const frame = await read("app/components/BundleScreenFrame.vue");

    expect(frame).toContain('v-bind="area"');
    expect(frame).toContain('<ConsoleTitleBar v-if="bar !== null" :title="$t(bar.title)" :icon="bar.icon" />');
  });

  test("the offer names the bar alone, holding no place in it for the screen", async () => {
    const source = await read("app/domain/title-bar.ts");
    const frame = await read("app/components/BundleScreenFrame.vue");
    const bar = await read("app/components/ConsoleTitleBar.vue");

    expect(source).toContain("provide<ConsoleTitleBarOffer>(CONSOLE_TITLE_BAR, {});");
    expect(frame).not.toContain("data-title-bar-screen");
    expect(bar).not.toContain('<slot name="trailing"');
  });

  test("the console draws the bar only for a bundle route that asks for it", async () => {
    const source = await read("app/domain/console-screens.ts");

    expect(source).toContain("route.meta.consoleTitleBar !== true ? null : { title: screen.title, icon: screen.icon }");
  });

  test("the area is marked for a bundle's path alone, and contains the screen's layout", async () => {
    const source = await read("app/domain/console-screens.ts");

    expect(source).toContain('screenAt(screens.value, route.path) === null ? {} : { [BUNDLE_AREA]: "", style: { contain: "layout" } }');
  });
});
