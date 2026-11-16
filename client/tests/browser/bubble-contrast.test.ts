import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { DEFAULT_PALETTE, PALETTES, paletteDeclarations } from "bmo-ui/shared/palettes";
import { DEFAULT_THEME, THEMES, themeDeclarations } from "bmo-ui/shared/themes";
import { CONSOLE_CSS, TONES, libraryTokens, word } from "./library-tokens";
import { measureSource } from "./measure-source";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, Page } from "playwright-core";
import type { Palette } from "bmo-ui/shared/palettes";
import type { Theme } from "bmo-ui/shared/themes";
import KO from "../fixtures/browser/bubble-contrast.test.ko.json";

// What the measuring module calls itself once it is loaded into the page.
type Measured = { measure: typeof import("./measure") };

// Every colour drawn on a bubble but its words is an ink of that bubble's own ground: the muted and
// dimmed letters, a link, a chip's letters and icon, the verdict mark, a badge's words. Each
// reads at 4.5:1 or better, a mark at 3:1, on the bubble and on the washes a chip and a soft badge lay over it, on the
// owner's ground and on everyone else's, in both modes and in every palette under every console
// theme, and keeps reading when the owner's ground is changed to another colour of its mode
// (docs/web.md, 「The conversation's measures」, 「Both on the page」). The page
// carries the library's colour and text tokens for each theme, and the console's own stylesheet whole
// as it ships, which the browser reads as it reads any stylesheet, passing over the build's own
// imports and at-rules it has no use for; the browser draws them and the measuring module reads what
// each ended up as.

// What one bubble carries: the letters on the bubble itself, a chip opened or hovered — its muted
// letters and the verdict mark's colours on its wash of those letters — and every theme colour as a soft badge's
// words on its own wash.
function bubble(side: string, ground: string): string {
  const read = (name: string, colour: string) => `<span data-read="${side} ${name}" style="color: ${colour}">16:56</span>`;
  const marks = ["success", "error"].map((key) => read(`mark on chip ${key}`, `var(--chat-mark-${key})`)).join("")
    + read("mark on chip neutral", "var(--ui-text-dimmed)");
  const badges = TONES.map((key) =>
    `<span class="wash" style="color: ${word(key)}"><span data-read="${side} badge ${key}${KO.line_61}`).join("");

  return `<div class="chat-bubble ${ground}" data-surface="${side} ground">
    ${read("words", "var(--ui-text)")}${read("muted", "var(--ui-text-muted)")}${read("dimmed", "var(--ui-text-dimmed)")}
    ${TONES.map((key) => read(key, word(key))).join("")}
    <span class="wash" style="color: var(--ui-text-muted)"><span data-read="${side} chip letters">1</span>${marks}</span>
    ${badges}
    <span class="surface" data-surface="${side} raised" style="background: var(--ui-bg-elevated)">${read("panel words", "var(--ui-text)")}${read("panel muted", "var(--ui-text-muted)")}${read("panel dot icon", "var(--ui-text-dimmed)")}</span>
    <span class="surface" data-surface="${side} sunk" style="background: var(--ui-bg-muted)">${read("well words", "var(--ui-text)")}${read("well muted", "var(--ui-text-muted)")}${read("well dimmed", "var(--ui-text-dimmed)")}</span>
    <span data-surface="${side} pressed" style="background: var(--ui-bg-accented)"></span>
    <span data-surface="${side} edge" style="background: var(--ui-border)"></span>
    <span data-surface="${side} page" style="background: var(--ui-bg)"></span>
  </div>`;
}

function fixture(): string {
  return `<style>${libraryTokens()}</style><style>${CONSOLE_CSS}</style><style>
    body { margin: 0; font: 400 14px sans-serif; background: var(--ui-bg); }
    .chat-bubble { background: var(--bubble); padding: 8px 12px; }
    .wash { background: color-mix(in oklab, currentcolor 10%, transparent); }
    span { display: inline-block; padding: 2px; }</style>
    ${bubble("mine", "chat-mine")}${bubble("other", "chat-theirs")}
    <span data-surface="outside sunk" style="background: var(--ui-bg-muted)"></span><span data-surface="outside page" style="background: var(--ui-bg)"></span>`;
}

const ready = touchReady();
let browser: Browser | null = null;
let page: Page;

beforeAll(async () => {
  if (!ready) {
    return;
  }

  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 1280, height: 400 } });

  await page.setContent(fixture());
  await page.addScriptTag({ type: "module", content: `${measureSource()}\ninstall();` });
  await page.waitForFunction(() => "measure" in window);
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();
}, BROWSER_HOOK_MS);

// A console theme and a palette together, as an account reads the console in both, and every pair of
// the two lists.
interface Look {
  id: string;
  theme: Theme;
  palette: Palette;
}

