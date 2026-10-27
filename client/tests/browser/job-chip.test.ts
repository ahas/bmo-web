import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, BrowserContext, Page } from "playwright-core";
import type { LiveRun, StatusView } from "../../apps/web/shared/types";

// The line of what runs beside the chat keeps its place, and the conversation above it never moves with it
// (docs/web.md, 「Motion」 and the room screen's section on what else runs for the room): a job handing over to the
// next one must not blink the line away, and the row the line stands in keeps its height whether the line stands
// or not, so a reader scrolled to the end is not carried up and down.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up. The console's
// status answers three jobs of the record room for a stretch, then none for a stretch, then three again, and the
// room's stream is fed a job event each time it opens, so the screen reads the change as it does in use.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "job-chip", password: "fixture-password-2300" };
const RECORD_CHAT = -9_000_000_000_099;
// When this run's stretches begin: the jobs stand for a while, then none for a longer while, then stand again.
let STARTED = Date.now();

// Three jobs of the record room, as the console's own status pictures them.
function jobs(): LiveRun[] {
  return [1, 2, 3].map((id) => ({
    id,
    kind: "worker",
    agent: "worker-a",
    chatId: RECORD_CHAT,
    messageId: null,
    startedAt: Math.floor(STARTED / 1000) - 60,
    unit: `job-${id}`,
    capSeconds: null,
    depth: null,
    model: null,
    startedBy: null,
    todoId: null,
    progress: null
  }));
}

// Whether the jobs stand now: three for the first stretch, none for the second, three after it.
function standing(): boolean {
  const elapsed = Date.now() - STARTED;

  return elapsed < 7_000 || elapsed > 20_000;
}

// The conversation as the console's own message read answers it: thirty rows, so the feed overflows a phone and a
// reader can stand at its end.
const PAGE = {
  messages: Array.from({ length: 30 }, (_, index) => ({
    messageId: index + 1,
    chatId: RECORD_CHAT,
    senderId: 1,
    senderName: "owner",
    sentAt: Math.floor(STARTED / 1000) - 3_000 + index * 10,
    text: `record ${index + 1}`,
    imagePath: null,
    replyToMessageId: null,
    attachments: [],
    expressions: [],
    editedAt: null,
    deletedAt: null,
    pinnedAt: null,
    reactions: []
  })),
  judgements: [],
  hasMore: false
};

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
  STARTED = Date.now();

  const context = await browser!.newContext({ viewport: { width, height }, serviceWorkers: "block", reducedMotion: "reduce" });
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

  await context.route(/\/api\/status$/, async (route) => {
    const status = (await (await route.fetch()).json()) as StatusView;

    await route.fulfill({ json: { ...status, live: standing() ? jobs() : [] } });
  });
  await context.route(new RegExp(`/api/rooms/${RECORD_CHAT}/messages(\\?|$)`), (route) => route.fulfill({ json: PAGE }));
  // A job event each time the room's stream opens, so the screen reads the status again as it does on the agency's news;
  // the answered stream then ends, and the console opens it anew.
  await context.route(/\/api\/events(\?|$)/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1_000));

    const event = JSON.stringify({ id: 1, at: Math.floor(Date.now() / 1000), type: "worker-run", chatId: RECORD_CHAT, messageId: null });

    await route.fulfill({ status: 200, headers: { "content-type": "text/event-stream", "cache-control": "no-cache" }, body: `event: bot\ndata: ${event}\n\n` });
  });

  return context;
}

// The feed's scroll box, its offset, and the row the line stands in.
async function feed(page: Page): Promise<{ scrollTop: number; workHeight: number; lastRowTop: number }> {
  return await page.evaluate(() => {
    const row = document.querySelector("[data-message]");
    let box: HTMLElement | null = row?.parentElement ?? null;

    while (box !== null) {
      const style = getComputedStyle(box);

      if (/(auto|scroll)/.test(style.overflowY)) break;

      box = box.parentElement;
    }

    const work = document.querySelector<HTMLElement>("[data-work-row]");
    const last = document.querySelector("[data-message]:last-of-type") as HTMLElement | null;

    return {
      scrollTop: box?.scrollTop ?? -1,
      workHeight: Math.round(work?.getBoundingClientRect().height ?? -1),
      lastRowTop: Math.round(last?.getBoundingClientRect().top ?? -1)
    };
  });
}

// Waits for the line to stand or not, as the stretches of the status say.
async function lineStands(page: Page, stands: boolean, timeoutMs: number): Promise<boolean> {
  const ended = Date.now() + timeoutMs;

  while (Date.now() < ended) {
    const count = await page.locator("[data-work-row] button").count();

    if ((count > 0) === stands) return true;

    await page.waitForTimeout(200);
  }

  return false;
}

describe.skipIf(!origin || !touchReady())("the line of what runs beside the chat", () => {
  for (const { width, height } of [{ width: 1280, height: 900 }, { width: 360, height: 700 }]) {
    test(`keeps its row and the conversation's place as the jobs come and go at ${width}`, async () => {
      const context = await open(width, height);
      const page = await context.newPage();

      try {
        await page.goto(`${origin}/rooms/${RECORD_CHAT}`, { waitUntil: "domcontentloaded" });
        await page.locator("[data-message]").first().waitFor({ timeout: 30_000 });
        await page.locator("[data-work-row] button").first().waitFor({ timeout: 30_000 });

        // A reader at the end of the conversation.
        await page.evaluate(() => {
          const row = document.querySelector("[data-message]");
          let box: HTMLElement | null = row?.parentElement ?? null;

          while (box !== null) {
            const style = getComputedStyle(box);

            if (/(auto|scroll)/.test(style.overflowY)) break;

            box = box.parentElement;
          }

          if (box !== null) box.scrollTop = box.scrollHeight;
        });
        await page.waitForTimeout(300);

        const started = await feed(page);

        expect(started.workHeight).toBeGreaterThan(0);

        // The jobs go: the line goes once the settle window passes, and nothing above it moves.
        expect(await lineStands(page, false, 20_000)).toBe(true);

        const without = await feed(page);

        expect(without.workHeight).toBe(started.workHeight);
        expect(without.scrollTop).toBe(started.scrollTop);
        expect(without.lastRowTop).toBe(started.lastRowTop);

        // And come back: the line returns, and nothing above it has moved.
        expect(await lineStands(page, true, 20_000)).toBe(true);

        const again = await feed(page);

        expect(again.workHeight).toBe(started.workHeight);
        expect(again.scrollTop).toBe(started.scrollTop);
        expect(again.lastRowTop).toBe(started.lastRowTop);
      } finally {
        await context.close();
      }
    }, 120_000);
  }
});
