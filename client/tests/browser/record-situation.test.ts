import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, BrowserContext, Page } from "playwright-core";

// The situation note an answer's record stands as its round read it (docs/web.md, 「A round's situation note stands in
// its answer's record」) carries the translation line of a text read in the reader's language, at a phone's width and
// a desktop's: it opens as written, the line's press puts the reading in its place, and the show-original press puts
// the note back. Nothing stands over the press, and the note stays inside the screen.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up, and serves the
// room's page, its round's verdicts and the translator through the page's own routes.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "record-verdicts", password: "fixture-password-3145" };
const CHAT = -9_000_000_000_132;
const NOW = 1_800_000_000;
const NOTE = "The person asked for the release notes and is waiting on the second part.";
const READING = "A reading of the note in the reader's language.";

const message = (messageId: string, fields: Record<string, unknown>) => ({ chatId: CHAT, messageId, sentAt: NOW, imagePath: null, replyToMessageId: null, ...fields });

// A person's question, judged under the note, and the answer its round sent.
const MESSAGES = [
  message("9301", { senderId: 11, senderName: "person-a", text: "the question", agent: false, round: null, drafts: null, situation: { text: NOTE, changed: true } }),
  message("9302", { senderId: 0, senderName: "agent-a", sentAt: NOW + 20, text: "the answer", agent: true, round: "round-b", drafts: null })
];
const mark = (id: number, messageId: string, stage: string, verdict: string, createdAt: number) => ({ id, chatId: CHAT, messageId, stage, verdict, createdAt, round: "round-b" });
const MARKS = [mark(601, "9301", "chat", "REPLY", NOW + 15), mark(602, "9301", "people-search", "SKIP: no candidates", NOW + 5), mark(603, "9302", "send", "SENT", NOW + 21)];

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

async function open(width: number, height: number, phone: boolean): Promise<BrowserContext> {
  const context = await browser!.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, serviceWorkers: "block", reducedMotion: "reduce" });
  const at = cookie.indexOf("=");

  // The press is what this test drives, so the browser's own translation is off.
  await context.addCookies([
    { name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! },
    { name: "console_auto_translate", value: "false", url: origin! }
  ]);
  await context.route(new RegExp(`/api/rooms/${CHAT}/messages(\\?|$)`), (route) => route.fulfill({ json: { messages: MESSAGES, judgements: MARKS, hasMore: false } }));
  await context.route(new RegExp(`/api/rooms/${CHAT}/round-figures(\\?|$)`), (route) => route.fulfill({ json: { items: [] } }));
  await context.route(new RegExp(`/api/rooms/${CHAT}/judgements\\?`), (route) =>
    route.fulfill({ json: { judgements: MARKS.map((one) => ({ ...one, detail: null, ms: 1_200, roads: [] })) } })
  );
  await context.route(/\/api\/translations$/, (route) => route.fulfill({ json: { readings: [{ text: READING, whole: true }] } }));

  return context;
}

// Whether the element's middle is what a finger there reaches, nothing standing over it.
async function reachable(page: Page, selector: string): Promise<boolean> {
  return await page.locator(selector).first().evaluate((element) => {
    const box = element.getBoundingClientRect();
    const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);

    return top !== null && (top === element || element.contains(top));
  });
}

describe.skipIf(!origin || !touchReady())("the situation note in an answer's record", () => {
  for (const [width, height, phone] of [[360, 780, true], [1280, 900, false]] as const) {
    test(`opens as written and is read in the reader's language by the line's press, at ${width}`, async () => {
      const context = await open(width, height, phone);
      const page = await context.newPage();

      try {
        await page.goto(`${origin}/rooms/${CHAT}`, { waitUntil: "domcontentloaded" });
        await page.locator("[data-message]").first().waitFor({ timeout: 30_000 });
        await page.waitForFunction(() => {
          const root: (Element & { __vue_app__?: { $nuxt?: { isHydrating?: boolean } } }) | null = document.querySelector("#__nuxt");

          return root?.__vue_app__?.$nuxt?.isHydrating === false;
        }, undefined, { timeout: 60_000 });
        await page.locator("[data-record-chip]").first().click();

        const note = page.locator("[data-record] [data-situation] [data-situation-note]");

        await note.waitFor({ timeout: 20_000 });
        expect((await note.innerText()).trim()).toBe(NOTE);

        // The note stays inside the screen however it wraps.
        const box = await note.boundingBox();

        expect(box !== null && box.x >= 0 && box.x + box.width <= width + 1).toBe(true);

        const translate = "[data-record] [data-situation] [data-reading-translate]";

        await page.locator(translate).scrollIntoViewIfNeeded();
        expect(await reachable(page, translate)).toBe(true);
        await page.locator(translate).click();

        const original = page.locator("[data-record] [data-situation] [data-reading-original]");

        await original.waitFor({ timeout: 20_000 });
        expect((await note.innerText()).trim()).toBe(READING);
        await original.click();
        expect((await note.innerText()).trim()).toBe(NOTE);
      } finally {
        await context.close();
      }
    }, 120_000);
  }
});
