import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { THEMES, themeDeclarations } from "bmo-ui/shared/themes";
import { CONSOLE_CSS, libraryTokens, TONES, word } from "./library-tokens";
import { measureSource } from "./measure-source";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, Page } from "playwright-core";

// What the measuring module calls itself once it is loaded into the page.
type Measured = { measure: typeof import("./measure") };

// Every coloured token is drawn as words on some screen, so its words read at 4.5:1 or better on every ground they
// stand on — the page, the muted surface and the elevated one, bare and under each tint of their own colour a
// screen or the library lays beneath them — under every console theme in both themes (docs/web.md, 「Colour」).
// The words are drawn as the layer's theme draws a coloured word and the tints from the colour itself, so a colour
// whose words take a step of their own is measured over the tints its fills still lay. The warning and the error
// take their word step on the token, fills included, so a white word reads on their fill as well. The page carries
// the library's tokens and the console's own stylesheet as it ships; the browser draws them and the measuring
// module reads the ratio each word ended up with.

const COLOURS = TONES;

// The colours whose fill is drawn at the step their words read at.
const FILLED = ["warning", "error"] as const;

const GROUNDS = { page: "var(--ui-bg)", muted: "var(--ui-bg-muted)", elevated: "var(--ui-bg-elevated)" } as const;

// The tints of its own colour a word stands on: a screen's quiet panel, the library's soft and subtle shapes and
// a ghost's hover, and the soft shape's hover.
const TINTS = [0, 5, 10, 15] as const;

function fixture(): string {
  const words = COLOURS.flatMap((colour) =>
    Object.entries(GROUNDS).flatMap(([ground, surface]) =>
      TINTS.map((tint) =>
        `<div style="background: ${surface}"><span style="background: color-mix(in oklab, var(--ui-${colour}) ${tint}%, transparent)">`
          + `<span data-read="${colour} on ${ground} tint ${tint}" style="color: ${word(colour)}">Notice 12:34</span></span></div>`
      )
    )
  );
  const fills = FILLED.map((colour) =>
    `<div style="background: var(--ui-bg)"><span data-read="white word on ${colour} fill" style="background: var(--ui-${colour}); color: var(--ui-text-inverted)">Notice 12:34</span></div>`
  );

  return `<style>${libraryTokens()}</style><style>${CONSOLE_CSS}</style><style>
    body { margin: 0; font: 400 14px sans-serif; background: var(--ui-bg); }
    div { padding: 4px; }
    span { display: inline-block; padding: 2px; }</style>
    ${words.join("")}${fills.join("")}`;
}

const ready = touchReady();
let browser: Browser | null = null;
let page: Page;

beforeAll(async () => {
  if (!ready) {
    return;
  }

  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 640, height: 1280 } });

  await page.setContent(fixture());
  await page.addScriptTag({ type: "module", content: `${measureSource()}\ninstall();` });
  await page.waitForFunction(() => "measure" in window);
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();
}, BROWSER_HOOK_MS);

describe.skipIf(!ready)("each coloured token's words", () => {
  for (const mode of ["light", "dark"] as const) {
    test(`read at 4.5:1 or better on every ground in the ${mode} theme, under every console theme`, async () => {
      const short: [string, string, number][] = [];

      for (const theme of THEMES) {
        const ratios = await page.evaluate(([dark, stated]) => {
          document.documentElement.classList.toggle("dark", dark as boolean);
          document.documentElement.style.cssText = stated as string;

          const scope: Window & Partial<Measured> = window;

          return [...document.querySelectorAll("[data-read]")].map((element) => {
            const name = element.getAttribute("data-read")!;

            return [name, scope.measure!.contrast(`[data-read="${name}"]`)[0]!.ratio] as const;
          });
        }, [mode === "dark", themeDeclarations(theme)] as const);

        expect(ratios).toHaveLength(COLOURS.length * Object.keys(GROUNDS).length * TINTS.length + FILLED.length);
        short.push(...ratios.filter(([, ratio]) => ratio < 4.5).map(([name, ratio]) => [theme.id, name, ratio] as [string, string, number]));
      }

      expect(short).toEqual([]);
    });
  }
});
