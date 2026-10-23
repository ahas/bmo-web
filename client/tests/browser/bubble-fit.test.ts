import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, Page } from "playwright-core";

// A bubble is as wide as the longest line it actually stands on (docs/web.md, 「A bubble is as wide as
// its widest line」). The bubbles below are laid as the room lays them — the words, the blank they keep
// for a meta line at their end by the room's own rules, a chip line under them — and fitted by the
// fitting the console ships; the browser says how wide each stood, where its lines broke and how much
// room was left past the longest.

const ready = touchReady();
const built = ready ? await Bun.build({ entrypoints: [new URL("../../apps/web/app/domain/bubble-fit.ts", import.meta.url).pathname], target: "browser" }) : null;
const script = built === null ? "" : (await Promise.all(built.outputs.map((output) => output.text()))).join("\n");
const source = await Bun.file(new URL("../../apps/web/app/components/RoomMessage.vue", import.meta.url)).text();
// The component's unscoped rules, which are the blank's.
const rules = source.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";

const ROOM = 52;
const style = `
  :root { --spacing: 0.25rem; --chat-meta-gap: 4px; --chat-meta-line: 20px; }
  body { margin: 0; font: 16px/24px monospace; }
  [data-bubble] { display: block; width: fit-content; max-width: 240px; }
  .body { position: relative; display: flex; flex-wrap: wrap; align-items: flex-end; column-gap: 8px; row-gap: 4px; padding: 8px 12px; }
  [data-words] { min-width: 0; max-width: 100%; flex-grow: 1; }
  p { margin: 0; white-space: pre-wrap; }
  [data-meta-inline] { position: absolute; right: 12px; bottom: 8px; width: ${ROOM}px; height: 20px; }
  [data-meta]:not([data-meta-inline]) { display: flex; flex-wrap: wrap; flex-basis: 100%; min-width: 0; align-items: flex-end; gap: 4px; white-space: nowrap; }
  [data-meta-lead] { display: flex; flex-wrap: wrap; min-width: 0; gap: 4px; }
  .chip { display: inline-block; width: 50px; height: 20px; }
  [data-meta-trail] { margin-left: auto; flex-shrink: 0; width: 60px; height: 20px; }
  ${rules}`;

// Words with the time alone at their end, as a short message of the owner's stands.
const inline = (words: string) =>
  `<div data-bubble><div class="body" data-meta-room style="--chat-meta-room: ${ROOM}px"><div data-words><p>${words}</p></div><div data-meta data-meta-inline></div></div></div>`;
// Words with a chip line under them, as an answer stands; `spread` opens what a chip spreads.
const chipped = (words: string, chips: number, spread = false) =>
  `<div data-bubble><div class="body"><div data-words><p>${words}</p></div><div data-meta><span data-meta-lead>${'<span class="chip"></span>'.repeat(chips)}</span><span data-meta-trail></span></div>${spread ? '<div data-spread style="flex-basis:100%">a spread card</div>' : ""}</div></div>`;

interface Laid {
  width: number;
  // The lines the words' letters stand on, by their foot, and how far the longest reaches.
  lines: number;
  reach: number;
  // The room left between the longest line and the bubble's inner edge.
  slack: number;
  metaTop: number;
  wordsFoot: number;
  chipLines: number;
  // Whether the trailing end stands on a line under the chips, and how far its edge is from the
  // bubble's inner trailing edge.
  trailUnder: boolean;
  trailInset: number;
}

let browser: Browser | undefined;
let page: Page;

beforeAll(async () => {
  if (!ready) {
    return;
  }

  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 360, height: 640 } });
  await page.setContent(`<!doctype html><style>${style}</style><main></main>`);
  await page.addScriptTag({ type: "module", content: `${script}\nwindow.fit = { fitBubbles };` });
  await page.waitForFunction(() => "fit" in window);
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();
}, BROWSER_HOOK_MS);

