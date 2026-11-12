import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, BrowserContext, Page } from "playwright-core";

// A brain memory opened from the brain reads of a message's record opens on its words with the show-translation line above
// them, and the gate's reading takes the words' place when it is pressed, the show-original press putting them back
// (docs/web.md, 「The original, and its translation in its place」). Nothing is asked until the press; where the
// translator answers too busy the line says so.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up, and serves the
// round's reads, the piece, and the translator through the page's own routes.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "brain-translation", password: "fixture-password-2355" };
const CHAT = -9_000_000_000_099;
const NOW = 1_800_000_000_000;
const WORDS = "The room promised to check the logs at dawn.";
const READING = "The logs are to be checked at dawn, as the room promised.";

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
  drafts: { round: "round-a", asked: 0, end: "message", reads: [{ path: "memories/42", holds: null, how: "attached", memoryId: 7 }] }
};

// What the answer's round did, read after the page as the room reads every round's figures: the agent whose brain
// the piece is read from.
const FIGURES = {
  items: [
    {
      messageId: MESSAGE.messageId,
      round: MESSAGE.round,
      spend: null,
      actions: { agent: "agent-a", runs: [], documents: 0, held: 0, tools: 0, brain: 1, records: [] }
    }
  ]
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

// The message's one record button, which carries the brain mark among its own (docs/web.md, the room screen's chip
// line), spread on the round's reads, and the piece among them opened in its modal.
async function openPiece(page: Page): Promise<void> {
  const record = page.locator("[data-message]").getByRole("button", { name: new RegExp(wording("room.label.chip_record")) });

  await record.filter({ has: page.locator("[data-record-brain]") }).first().click();
  await page.locator("[data-brain-reads] button").first().click();
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

  // These tests drive the press, so the browser's auto translation is off (docs/web.md, 「The original, and its translation
  // in its place」).
  await context.addCookies([
    { name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! },
    { name: "console_auto_translate", value: "false", url: origin! }
  ]);
  await context.route(new RegExp(`/api/rooms/${CHAT}/messages(\\?|$)`), (route) => route.fulfill({ json: { messages: [MESSAGE], judgements: [], hasMore: false } }));
  await context.route(new RegExp(`/api/rooms/${CHAT}/round-figures(\\?|$)`), (route) => route.fulfill({ json: FIGURES }));
  // The round asked its draft process nothing, so the rows the record reads as it first opens are none.
  await context.route(new RegExp(`/api/rooms/${CHAT}/drafts(\\?|$)`), (route) => route.fulfill({ json: { rows: [] } }));
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

        await openPiece(page);
        await page.locator("[data-brain-read-text]").waitFor({ timeout: 20_000 });

        // It opens on the words as the brain keeps them, the line above them asking nothing until it is pressed.
        expect((await page.locator("[data-brain-read-text]").innerText()).trim()).toBe(WORDS);

        // Pressed, the reading takes the words' place, and the show-original press puts them back.
        await page.locator("[data-reading-translate]").click();
        await page.locator("[data-reading-original]").waitFor({ timeout: 20_000 });
        expect((await page.locator("[data-brain-read-text]").innerText()).trim()).toBe(READING);
        await page.locator("[data-reading-original]").click();
        expect((await page.locator("[data-brain-read-text]").innerText()).trim()).toBe(WORDS);
        await page.screenshot({ path: `/tmp/brain-translation-${width}.png` });
      } finally {
        await context.close();
      }
    }, 120_000);
  }

  test("say on the line that the translator is too busy, the words standing", async () => {
    const context = await open(1280, 900, "busy");
    const page = await context.newPage();

    try {
      await page.goto(`${origin}/rooms/${CHAT}`, { waitUntil: "domcontentloaded" });
      await page.locator("[data-message]").first().waitFor({ timeout: 30_000 });
      await openPiece(page);
      await page.locator("[data-reading-translate]").waitFor({ timeout: 20_000 });

      await page.locator("[data-reading-translate]").click();
      // The line says the translator is too busy, with a retry, and the words stand as they were.
      await page.locator("[data-reading] [role=alert]").waitFor({ timeout: 30_000 });
      expect(await page.locator("[data-reading] [role=alert]").innerText()).toContain(wording("common.status.translation_busy"));
      expect((await page.locator("[data-brain-read-text]").innerText()).trim()).toBe(WORDS);
    } finally {
      await context.close();
    }
  }, 120_000);
});
