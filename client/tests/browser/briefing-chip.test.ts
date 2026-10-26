import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";

import type { Browser } from "playwright-core";
import type { ArchivedMessage } from "../../apps/web/shared/types";

// A line's voice briefing chip (docs/web.md, the room screen's chip): where the line's full reading stands, the
// chip spreads its player from the voice engine's sound; where none stands, it asks the receiver for one and says
// it is being made. It drives the console tests/support/browser-console.ts stands up, serving the room's page and
// the reading through the page's own routes; the suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "briefing-chip", password: "fixture-password-2256" };
const ROOM = 43;
const NOW = Math.floor(Date.now() / 1000);

const line = (messageId: number, briefing: ArchivedMessage["briefing"]): ArchivedMessage => ({
  chatId: ROOM, messageId, senderId: 0, senderName: "agent-a", sentAt: NOW - 60, text: `an answer ${messageId}`, imagePath: null,
  replyToMessageId: null, agent: true, briefing
});

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

describe.skipIf(!origin || !touchReady())("a line's voice briefing chip", () => {
  test("plays the reading that stands, and asks for one where none does", async () => {
    const context = await browser!.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block", reducedMotion: "reduce" });
    const at = cookie.indexOf("=");
    const asked: string[] = [];

    await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
    await context.route(new RegExp(`/api/rooms/${ROOM}/messages(\\\\?|$)`), (route) =>
      route.fulfill({
        json: {
          messages: [
            line(701, { state: "ready", source: "kept", voiceMessageId: null, sound: null, briefingId: 77 }),
            line(702, { state: "idle", source: null, voiceMessageId: null, sound: null, briefingId: null })
          ],
          judgements: [],
          hasMore: false
        }
      })
    );
    await context.route(/\/api\/briefings\/77\/sound$/, (route) => route.fulfill({ status: 200, contentType: "audio/ogg", body: Buffer.alloc(0) }));
    await context.route(new RegExp(`/api/rooms/${ROOM}/messages/702/reading$`), (route) => {
      asked.push(route.request().method());

      return route.fulfill({ json: { state: "making", briefingId: null } });
    });

    try {
      const page = await context.newPage();

      await page.goto(`${origin}/rooms/${ROOM}`, { waitUntil: "load" });

      const ready = page.locator('[data-message="m701"]');

      await ready.waitFor({ timeout: 20_000 });
      await ready.getByRole("button", { name: new RegExp(wording("room.label.chip_briefing")) }).first().click();

      const player = ready.locator("[data-briefing-reading]");

      await player.waitFor({ timeout: 10_000 });
      expect(await player.locator("audio").getAttribute("src")).toContain("/api/briefings/77/sound");

      const idle = page.locator('[data-message="m702"]');

      await idle.getByRole("button", { name: new RegExp(wording("room.label.chip_briefing")) }).first().click();
      await idle.getByText(wording("briefing.status.making")).waitFor({ timeout: 10_000 });
      expect(asked).toEqual(["POST"]);
    } finally {
      await context.close();
    }
  }, 90_000);
});
