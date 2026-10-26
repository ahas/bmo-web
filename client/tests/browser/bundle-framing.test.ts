import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { variantRules } from "../../apps/web/app/domain/bundle-variants";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser } from "playwright-core";

// The frame a bundle's screen stands in, as Chromium lays it out (docs/web.md, 「Screens a unit brings」): a bundle's
// stylesheet stands below the console's utilities, its variant rules once more above them, held to the page area, so
// a screen's `flex-col md:flex-row` turns to a row at its width while the console's frame keeps its own; and the page
// area is the box a screen fixed to the window is laid out in.

const ready = touchReady();
let browser: Browser | null = null;

beforeAll(async () => {
  if (ready) browser = await chromium.launch();
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();
}, BROWSER_HOOK_MS);

// The console's own utilities, and a bundle's stylesheet that holds the same plain utilities and a variant of its own.
const CONSOLE = "@layer theme, base, console-bundles, components, utilities, console-bundle-variants; @layer utilities { .flex { display: flex } .flex-col { flex-direction: column } .fixed { position: fixed } .inset-0 { inset: 0 } }";
const BUNDLE = "@layer theme,base,components;@layer utilities{.flex{display:flex}.flex-col{flex-direction:column}@media (width>=48rem){.md\\:flex-row{flex-direction:row}}.hover\\:underline:hover{text-decoration:underline}}";

describe.skipIf(!ready)("the frame of a bundle's screen in Chromium", () => {
  test("a bundle's width variant beats the console's plain utility inside the page area alone", async () => {
    const page = await browser!.newPage({ viewport: { width: 1280, height: 800 } });

    try {
      await page.setContent(`<!doctype html><style>body { margin: 0 } ${CONSOLE}</style><style>@layer console-bundles { ${BUNDLE} }</style>
        <div id="frame" class="flex flex-col md:flex-row"></div>
        <div id="area" data-console-bundle style="contain: layout; position: relative; width: 600px; height: 400px; margin-left: 200px">
          <div id="screen" class="flex flex-col md:flex-row"></div>
          <div id="fixed" class="fixed inset-0"></div>
        </div>`);

      const direction = (id: string) => page.evaluate((one) => getComputedStyle(document.getElementById(one)!).flexDirection, id);

      // In the bundles' layer alone, the console's plain utility wins.
      expect(await direction("screen")).toBe("column");

      const rules = await page.evaluate(
        ([source, text]) => {
          const read = new Function(`return (${source})`)() as (sheet: CSSStyleSheet) => string[];
          const sheet = new CSSStyleSheet();

          sheet.replaceSync(text);

          const found = read(sheet).join("\n");
          const scoped = typeof CSSScopeRule === "undefined" ? found : `@scope ([data-console-bundle]) {\n${found}\n}`;
          const lifted = document.createElement("style");

          lifted.textContent = `@layer console-bundle-variants {\n${scoped}\n}`;
          document.head.append(lifted);

          return read(sheet);
        },
        [variantRules.toString(), BUNDLE] as const
      );

      expect(rules.length).toBe(2);
      expect(rules.every((one) => one.includes("\\:"))).toBe(true);
      expect(await direction("screen")).toBe("row");
      // The console's frame outside the page area keeps its own reading.
      expect(await direction("frame")).toBe(await page.evaluate(() => (typeof CSSScopeRule === "undefined" ? "row" : "column")));

      // A screen fixed to the window fills the page area and never the window.
      const box = await page.evaluate(() => {
        const one = document.getElementById("fixed")!.getBoundingClientRect();

        return [one.x, one.y, one.width, one.height];
      });

      expect(box).toEqual([200, 0, 600, 400]);
    } finally {
      await page.close();
    }
  }, 60_000);
});
