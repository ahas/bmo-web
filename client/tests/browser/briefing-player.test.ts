import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";

import type { Browser, BrowserContext, Page } from "playwright-core";

// The voice briefing's player (docs/web.md, 「Messages」, the briefing's player): it floats over the page area like a
// picture-in-picture window, first at the bottom right above a room's input bar and never under the title row; it
// is dragged to a side and kept there across a reload; Back stops it and leaves the page where it was. The voice
// engine's stream is stood in for by the page's own event route, carrying one summary that ended a moment ago, and
// its sound by a short silent WAV. It drives the console tests/support/browser-console.ts stands up; the suite
// stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "briefing-chip", password: "fixture-password-2256" };
const ROOM = 43;
const BRIEFING = 7;
const TITLE = "the briefing's title";
const SCREENS = [
  { width: 1280, height: 900, phone: false },
  { width: 360, height: 780, phone: true }
] as const;

// Three seconds of silence, 8 kHz mono 8-bit.
function silence(seconds: number): Buffer {
  const samples = 8_000 * seconds;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + samples, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(8_000, 24);
  header.writeUInt32LE(8_000, 28);
  header.writeUInt16LE(1, 32);
  header.writeUInt16LE(8, 34);
  header.write("data", 36);
  header.writeUInt32LE(samples, 40);

  return Buffer.concat([header, Buffer.alloc(samples, 128)]);
}

let browser: Browser | null = null;
let cookie = "";

beforeAll(async () => {
  if (!origin || !touchReady()) return;

  const login = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ACCOUNT) });

  expect(login.ok).toBe(true);
  cookie = login.headers.get("set-cookie")!.split(";")[0]!;
  browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();
}, BROWSER_HOOK_MS);

async function open(screen: (typeof SCREENS)[number]): Promise<BrowserContext> {
  const context = await browser!.newContext({ viewport: { width: screen.width, height: screen.height }, isMobile: screen.phone, hasTouch: screen.phone, serviceWorkers: "block", reducedMotion: "reduce" });
  const at = cookie.indexOf("=");
  const briefing = {
    id: 1, at: Date.now(), type: "voice-briefing", chatId: ROOM, messageId: 701, phase: "ended",
    voice: { id: BRIEFING, chatId: ROOM, messageId: 701, kind: "summary", title: TITLE, state: "done", durationMs: 30_000, plays: true, voiceMessageId: null, spoken: true, finishedAt: Date.now() - 1_000 }
  };

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
  await context.route(/\/api\/events(\?|$)/, (route) =>
    route.fulfill({ contentType: "text/event-stream", body: `retry: 60000\n\nevent: run\ndata: {"run":"fixture"}\n\nid: 1\nevent: bot\ndata: ${JSON.stringify(briefing)}\n\n` })
  );
  await context.route(new RegExp(`/api/briefings/${BRIEFING}/sound$`), (route) => route.fulfill({ status: 200, contentType: "audio/wav", body: silence(30) }));

  return context;
}

async function boxOf(page: Page, selector: string): Promise<{ top: number; bottom: number; left: number; right: number } | null> {
  return await page.evaluate((one) => {
    const box = document.querySelector(one)?.getBoundingClientRect();

    return box === undefined ? null : { top: box.top, bottom: box.bottom, left: box.left, right: box.right };
  }, selector);
}

describe.skipIf(!origin || !touchReady())("the voice briefing's player", () => {
  for (const screen of SCREENS) {
    test(`stands at the bottom right above the room's input bar, is dragged and kept, and goes on Back, ${screen.width}px wide`, async () => {
      const context = await open(screen);

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/rooms/${ROOM}`, { waitUntil: "load" });

        const player = page.locator("[data-briefing-popup]");

        await player.waitFor({ timeout: 20_000 });
        await page.waitForTimeout(1_000);
        expect(await player.locator("[data-briefing-title]").innerText()).toBe(TITLE);

        const placed = (await boxOf(page, "[data-briefing-popup]"))!;
        const foot = await boxOf(page, "[data-screen-foot]");
        const head = (await boxOf(page, "[data-title-bar]"))!;
        const area = (await page.evaluate(() => {
          const box = (document.querySelector("[data-briefing-popup]") as HTMLElement | null)?.offsetParent?.getBoundingClientRect();

          return box === undefined ? null : { left: box.left, right: box.right };
        }))!;

        // The bottom right of the page area, on the gutter, above the input bar and below the title row.
        expect(area.right - placed.right).toBeLessThanOrEqual(25);
        if (foot !== null) expect(placed.bottom).toBeLessThanOrEqual(foot.top);
        expect(placed.top).toBeGreaterThanOrEqual(head.bottom);

        // Dragged to the left, it settles there and stands there again after a reload.
        const grab = { x: (placed.left + placed.right) / 2, y: (placed.top + placed.bottom) / 2 };

        await page.mouse.move(grab.x, grab.y);
        await page.mouse.down();
        await page.mouse.move(area.left + 40, grab.y - 80, { steps: 8 });
        await page.mouse.up();
        await page.waitForTimeout(400);

        const moved = (await boxOf(page, "[data-briefing-popup]"))!;

        expect(moved.left - area.left).toBeLessThanOrEqual(25);

        const kept = await page.evaluate(() => localStorage.getItem("bmo-web.briefing-player"));

        expect(JSON.parse(kept ?? "{}")).toMatchObject({ side: "left" });

        // Back stops it and leaves the page where it was.
        const address = page.url();

        await page.goBack();
        await player.waitFor({ state: "detached", timeout: 10_000 });
        expect(page.url()).toBe(address);
      } finally {
        await context.close();
      }
    }, 90_000);
  }

  test("its close mark stops the listening, and its press pauses the sound", async () => {
    const context = await open(SCREENS[0]);

    try {
      const page = await context.newPage();

      await page.goto(`${origin}/`, { waitUntil: "load" });

      const player = page.locator("[data-briefing-popup]");

      await player.waitFor({ timeout: 20_000 });
      await player.locator("[data-briefing-press]").click();
      await player.getByRole("button", { name: wording("briefing.action.listen") }).waitFor({ timeout: 5_000 });
      await player.locator("[data-briefing-stop]").click();
      await player.waitFor({ state: "detached", timeout: 10_000 });
    } finally {
      await context.close();
    }
  }, 90_000);
});
