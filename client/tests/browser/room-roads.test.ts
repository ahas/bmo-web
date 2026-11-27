import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { openRoomInfo } from "./room-info";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser } from "playwright-core";

// The chat services tab of the room information (docs/web.md, the room information's chat services), read in Korean in
// the room the harness's receiver carries on three roads — the console's own record and two messengers' — in the
// receiver's order. Each road is named by its key in the console's own words (docs/web.md, 「A chat road's name」): the
// record by the pack's word for it, the two roads the pack holds no word for by the pack's word for a messenger with
// the key beside it, and never by the English label the receiver gives a road. The roads are one row each and nothing
// to turn, which is what the room information's own file holds; this one reads only what each row is called, at a
// desk's width and a phone's. It drives the console tests/support/browser-console.ts stands up; the suite stands up no
// console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "room-info", password: "fixture-password-3755" };
// The room the console made, which the receiver carries on its own record and two messengers' roads.
const RECORD_CHAT = -9_000_000_000_099;

// The roads as the tab names them, in the order the receiver lists them.
const NAMES = [wording("room.label.road_record"), wording("room.label.road_other", { key: "chat-a" }), wording("room.label.road_other", { key: "chat-b" })];
// The labels the receiver's stand-in gives those roads in its own English, which the console never shows.
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

describe.skipIf(!origin || !touchReady())("the room's chat service labels", () => {
  for (const [width, height, phone] of [[1280, 900, false], [360, 780, true]] as const) {
    test(`names every road in the pack's words and never the receiver's label, ${width}px wide`, async () => {
      const context = await browser!.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, locale: "ko-KR", serviceWorkers: "block", reducedMotion: "reduce" });
      const at = cookie.indexOf("=");

      await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/rooms/${RECORD_CHAT}`, { waitUntil: "load" });
        await page.locator("[data-message-id]").last().waitFor({ timeout: 30_000 });

        const sheet = await openRoomInfo(page, wording("room_info.label.members"));
        const roads = sheet.locator("[data-room-road-label]");

        // One label per road the room stands on, in the receiver's order, each called by the console's word for its key.
        await roads.first().waitFor({ timeout: 10_000 });
        expect((await roads.allInnerTexts()).map((one) => one.trim())).toEqual(NAMES);
        for (const label of RECEIVER_LABELS) expect(await sheet.innerText()).not.toContain(label);

        // Nothing of the head reaches past the screen's width.
        const wide = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);

        expect(wide).toBe(false);
      } finally {
        await context.close();
      }
    }, 90_000);
  }
});