const DEFAULT_LOOK: Look = { id: `${DEFAULT_THEME.id}/${DEFAULT_PALETTE.id}`, theme: DEFAULT_THEME, palette: DEFAULT_PALETTE };
const LOOKS: Look[] = THEMES.flatMap((theme) => PALETTES.map((palette) => ({ id: `${theme.id}/${palette.id}`, theme, palette })));

// Every ratio on the page, under a mode and a look — stated on the root over the library's own
// colours, as the console's page states it — and, where given, another teal for the owner's ground.
async function measured(theme: "light" | "dark", mint?: string, look: Look = DEFAULT_LOOK): Promise<Record<string, number>> {
  await page.evaluate(([dark, stated]) => {
    document.documentElement.classList.toggle("dark", dark as boolean);
    document.documentElement.style.cssText = stated as string;
  }, [theme === "dark", `${themeDeclarations(look.theme)} ${paletteDeclarations(look.palette)}${mint === undefined ? "" : ` --chat-mine: ${mint};`}`]);

  return page.evaluate(() =>
    Object.fromEntries([...document.querySelectorAll("[data-read]")].map((element) => {
      const name = element.getAttribute("data-read")!;

      const scope: Window & Partial<Measured> = window;

      return [name, scope.measure!.contrast(`[data-read="${name}"]`)[0]!.ratio];
    }))
  );
}

// What a read must reach: a mark or a dot, read at 3:1, and everything else is letters, at 4.5:1.
function short(ratios: Record<string, number>): [string, number][] {
  return Object.entries(ratios).filter(([name, ratio]) => ratio < (/ (dot|mark) /.test(name) ? 3 : 4.5));
}

// Colours as the browser painted them, each an element's letters or its ground, in the perceptual space
// a colour difference is read in, under a theme and, where given, another teal for the owner's ground.
async function painted(theme: "light" | "dark", targets: [string, "color" | "backgroundColor"][], mint?: string, look: Look = DEFAULT_LOOK): Promise<number[][]> {
  await measured(theme, mint, look);

  return page.evaluate((targets) => {
    const pad = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
    const linear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);

    return targets.map(([selector, property]) => {
      pad.fillStyle = getComputedStyle(document.querySelector(selector)!)[property];
      pad.fillRect(0, 0, 1, 1);

      const [r, g, b] = [...pad.getImageData(0, 0, 1, 1).data].slice(0, 3).map((v) => linear(v / 255)) as [number, number, number];
      const [l, m, s] = [
        0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b,
        0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b,
        0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
      ].map(Math.cbrt) as [number, number, number];

      return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
    });
  }, targets);
}

// The verdict mark's inks on one side's ground in a look, the owner's unless named.
async function markInks(theme: "light" | "dark", look: Look, side: "mine" | "other" = "mine"): Promise<number[][]> {
  return painted(theme, ["success", "error", "neutral"].map((key) => [`[data-read="${side} mark on chip ${key}"]`, "color"]), undefined, look);
}

// The surfaces inside one side's bubble and its ground, by name: the ground, a raised panel, a press,
// a sunk well, a hairline and the page's own ground.
const SURFACES = ["ground", "raised", "pressed", "sunk", "edge", "page"] as const;

async function surfaces(theme: "light" | "dark", side: "mine" | "other", mint: string | undefined, look: Look): Promise<Record<(typeof SURFACES)[number], { l: number; c: number; h: number }>> {
  const colours = await painted(theme, SURFACES.map((name) => [`[data-surface="${side} ${name}"]`, "backgroundColor"]), mint, look);

  return Object.fromEntries(colours.map(([l, a, b], at) => [SURFACES[at], { l: l!, c: Math.hypot(a!, b!), h: ((Math.atan2(b!, a!) * 180) / Math.PI + 360) % 360 }])) as never;
}

// Other teals and greens each theme could take for the owner's ground, the ones it has worn among them.
const otherMints = { light: ["#cdeeee", "#d1f4e6", "#e0f2f1", "#ccfbf1"], dark: ["#1d4f42", "#134e4a", "#164e4d", "#1f3d3c"] } as const;

