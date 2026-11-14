import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";

import type { Browser } from "playwright-core";
import type { ArchivedMessage } from "../../apps/web/shared/types";

// A line's voice briefing chip (docs/web.md, the room screen's chip): where the line's full reading stands, the
// chip spreads its player from the voice engine's sound, waiting for its play press even in a browser that would let
// it start, and folding itself a moment after it played to its end; where none stands, or the one asked for was
// stopped, it asks the receiver for one and says it is being made. It drives the console tests/support/browser-console.ts stands up, serving the room's page and
// the reading through the page's own routes; the suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "briefing-chip", password: "fixture-password-2256" };
const ROOM = 43;
const NOW = Math.floor(Date.now() / 1000);

const line = (messageId: number, briefing: ArchivedMessage["briefing"]): ArchivedMessage => ({
  chatId: ROOM, messageId: String(messageId), senderId: 0, senderName: "agent-a", sentAt: NOW - 60, text: `an answer ${messageId}`, imagePath: null,
  replyToMessageId: null, agent: true, briefing
});

// Seconds of silence, 8 kHz mono 8-bit.
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

describe.skipIf(!origin || !touchReady())("a line's voice briefing chip", () => {
  test("spreads the reading that stands waiting for its play press, and asks for one where none does", async () => {
    const context = await browser!.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block", reducedMotion: "reduce" });
    const at = cookie.indexOf("=");
    const asked: string[] = [];

    await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
    await context.route(new RegExp(`/api/rooms/${ROOM}/messages(\\\\?|$)`), (route) =>
      route.fulfill({
        json: {
          messages: [
            line(701, { state: "ready", source: "kept", voiceMessageId: null, sound: null, briefingId: 77 }),
            line(702, { state: "idle", source: null, voiceMessageId: null, sound: null, briefingId: null }),
            line(703, { state: "ready", source: "kept", voiceMessageId: null, sound: null, briefingId: 78 }),
            line(704, { state: "stopped", source: null, voiceMessageId: null, sound: null, briefingId: 79 })
          ],
          judgements: [],
          hasMore: false
        }
      })
    );
    await context.route(/\/api\/briefings\/77\/sound$/, (route) => route.fulfill({ status: 200, contentType: "audio/ogg", body: Buffer.alloc(0) }));
    await context.route(/\/api\/briefings\/78\/sound/, (route) => route.fulfill({ status: 200, contentType: "audio/wav", body: silence(1) }));
    await context.route(new RegExp(`/api/rooms/${ROOM}/messages/70[24]/reading$`), (route) => {
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

      // A reading that stands waits for its play press, and folds a moment after it played to its end.
      const short = page.locator('[data-message="m703"]');

      await short.getByRole("button", { name: new RegExp(wording("room.label.chip_briefing")) }).first().click();

      const reading = short.locator("[data-briefing-reading]");

      await reading.waitFor({ timeout: 10_000 });
      await page.waitForTimeout(1_500);
      expect(await reading.locator("audio").evaluate((element: HTMLAudioElement) => ({ paused: element.paused, at: element.currentTime }))).toEqual({ paused: true, at: 0 });
      await reading.getByRole("button", { name: wording("common.action.play") }).click();
      await reading.waitFor({ state: "detached", timeout: 10_000 });

      // A reading the engine stopped is named so on its chip, and pressed it asks again.
      const stopped = page.locator('[data-message="m704"]');

      await stopped.getByRole("button", { name: wording("room.label.chip_briefing_stopped") }).click();
      await stopped.getByText(wording("briefing.status.making")).waitFor({ timeout: 10_000 });
      expect(asked).toEqual(["POST", "POST"]);
    } finally {
      await context.close();
    }
  }, 90_000);
});
