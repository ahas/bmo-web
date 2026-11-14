import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";
import { HIGH_ALBUM, HIGH_ANSWERED, HIGH_FILE, HIGH_FILE_WORDS, HIGH_LINE, HIGH_PICTURE, HIGH_ROOM, highWords } from "../support/high-room";

import type { Browser, BrowserContext, Page } from "playwright-core";

// A KakaoTalk-sized room (docs/web.md, 「A message's id」): its chat service numbers its messages past 2^53, so
// forty-five neighbours read as one or two JavaScript numbers (tests/support/high-room.ts). Read through the console's
// own routes against the harness's receiver, every row stands under its own message, a page further back is read
// before the first row held, a quote names and reaches the message it answers on the page before, a reaction and a
// reply land on the message they were made on, and the picture viewer walks the room's pictures by their ids. Every id
// of the line rounds to the same number, which reads back as the first message's, so a rounded id lands on that one
// rather than on the message meant. The harness keeps what a run sends, so a run of the file again on the same
// console reads its own words by what they say. It drives the
// console tests/support/browser-console.ts stands up; the suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "high-room", password: "fixture-password-2963" };

let browser: Browser | null = null;
let cookie = "";

const row = (id: string) => `[data-message="m${id}"]`;

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

async function roomContext(): Promise<BrowserContext> {
  const context = await browser!.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block", reducedMotion: "reduce" });
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

  return context;
}

// The room opened at its end, once its newest message stands.
async function openRoom(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();

  await page.goto(`${origin}/rooms/${HIGH_ROOM}`, { waitUntil: "load" });
  await page.locator(row(HIGH_LINE.at(-1)!)).waitFor({ timeout: 60_000 });

  return page;
}

// The message id each row of the feed stands for, top to bottom.
async function rowIds(page: Page): Promise<string[]> {
  return await page.locator("[data-message-id]").evaluateAll((rows) => rows.map((one) => one.getAttribute("data-message-id") ?? ""));
}

// The message's menu, opened by the pointer's second button on its bubble.
async function menuOn(page: Page, id: string): Promise<void> {
  await page.locator(`${row(id)} [data-bubble]`).first().click({ button: "right" });
  await page.getByRole("menuitem").first().waitFor({ timeout: 15_000 });
}

