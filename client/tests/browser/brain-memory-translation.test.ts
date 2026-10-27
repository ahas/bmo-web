import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, BrowserContext } from "playwright-core";

// A brain memory opened from a room's brain chip carries a translate action, and the gate's reading of the words stands
// under the original (docs/web.md, the translated texts section). The action asks nothing until it is pressed; where the
// translator answers too busy it stands disabled, saying why.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up, and serves the
// round's reads, the piece, and the translator through the page's own routes.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "brain-translation", password: "fixture-password-2355" };
const CHAT = -9_000_000_000_099;
const NOW = 1_800_000_000_000;
const WORDS = "The room promised to check the logs at dawn.";
const READING = "The logs are to be checked at dawn, as the room promised.";

const label = wording("room.label.chip_brain");

const MESSAGE = {
  chatId: CHAT,
  messageId: 9_101,
  senderId: 0,
  senderName: "agent-a",
  sentAt: NOW - 1_000,
  text: "the answer",
  imagePath: null,
  replyToMessageId: null,
  agent: true,
  round: "round-a",
  drafts: { round: "round-a", asked: 0, end: "message", reads: [{ path: "memories/42", holds: null, how: "attached", memoryId: 7 }] },
  actions: { agent: "agent-a", runs: [], documents: 0, held: 0, tools: 0, brain: 1, records: [] }
};

const PIECE = {
  path: "memories/42",
  memory: { id: 7, brainId: 1, key: "log-promise", type: "promise", layer: null, subjects: [], writtenAt: NOW - 5_000, text: WORDS }
};

// Whether what is read comes to hold within the time given.
async function until<T>(read: () => Promise<T>, holds: (value: T) => boolean, ms = 10_000): Promise<T> {
  const end = Date.now() + ms;
  let value = await read();

  while (!holds(value) && Date.now() < end) {
    await Bun.sleep(150);
    value = await read();
  }

  return value;
}

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

// A room whose one round read the memory, with the translator's answer as this case needs it.
async function open(width: number, height: number, translator: "reads" | "busy"): Promise<BrowserContext> {
  const context = await browser!.newContext({ viewport: { width, height }, serviceWorkers: "block", reducedMotion: "reduce" });
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
  await context.route(new RegExp(`/api/rooms/${CHAT}/messages(\\?|$)`), (route) => route.fulfill({ json: { messages: [MESSAGE], judgements: [], hasMore: false } }));
  await context.route(new RegExp(`/api/rooms/${CHAT}/brain-piece(\\?|$)`), (route) => route.fulfill({ json: PIECE }));
  await context.route(/\/api\/translations$/, (route) =>
    translator === "reads"
      ? route.fulfill({ json: { readings: [{ text: READING, whole: true }] } })
      : route.fulfill({ status: 503, json: { statusCode: 503, statusMessage: "busy" } })
  );

  return context;
}

describe.skipIf(!origin || !touchReady())("a brain memory's words", () => {
  for (const [width, height] of [[1280, 900], [360, 780]] as const) {
    test(`are translated by the action, and the reading stands under them, at ${width}`, async () => {
      const context = await open(width, height, "reads");
      const page = await context.newPage();

      try {
        await page.goto(`${origin}/rooms/${CHAT}`, { waitUntil: "domcontentloaded" });
        await page.locator("[data-message]").first().waitFor({ timeout: 30_000 });

        // The brain chip spreads the round's reads, and the piece opens its modal.
        await page.locator(`[data-message] button[aria-label*="${label}"]`).first().click();
        await page.locator("[data-brain-reads] button").first().click();
        await page.locator("[data-brain-read-text]").waitFor({ timeout: 20_000 });

        // Nothing was asked before the press.
        expect(await page.locator("[data-brain-read-translation]").count()).toBe(0);

        await page.locator("[data-brain-translate]").click();
        await page.locator("[data-brain-read-translation]").waitFor({ timeout: 20_000 });

        expect((await page.locator("[data-brain-read-text]").innerText()).trim()).toBe(WORDS);
        expect((await page.locator("[data-brain-read-translation]").innerText()).trim()).toBe(READING);
        await page.screenshot({ path: `/tmp/brain-translation-${width}.png` });
      } finally {
        await context.close();
      }
    }, 120_000);
  }

  test("stand disabled, saying why, where the translator answers too busy", async () => {
    const context = await open(1280, 900, "busy");
    const page = await context.newPage();

    try {
      await page.goto(`${origin}/rooms/${CHAT}`, { waitUntil: "domcontentloaded" });
      await page.locator("[data-message]").first().waitFor({ timeout: 30_000 });
      await page.locator(`[data-message] button[aria-label*="${label}"]`).first().click();
      await page.locator("[data-brain-reads] button").first().click();
      await page.locator("[data-brain-translate]").waitFor({ timeout: 20_000 });

      await page.locator("[data-brain-translate]").click();
      await page.waitForFunction(() => document.querySelector("[data-brain-translate]")?.hasAttribute("disabled") === true, undefined, { timeout: 30_000 });
      expect(await page.locator("[data-brain-translate]").getAttribute("disabled")).not.toBeNull();
      // The reason it cannot ask stands on the wrapper the tooltip hangs from.
      expect(await page.locator("[data-brain-translate-holder]").count()).toBe(1);
    } finally {
      await context.close();
    }
  }, 120_000);
});
