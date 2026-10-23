import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";
import type { Browser, Page } from "playwright-core";
import { BROWSER_HOOK_MS, touchReady } from "./touch";
import KO from "../fixtures/browser/flight-layer.test.ko.json";

// A message flying to its place travels in the conversation's own layer, under everything laid over
// the conversation (docs/web.md, 「What arrives comes in at the end」). The page below stands as the
// room screen stacks: the console's root an isolated context; in it the room's bars and its way down
// as numbered layers over the scrolling conversation, a notice over all of the root, and the
// conversation itself a marked isolated layer holding the rows and a day mark held at its top; after
// the root, in the body, what the component library floats there with no number of its own.
const ready = touchReady();
const built = ready ? await Bun.build({ entrypoints: [new URL("../../apps/web/app/domain/flight.ts", import.meta.url).pathname], target: "browser" }) : null;
const script = built === null ? "" : (await Promise.all(built.outputs.map((output) => output.text()))).join("\n");

function fixture(): string {
  const floating = (kind: string, left: number, top: number): string =>
    `<div data-overlay="${kind}" style="position:fixed;left:${left}px;top:${top}px;width:90px;height:40px;background:#eee">${kind}</div>`;

  return `${KO.line_20}${floating("tooltip", 10, 380)}${floating("menu", 110, 380)}${floating("popover", 210, 380)}
    ${floating("dialog", 10, 430)}${floating("drawer", 110, 430)}${floating("sidebar", 210, 430)}`;
}

let browser: Browser | null = null;
let page: Page;

beforeAll(async () => {
  if (!ready) {
    return;
  }

  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 360, height: 640 } });

  await page.setContent(fixture());
  await page.addScriptTag({ type: "module", content: `${script}\nwindow.flight = { settleInto };` });
  await page.waitForFunction(() => "flight" in window);

  // An answer settling from a box as large as the window, at a length that holds it there for the
  // whole file: wherever an overlay stands, the flight is under it or over it.
  await page.evaluate(() => {
    const bubble = document.querySelector<HTMLElement>("[data-bubble]")!;
    const whole = { left: 0, top: 0, width: innerWidth, height: innerHeight };
    const scope: Window & { flight?: { settleInto: (...args: unknown[]) => Promise<void> } } = window;
    const flight = scope.flight!;

    void flight.settleInto(bubble, whole, { duration: 1e7, ease: [0, 0, 1, 1] });
  });
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();
}, BROWSER_HOOK_MS);

// What stands on top at the middle of an element, as painted: the flight takes no pointer, so for the
// question alone it is made to take one, and the answer is the paint order.
async function topmost(selector: string): Promise<"flight" | "itself" | "other"> {
  return page.evaluate((selector) => {
    const target = document.querySelector(selector)!;
    const box = target.getBoundingClientRect();
    const layers = [...document.querySelectorAll<HTMLElement>("[data-rise-ground], [data-rise-contents]")];

    layers.forEach((layer) => (layer.style.pointerEvents = "auto"));
    const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    layers.forEach((layer) => (layer.style.pointerEvents = "none"));

    if (top?.closest("[data-rise-ground], [data-rise-contents]")) {
      return "flight";
    }

    return top !== null && target.contains(top) ? "itself" : "other";
  }, selector);
}

describe.skipIf(!ready)("a message's flight in Chromium", () => {
  test("is drawn over the conversation's rows", async () => {
    expect(await topmost('[data-row="one"]')).toBe("flight");
  });

  test.each(["top bar", "input bar", "way down", "day mark", "notice", "tooltip", "menu", "popover", "dialog", "drawer", "sidebar"])(
    "passes under the %s",
    async (kind) => {
      expect(await topmost(`[data-overlay="${kind}"]`)).toBe("itself");
    }
  );
});