// The bubble laid as it stands, and again once fitted.
async function laid(html: string): Promise<{ before: Laid; after: Laid }> {
  return page.evaluate((markup) => {
    document.querySelector("main")!.innerHTML = markup;

    const bubble = document.querySelector<HTMLElement>("[data-bubble]")!;
    const read = (): Laid => {
      const body = bubble.querySelector<HTMLElement>(".body")!.getBoundingClientRect();
      const range = document.createRange();
      const feet = new Set<number>();
      let reach = 0;

      range.selectNodeContents(bubble.querySelector("p")!.firstChild!);

      for (const line of range.getClientRects()) {
        feet.add(Math.round(line.bottom));
        reach = Math.max(reach, line.right - body.left - 12);
      }

      const chips = [...bubble.querySelectorAll(".chip")].map((chip) => Math.round(chip.getBoundingClientRect().bottom));
      const meta = bubble.querySelector("[data-meta]")!.getBoundingClientRect();
      const width = bubble.getBoundingClientRect().width;
      const trail = bubble.querySelector("[data-meta-trail]")?.getBoundingClientRect();
      const trailUnder = trail !== undefined && chips.length > 0 && trail.top >= Math.max(...chips);
      const trailInset = trail === undefined ? 0 : bubble.getBoundingClientRect().right - 12 - trail.right;

      return { width, lines: feet.size, reach, slack: width - 24 - reach, metaTop: meta.top, wordsFoot: Math.max(...feet), chipLines: new Set(chips).size, trailUnder, trailInset };
    };
    const before = read();

    const scope: Window & { fit?: { fitBubbles: (bubbles: HTMLElement[]) => void } } = window;

    scope.fit!.fitBubbles([bubble]);

    return { before, after: read() };
  }, html);
}

describe.skipIf(!ready)("a bubble fitted to its widest line in Chromium", () => {
  test("words on one line with their time dropped under them stand as wide as those words, the time still under them", async () => {
    const { before, after } = await laid(inline("seventeen letters"));

    expect(before.width).toBe(240);
    expect(before.metaTop).toBeGreaterThanOrEqual(before.wordsFoot);
    expect(after.width).toBeLessThan(before.width);
    expect(after.slack).toBeLessThan(1);
    expect(after.lines).toBe(1);
    expect(after.metaTop).toBeGreaterThanOrEqual(after.wordsFoot);
  });

  test("words that wrap keep every line where it broke and lose the room past the longest", async () => {
    const { before, after } = await laid(inline("one two three four five six seven eight nine ten"));

    expect(before.slack).toBeGreaterThan(8);
    expect(after.lines).toBe(before.lines);
    expect(after.reach).toBe(before.reach);
    expect(after.slack).toBeLessThan(1);
  });

  // The meta line breaks between its two ends before it breaks among the chips (docs/web.md, the room screen's meta line section): the chips and the time
  // share a line where they fit, and otherwise the chips keep one and the time takes the line under it.
  test("chips and the time that fit on one line stand on it", async () => {
    const { after } = await laid(chipped("hi", 2));

    expect(after.chipLines).toBe(1);
    expect(after.trailUnder).toBe(false);
    expect(after.width).toBe(24 + 2 * 50 + 4 + 4 + 60);
  });

  test("chips that fit with no room for the time keep their line, the time under them at the trailing edge", async () => {
    const { before, after } = await laid(chipped("hi", 4));

    expect(before.chipLines).toBe(1);
    expect(after.chipLines).toBe(1);
    expect(after.trailUnder).toBe(true);
    expect(after.trailInset).toBeLessThan(1);
    // Four chips at their 4px step are the longest line.
    expect(after.width).toBe(24 + 4 * 50 + 3 * 4);
  });

  test("chips wider than the bubble wrap among themselves, the bubble at their longest line and the time still under them", async () => {
    const { before, after } = await laid(chipped("hi", 5));

    expect(before.chipLines).toBe(2);
    expect(after.chipLines).toBe(2);
    expect(after.trailUnder).toBe(true);
    expect(after.trailInset).toBeLessThan(1);
    expect(after.width).toBe(24 + 4 * 50 + 3 * 4);
  });

  test("a sender's name wider than the words keeps the bubble wide enough to show it whole", async () => {
    const named = inline("one two three four five six").replace("<div class=\"body\"", "<span data-words data-name style=\"display:block;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;padding:8px 12px 0\">a-rather-long-sender</span><div class=\"body\"");
    const { after } = await laid(named);
    const cut = await page.evaluate(() => {
      const name = document.querySelector<HTMLElement>("[data-name]")!;

      return name.scrollWidth > name.clientWidth;
    });

    expect(after.width).toBeLessThan(240);
    expect(cut).toBe(false);
  });

  test("a bubble with a chip's spread standing open keeps the width its contents ask for", async () => {
    const { before, after } = await laid(chipped("hi", 4, true));

    expect(after.width).toBe(before.width);
  });
});
