import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, CDPSession, Page } from "playwright-core";
import KO from "../fixtures/browser/flight-meta.test.ko.json";

// A sent message rises out of the input bar as one block: its ground, its words and its meta line,
// laid out from the first frame as the bubble stands on arrival and only moved (docs/web.md, 「What
// arrives comes in at the end」). The bubble below is laid as the room lays a short message — the
// meta line at the end of the words' last line, over the blank the room's own rules keep there — and
// flown by the flight the console ships; the browser says where the line stood on every frame and how
// often the page was laid out while it flew.

const ready = touchReady();
const built = ready ? await Bun.build({ entrypoints: [new URL("../../apps/web/app/domain/flight.ts", import.meta.url).pathname], target: "browser" }) : null;
const script = built === null ? "" : (await Promise.all(built.outputs.map((output) => output.text()))).join("\n");
const source = await Bun.file(new URL("../../apps/web/app/components/RoomMessage.vue", import.meta.url)).text();
// The component's unscoped rules, which are the blank's.
const rules = source.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";

const ROOM = 52;
const fixture = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    :root { --spacing: 0.25rem; --chat-meta-gap: 4px; --chat-meta-line: 20px; }
    body { margin: 0; font: 16px/24px monospace; }
    [data-bubble] { display: inline-block; max-width: 240px; background: #d1f4e6; border-radius: 16px; }
    .body { position: relative; display: flex; flex-wrap: wrap; align-items: flex-end; padding: 8px 12px; }
    [data-words] { min-width: 0; max-width: 100%; flex-grow: 1; }
    p { margin: 0; white-space: pre-wrap; }
    [data-meta] { position: absolute; right: 12px; bottom: 8px; width: ${ROOM}px; height: 20px; background: #888; }
    ${rules}${KO.line_32}${ROOM}${KO.line_39}`;

interface Flown {
  // Where the meta line stood inside the flying copy, frame by frame, and inside the bubble on arrival.
  flying: { x: number; y: number }[];
  landed: { x: number; y: number };
  // Whether the copy stood exactly on the ground, frame by frame.
  together: boolean[];
  // Where the flight was put.
  host: boolean;
}

let browser: Browser | null = null;
let page: Page;
let cdp: CDPSession;

beforeAll(async () => {
  if (!ready) {
    return;
  }

  browser = await chromium.launch();
  page = await browser.newPage({ viewport: { width: 360, height: 640 } });
  cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  await page.setContent(fixture);
  await page.addScriptTag({ type: "module", content: `${script}\nwindow.flight = { riseOutOf };` });
  await page.waitForFunction(() => "flight" in window);
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();
}, BROWSER_HOOK_MS);

async function layouts(): Promise<number> {
  const { metrics } = await cdp.send("Performance.getMetrics");

  return metrics.find((metric) => metric.name === "LayoutCount")?.value ?? 0;
}

// The bubble risen from the input box, a quarter of a second long, its meta line read every frame.
async function fly(): Promise<Flown> {
  return page.evaluate(async () => {
    const scope: Window & { flight?: { riseOutOf: (...args: unknown[]) => Promise<void> } } = window;
    const flight = scope.flight!;
    const bubble = document.querySelector<HTMLElement>("[data-bubble]")!;
    const words = document.querySelector("textarea")!.getBoundingClientRect();
    const at = (meta: Element, box: Element) => ({
      x: Math.round(meta.getBoundingClientRect().left - box.getBoundingClientRect().left),
      y: Math.round(meta.getBoundingClientRect().top - box.getBoundingClientRect().top)
    });
    const flown: Omit<Flown, "landed"> = { flying: [], together: [], host: false };
    let watching = true;

    const watch = (): void => {
      const contents = document.querySelector("[data-rise-contents]");
      const ground = document.querySelector("[data-rise-ground]");

      if (contents !== null && ground !== null) {
        const one = contents.getBoundingClientRect();
        const other = ground.getBoundingClientRect();

        flown.flying.push(at(contents.querySelector("[data-meta]")!, contents));
        flown.together.push(one.left === other.left && one.top === other.top && one.width === other.width && one.height === other.height);
        flown.host ||= contents.parentElement?.hasAttribute("data-flight-host") === true;
      }

      if (watching) {
        requestAnimationFrame(watch);
      }
    };

    requestAnimationFrame(watch);
    await flight.riseOutOf(bubble, { x: words.left + 8, y: words.top + 4 }, { duration: 0.25, ease: [0.2, 0, 0, 1] }, () => null);
    watching = false;

    return { ...flown, landed: at(bubble.querySelector("[data-meta]")!, bubble) };
  });
}

describe.skipIf(!ready)("a sent message's flight in Chromium", () => {
  test("carries the meta line where it stands on arrival, on the ground, on every frame, and lays nothing out as it moves", async () => {
    const before = await layouts();
    const flown = await fly();
    const laidOut = (await layouts()) - before;

    expect(flown.flying.length).toBeGreaterThan(5);
    // The line stands at the end of the words' only line, inside the one-line bubble.
    expect(flown.landed.y).toBeLessThan(20);

    for (const place of flown.flying) {
      expect(place).toEqual(flown.landed);
    }

    expect(flown.together.every(Boolean)).toBe(true);
    // The flight is laid out as it is put down and as it is taken away, and moved by transform alone in
    // between, however many frames it runs.
    expect(laidOut).toBeLessThanOrEqual(3);
  });

  test("is put in the place the layer keeps for it, beside no row", async () => {
    expect((await fly()).host).toBe(true);
  });
});
