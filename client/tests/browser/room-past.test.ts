import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, Page } from "playwright-core";

// A room of more than one page is read back to its oldest line by scrolling up (docs/web.md, the room screen's 「A cursor
// is a place, not a number」 and 「Where a room's line begins」): every older page is asked before the oldest row held,
// by the digits that row is held under, and once the oldest line stands the line above it says where the room's line
// begins. Two rooms tests/support/browser-console.ts stands up: 75 lines a chat service numbers past 2^53, where a
// rounded cursor would read nothing, on a service that reads the room's past back and one that does not, so the line
// names the first alone; and 70 lines numbered from 1 on the second alone, so the line is the conversation's start. A desktop's width and a
// Galaxy S25 held upright. It drives the console that harness stands up; the suite stands up no console, so there it
// skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "room-past", password: "fixture-password-2943" };
const ROOMS = [
  { chat: -9_002_000_000_002, lines: 75, begins: wording("room.status.held_from", { services: "Chat A" }) },
  { chat: -9_002_000_000_003, lines: 70, begins: wording("room.status.start_of_talk") }
];
const WIDTHS = [
  { width: 1280, height: 900, phone: false },
  { width: 360, height: 780, phone: true }
];

let browser: Browser | null = null;
let cookie = "";

beforeAll(async () => {
  if (!origin || !touchReady()) return;

  const login = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ACCOUNT) });

  expect(login.ok).toBe(true);
  cookie = login.headers.get("set-cookie")!.split(";")[0]!;
  browser = await chromium.launch();
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();
}, BROWSER_HOOK_MS);

// What the room shows: how many rows, the words of the first, and the line above it where one stands.
function shown(page: Page): Promise<{ rows: number; first: string | null; begins: string | null }> {
  return page.evaluate(() => {
    const rows = [...document.querySelectorAll("[data-message] [data-words]:not([data-name])")];

    return {
      rows: document.querySelectorAll("[data-message]").length,
      first: rows[0]?.textContent?.trim() ?? null,
      begins: document.querySelector("[data-line-begins]")?.textContent?.trim() || null
    };
  });
}

// Scrolls the room's conversation to its top, where the screen reads the page before the oldest row it holds.
function toTop(page: Page): Promise<void> {
  return page.evaluate(() => {
    let scroller: HTMLElement | null = document.querySelector("[data-message]");

    while (scroller !== null && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
    scroller!.scrollTop = 0;
  });
}

describe.skipIf(!origin || !touchReady())("a room's past read back to its oldest line", () => {
  for (const viewport of WIDTHS) {
    for (const room of ROOMS) {
      test(`room ${room.chat} at ${viewport.width}px`, async () => {
        const context = await browser!.newContext({
          viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.phone, hasTouch: viewport.phone, serviceWorkers: "block", reducedMotion: "reduce"
        });
        const at = cookie.indexOf("=");

        await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

        try {
          const page = await context.newPage();
          const cursors: string[] = [];

          page.on("request", (request) => {
            const url = new URL(request.url());

            if (url.pathname.endsWith(`/api/rooms/${room.chat}/messages`) && url.searchParams.has("before")) cursors.push(url.searchParams.get("before")!);
          });

          await page.goto(`${origin}/rooms/${room.chat}`, { waitUntil: "load" });
          await page.locator("[data-message]").first().waitFor({ timeout: 30_000 });
          expect((await shown(page)).rows).toBe(30);

          // Each scroll to the top reads one older page; the room holds three.
          for (let held = 30; held < room.lines; held = Math.min(room.lines, held + 30)) {
            await toTop(page);
            await page.waitForFunction((more) => document.querySelectorAll("[data-message]").length >= more, Math.min(room.lines, held + 30), { timeout: 20_000 });
          }

          await page.locator("[data-line-begins]").filter({ hasText: room.begins }).waitFor({ timeout: 20_000 });

          expect(await shown(page)).toEqual({ rows: room.lines, first: "line 1", begins: room.begins });
          // Every older page was asked before the oldest row held, by the exact digits it is held under.
          expect(cursors).toEqual(room.chat === ROOMS[0]!.chat ? ["3973000000000045177", "3973000000000015177"] : ["41", "11"]);
        } finally {
          await context.close();
        }
      }, 120_000);
    }
  }
});