describe.skipIf(!origin || !touchReady())("a room numbered past 2^53", () => {
  test("stands each message under its own row, reads the page before its first row and opens at a message an address names", async () => {
    const context = await roomContext();

    try {
      const page = await openRoom(context);
      const opened = await rowIds(page);

      // Every row names a message of the line by its digits, each once, in the line's order and to its end.
      expect(new Set(opened).size).toBe(opened.length);
      expect(opened.every((id) => HIGH_LINE.includes(id) || BigInt(id) > BigInt(HIGH_LINE.at(-1)!))).toBe(true);
      expect(opened.filter((id) => HIGH_LINE.includes(id)).at(-1)).toBe(HIGH_LINE.at(-1));
      expect(opened).not.toContain(HIGH_LINE[0]);

      const scroller = await page.evaluateHandle((selector) => {
        let at: HTMLElement | null = document.querySelector(selector);

        while (at !== null && !/(auto|scroll)/.test(getComputedStyle(at).overflowY)) at = at.parentElement;

        return at!;
      }, row(HIGH_LINE.at(-1)!));
      const first = page.locator(row(HIGH_LINE[0]!));

      // Standing at the top reads the page before the first row, past an id a number could not hold.
      for (const end = Date.now() + 30_000; (await first.count()) === 0 && Date.now() < end; ) {
        await scroller.evaluate((element) => {
          element.scrollTop = 0;
        });
        await first.waitFor({ state: "attached", timeout: 1_000 }).catch(() => undefined);
      }

      const read = await rowIds(page);
      const line = read.filter((id) => HIGH_LINE.includes(id));

      // The album's second picture stands in its first's row.
      expect(line).toEqual(HIGH_LINE.filter((_, at) => at !== HIGH_ALBUM[1]));
      expect(new Set(read).size).toBe(read.length);

      // An address naming a message by its digits opens the room at that message.
      const named = HIGH_LINE[10]!;

      await page.goto(`${origin}/rooms/${HIGH_ROOM}?at=${named}`, { waitUntil: "load" });
      await page.locator(row(named)).waitFor({ state: "visible", timeout: 60_000 });
    } finally {
      await context.close();
    }
  }, 180_000);

  test("reaches a quoted message on the page before, and keeps a reaction and a reply on the message they name", async () => {
    const context = await roomContext();
    const answered = HIGH_LINE[HIGH_ANSWERED]!;

    try {
      const page = await openRoom(context);
      const quote = page.locator(`${row(HIGH_LINE.at(-1)!)} [data-quote]`);

      // The newest message answers one the opening page does not hold, quoted by what it said.
      await expect(quote.innerText()).resolves.toContain(highWords(HIGH_ANSWERED));
      await quote.click();
      await page.locator(row(answered)).waitFor({ state: "visible", timeout: 30_000 });

      // A reaction lands on the message it was made on and on none of its neighbours.
      await menuOn(page, answered);

      const choice = page.locator("[data-reaction-strip] button").first();
      const emoji = (await choice.innerText()).trim();

      await choice.click();
      await page.locator(`${row(answered)} [data-reaction="${emoji}"]`).waitFor({ timeout: 30_000 });
      expect(await page.locator(`${row(HIGH_LINE[HIGH_ANSWERED + 1]!)} [data-reaction]`).count()).toBe(0);
      expect(await page.locator(`${row(HIGH_LINE[HIGH_ANSWERED - 1]!)} [data-reaction]`).count()).toBe(0);

      // A reply goes out naming the message it answers, and the room read again stands it quoting that message.
      const newest = HIGH_LINE.at(-1)!;
      const words = `answering ${Date.now()}`;
      const fresh = await openRoom(context);

      await menuOn(fresh, newest);
      await fresh.getByRole("menuitem", { name: wording("room.action.reply") }).click();
      await fresh.locator("[data-reply-bar]").waitFor({ timeout: 15_000 });
      expect(await fresh.locator("[data-reply-bar]").innerText()).toContain(highWords(HIGH_LINE.length - 1));

      const box = fresh.locator("form textarea").first();
      const said = fresh.waitForResponse((answer) => answer.url().endsWith(`/api/rooms/${HIGH_ROOM}/say`) && answer.request().method() === "POST", { timeout: 60_000 });

      await box.fill(words);
      await box.press("Enter");
      expect((await said).ok()).toBe(true);

      await fresh.reload({ waitUntil: "load" });

      const reply = fresh.locator("[data-message-id]", { hasText: words });

      await reply.locator("[data-quote]").waitFor({ timeout: 60_000 });
      expect(await reply.locator("[data-quote]").innerText()).toContain(highWords(HIGH_LINE.length - 1));
    } finally {
      await context.close();
    }
  }, 180_000);

  test("opens a photo, walks the room's pictures from it and opens a kept file, each by its message's id", async () => {
    const context = await roomContext();

    try {
      const page = await openRoom(context);
      const pictured = HIGH_LINE[HIGH_PICTURE]!;

      await page.locator(`${row(pictured)} button img:not([data-stand-in])`).first().click();

      // The viewer reads the picture's place among the room's three and serves the picture by its message.
      const last = page.getByRole("dialog", { name: /3\/3$/ });

      await last.waitFor({ timeout: 30_000 });
      expect(await last.locator(`img[src$="/api/images/${HIGH_ROOM}/${pictured}"]`).count()).toBeGreaterThan(0);

      await page.keyboard.press("ArrowLeft");

      const before = page.getByRole("dialog", { name: /2\/3$/ });

      await before.waitFor({ timeout: 30_000 });

      // The picture the stand-in serves for that message is the one drawn.
      await page.waitForFunction(
        (selector) => [...document.querySelectorAll<HTMLImageElement>(selector)].some((image) => image.complete && image.naturalWidth > 0),
        `[role="dialog"] img[src$="/api/images/${HIGH_ROOM}/${HIGH_LINE[HIGH_ALBUM[1]!]}"]`,
        { timeout: 30_000 }
      );

      await page.keyboard.press("Escape");
      await before.waitFor({ state: "hidden", timeout: 30_000 });

      // A kept file is served by its message's digits, and the bytes the stand-in kept under them come back.
      const filed = HIGH_LINE[HIGH_FILE]!;
      const link = page.locator(`${row(filed)} a[download]`).first();
      const href = (await link.getAttribute("href")) ?? "";

      expect(href.endsWith(`/api/media/document/${HIGH_ROOM}/${filed}?item=0&as=download`)).toBe(true);

      const file = await page.request.get(new URL(href, origin).toString());

      expect(file.status()).toBe(200);
      expect(await file.text()).toBe(HIGH_FILE_WORDS);
    } finally {
      await context.close();
    }
  }, 180_000);
});
