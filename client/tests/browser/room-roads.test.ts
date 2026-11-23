import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { openRoomInfo } from "./room-info";
import { standsOnTop } from "./top-layer";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser } from "playwright-core";

// The chat services tab of the room information (docs/web.md, the room information's chat services), in the room the console made on the
// record road that the harness's receiver stands, read in Korean: each road the receiver lists is named by its key in
// the pack's words — the record as the pack's word for it, a road the pack holds no words for as the pack's word for a
// messenger with its key — and never by the English label the receiver gives it, on the row and on its switch alike;
// every switch is reached by scrolling and stands uncovered where a finger lands. It drives the console
// tests/support/browser-console.ts stands up; the suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "room-info", password: "fixture-password-3755" };
const RECORD_CHAT = -9_000_000_000_099;

// The roads the harness's receiver lists, in its order, as the tab names them, and the labels it gives them.
const NAMES = [wording("room.label.road_record"), wording("room.label.road_other", { key: "chat-a" }), wording("room.label.road_other", { key: "chat-b" })];
const RECEIVER_LABELS = ["the room's record", "Chat A", "Chat B"];

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

describe.skipIf(!origin || !touchReady())("the room's chat services tab", () => {
  for (const [width, height, phone] of [[1280, 900, false], [360, 780, true]] as const) {
    test(`names every road in the pack's words and never the receiver's label, each switch reached, ${width}px wide`, async () => {
      const context = await browser!.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, locale: "ko-KR", serviceWorkers: "block", reducedMotion: "reduce" });
      const at = cookie.indexOf("=");

      await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/rooms/${RECORD_CHAT}`, { waitUntil: "load" });
        await page.locator("[data-message-id]").last().waitFor({ timeout: 30_000 });

        const sheet = await openRoomInfo(page, wording("room_info.label.providers"));

        await sheet.getByRole("switch", { name: NAMES.at(-1)!, exact: true }).waitFor({ timeout: 10_000 });

        const shown = await sheet.locator("[data-room-info-body]").innerText();

        for (const name of NAMES) {
          expect(shown).toContain(name);

          const one = sheet.getByRole("switch", { name, exact: true });

          await one.scrollIntoViewIfNeeded();
          expect(await one.isVisible()).toBe(true);
          expect(await standsOnTop(one)).toBe(true);
        }
        for (const label of RECEIVER_LABELS) expect(shown).not.toContain(label);

        // The room stands on the record alone, so its switch is the last on and cannot be turned off.
        expect(await sheet.getByRole("switch", { name: NAMES[0], exact: true }).isDisabled()).toBe(true);

        // Nothing of the tab reaches past the screen's width.
        const wide = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);

        expect(wide).toBe(false);
      } finally {
        await context.close();
      }
    }, 90_000);
  }
});