describe.skipIf(!ready)("what reads on a bubble", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`reads at 4.5:1, a mark at 3:1, or better on both sides in the ${theme} theme, in every palette under every theme`, async () => {
      for (const look of LOOKS) {
        const ratios = await measured(theme, undefined, look);

        expect(Object.keys(ratios)).toHaveLength(2 * (2 * TONES.length + 13));
        expect([look.id, short(ratios)]).toEqual([look.id, []]);
      }

      await measured(theme);
      // The owner's bubble wears the teal its theme declares, whatever teal that is.
      const [painted, declared] = await page.evaluate(() => {
        const teal = document.body.appendChild(Object.assign(document.createElement("i"), { style: "background: var(--chat-mine)" }));
        const grounds = [getComputedStyle(document.querySelector(".chat-mine")!).backgroundColor, getComputedStyle(teal).backgroundColor];

        teal.remove();

        return grounds;
      });

      expect(painted).toBe(declared!);
      expect(painted).not.toBe("rgba(0, 0, 0, 0)");
    });

    test(`keeps it when the owner's ground takes another colour of the ${theme} theme`, async () => {
      for (const mint of otherMints[theme]) {
        const ratios = await measured(theme, mint);

        expect([mint, short(ratios)]).toEqual([mint, []]);
      }
    });

    test(`keeps the verdict mark's passing, failing and neutral colours apart in the ${theme} theme, in every palette under every theme`, async () => {
      const apart = (a: number[], b: number[]) => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
      const close: string[] = [];

      for (const look of LOOKS) {
        const [success, error, neutral] = await markInks(theme, look);

        if (apart(success!, error!) <= 0.15 || apart(success!, neutral!) <= 0.08 || apart(error!, neutral!) <= 0.08) {
          close.push(look.id);
        }
      }

      expect(close).toEqual([]);
    });

    // The passing mark reaches its 3:1 by lightness alone and keeps the green's own strength, which a
    // small mark needs to read as green at all: near the whole chroma the screen shows a green at that
    // lightness, on a green hue (docs/web.md, the room screen's judgements).
    test(`keeps the passing mark a vivid green on both sides in the ${theme} theme, in every palette under every theme`, async () => {
      const greens = [];

      for (const look of LOOKS) {
        for (const side of ["mine", "other"] as const) {
          const [, a, b] = (await markInks(theme, look, side))[0]!;

          greens.push({ look: look.id, side, chroma: Math.hypot(a!, b!), hue: ((Math.atan2(b!, a!) * 180) / Math.PI + 360) % 360 });
        }
      }

      expect(greens.filter(({ chroma, hue }) => chroma < 0.17 || hue < 135 || hue > 160)).toEqual([]);
    });

    // A panel, a press, a badge's ground and a hairline inside a bubble are steps of that bubble's own
    // ground: of its colour, the owner's teal or everyone else's grey, whatever teal the theme gives
    // the owner, and told apart from it by lightness alone, towards the theme's far end. The sunk well a
    // code block stands in and the page's own ground keep the page's lightness, so a colour fixed
    // against the page reads on them as it does outside a bubble, and take the bubble's hue where the
    // screen shows it (docs/web.md, 「The conversation's measures」).
    test(`stands every surface inside a bubble as a step of its own ground in the ${theme} theme, in every palette under every theme`, async () => {
      const far = theme === "light" ? -1 : 1;
      const wrong: string[] = [];
      const grounds = [
        ...LOOKS.flatMap((look) => [["other", undefined, look], ["mine", undefined, look]]),
        ...otherMints[theme].map((one) => ["mine", one, DEFAULT_LOOK])
      ] as ["mine" | "other", string | undefined, Look][];

      for (const [side, mint, look] of grounds) {
        const { ground, raised, pressed, sunk, edge, page: below } = await surfaces(theme, side, mint, look);
        const [outsideWell, outsidePage] = await painted(theme, [['[data-surface="outside sunk"]', "backgroundColor"], ['[data-surface="outside page"]', "backgroundColor"]], mint, look);
        const steps = { raised: raised.l - ground.l, pressed: pressed.l - raised.l, edge: edge.l - ground.l };
        const of = `${look.id} ${side} ${mint ?? ""}`;

        for (const [name, step] of Object.entries(steps)) {
          if (step * far < 0.015) {
            wrong.push(`${of}: ${name} ${step.toFixed(3)}`);
          }
        }

        for (const [name, surface, page] of [["sunk", sunk, outsideWell![0]!], ["page", below, outsidePage![0]!]] as const) {
          if (Math.abs(surface.l - page) > 0.01) {
            wrong.push(`${of}: ${name} l ${surface.l.toFixed(3)} where the page's is ${page.toFixed(3)}`);
          }
        }

        for (const [name, surface] of Object.entries({ raised, pressed, edge, sunk })) {
          const turned = Math.abs(((surface.h - ground.h + 540) % 360) - 180);
          const hued = ground.c > 0.02 && surface.c > 0.01;

          if ((name !== "sunk" && Math.abs(surface.c - ground.c) > 0.015) || (hued && turned > 10)) {
            wrong.push(`${of}: ${name} c ${surface.c.toFixed(3)} h ${surface.h.toFixed(0)} on c ${ground.c.toFixed(3)} h ${ground.h.toFixed(0)}`);
          }
        }
      }

      expect(wrong).toEqual([]);
    });
  }
});
