import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, BrowserContext } from "playwright-core";

// A voice note's bubble (docs/web.md, the room screen's sound messages): the recording's length beside its player, the
// words heard in it under the player, and one line where it could not be heard. It drives the console given in
// BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up, serving the room's messages through the page's
// own route.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "voice-transcript", password: "fixture-password-2361" };
const CHAT = -9_000_000_000_099;
const NOW = 1_800_000_000_000;

function voice(messageId: number, over: Record<string, unknown>): Record<string, unknown> {
  return {
    chatId: CHAT,
    messageId: String(messageId),
    senderId: 1,
    senderName: "owner",
    sentAt: NOW - messageId,
    text: "",
    imagePath: null,
    replyToMessageId: null,
    agent: false,
    attachments: [{ id: 0, kind: "audio", name: "voice.ogg", bytes: 1_024, type: "audio/ogg", available: true }],
    transcript: null,
    voiceSeconds: null,
    voiceState: null,
    ...over
  };
}

const HEARD = voice(9_201, { transcript: "the deploy is held until dawn", voiceSeconds: 7, voiceState: "heard" });
const FAILED = voice(9_202, { voiceSeconds: 4, voiceState: "failed" });

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

async function open(width: number, height: number): Promise<BrowserContext> {
  const context = await browser!.newContext({ viewport: { width, height }, serviceWorkers: "block", reducedMotion: "reduce" });
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
  await context.route(new RegExp(`/api/rooms/${CHAT}/messages(\\?|$)`), (route) => route.fulfill({ json: { messages: [HEARD, FAILED], judgements: [], hasMore: false } }));

  return context;
}

describe.skipIf(!origin || !touchReady())("a voice note's bubble", () => {
  for (const [width, height] of [[1280, 900], [360, 780]] as const) {
    test(`stands the length, the words and the failed line at ${width}`, async () => {
      const context = await open(width, height);
      const page = await context.newPage();

      try {
        await page.goto(`${origin}/rooms/${CHAT}`, { waitUntil: "domcontentloaded" });
        await page.locator("[data-transcript]").waitFor({ timeout: 30_000 });

        expect((await page.locator("[data-transcript]").first().innerText()).trim()).toBe("the deploy is held until dawn");
        expect(await page.locator("[data-voice-seconds]").first().innerText()).toBe("00:07");
        await page.locator("[data-voice-failed]").waitFor({ timeout: 10_000 });
        expect((await page.locator("[data-voice-failed]").first().innerText()).trim()).toBe(wording("room.label.voice_failed"));
        expect(await page.locator("[data-transcript]").count()).toBe(1);
        await page.screenshot({ path: `/tmp/voice-transcript-${width}.png` });
      } finally {
        await context.close();
      }
    }, 120_000);
  }
});
