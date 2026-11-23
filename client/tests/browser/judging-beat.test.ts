import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, BrowserContext } from "playwright-core";

// A person's message being judged breathes its bubble; judged or not, its line carries no verdict mark (docs/web.md, the room screen's verdicts).
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up, serves the
// room's page through the page's own route, and hands the live picture the bot's event stream carries, with the
// message queued for a turn while it is to be judged.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "judging-beat", password: "fixture-password-3146" };
const CHAT = -9_000_000_000_146;
const NOW = Math.floor(Date.now() / 1000);
const PHONE = { width: 360, height: 760 };

const MESSAGES = [
  { chatId: CHAT, messageId: "9301", sentAt: NOW, imagePath: null, replyToMessageId: null, senderId: 11, senderName: "person-a", text: "a question being judged", agent: false, round: null, drafts: null }
];
const JUDGED = [{ id: 601, chatId: CHAT, messageId: "9301", stage: "chat", verdict: "REPLY", createdAt: NOW + 2, round: "round-b" }];

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

// The bot's live picture, with the message queued for a turn or with nothing queued.
function live(queued: boolean): string {
  const picture = { at: NOW * 1000, compacting: [], turns: [], queued: queued ? [{ chatId: CHAT, messageId: "9301", since: NOW }] : [] };

  return `event: live\ndata: ${JSON.stringify(picture)}\n\n`;
}

async function open(judging: boolean, reducedMotion: "reduce" | "no-preference"): Promise<BrowserContext> {
  const context = await browser!.newContext({ viewport: PHONE, serviceWorkers: "block", reducedMotion, hasTouch: true, isMobile: true });
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
  await context.route(new RegExp(`/api/rooms/${CHAT}/messages(\\?|$)`), (route) =>
    route.fulfill({ json: { messages: MESSAGES, judgements: judging ? [] : JUDGED, hasMore: false } })
  );
  await context.route(new RegExp(`/api/rooms/${CHAT}/round-figures(\\?|$)`), (route) => route.fulfill({ json: { items: [] } }));
  await context.route(/\/api\/events(\?|$)/, (route) => route.fulfill({ status: 200, contentType: "text/event-stream", body: live(judging) }));

  return context;
}

describe.skipIf(!origin || !touchReady())("a message being judged", () => {
  test("breathes its bubble at a phone's width, says so to a screen reader and carries no mark", async () => {
    const context = await open(true, "no-preference");
    const page = await context.newPage();

    try {
      await page.goto(`${origin}/rooms/${CHAT}`, { waitUntil: "domcontentloaded" });

      const bubble = page.locator("[data-message] [data-bubble]").first();

      await bubble.waitFor({ timeout: 30_000 });
      const beat = bubble.locator("[data-beat]");

      await beat.waitFor({ timeout: 20_000 });

      // The ring breathes on a layer of its own under the bubble's words, so nothing inside the bubble moves.
      const ring = await beat.evaluate((node) => {
        const style = getComputedStyle(node);

        return { animation: style.animationName, events: style.pointerEvents };
      });

      expect(ring).toEqual({ animation: "bubble-breathe", events: "none" });

      // The layer carries the bubble's tail grown by the ring's width round its outer edges, so the ring runs round
      // the bubble and its tail as one shape, to within layout's own rounding.
      const reach = await beat.evaluate((node) => {
        const width = parseFloat(getComputedStyle(node).getPropertyValue("--bubble-beat-width"));
        const tail = node.parentElement!.querySelector(":scope > .bubble-tail")!.getBoundingClientRect();
        const grown = node.querySelector(".bubble-tail-grown")!.getBoundingClientRect();
        const outward = tail.left - grown.left > 0 ? tail.left - grown.left : grown.right - tail.right;

        return { outward: outward - width, under: grown.bottom - tail.bottom - width, top: grown.top - tail.top };
      });

      for (const gap of Object.values(reach)) expect(Math.abs(gap)).toBeLessThan(0.05);
      expect(await page.locator("[data-message] [data-judging]").first().textContent()).toBe(wording("room.label.chip_verdicts_judging"));
      expect(await page.locator("[data-message] [data-verdict-mark]").count()).toBe(0);

      // The beat lies over nothing a finger reaches: the message's words still take the press.
      const box = (await bubble.boundingBox())!;
      const under = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest("[data-bubble]") !== null, { x: box.x + box.width / 2, y: box.y + box.height / 2 });

      expect(under).toBe(true);
    } finally {
      await context.close();
    }
  }, 120_000);

  test("stands still for a reader who asked for less movement", async () => {
    const context = await open(true, "reduce");
    const page = await context.newPage();

    try {
      await page.goto(`${origin}/rooms/${CHAT}`, { waitUntil: "domcontentloaded" });

      const beat = page.locator("[data-message] [data-bubble] [data-beat]").first();

      await beat.waitFor({ timeout: 30_000 });
      expect(await beat.evaluate((node) => getComputedStyle(node).animationName)).toBe("none");
    } finally {
      await context.close();
    }
  }, 120_000);

  test("once judged, stands still and carries no mark", async () => {
    const context = await open(false, "no-preference");
    const page = await context.newPage();

    try {
      await page.goto(`${origin}/rooms/${CHAT}`, { waitUntil: "domcontentloaded" });
      await page.locator("[data-message] [data-bubble]").first().waitFor({ timeout: 30_000 });

      expect(await page.locator("[data-message] [data-verdict-mark]").count()).toBe(0);

      expect(await page.locator("[data-message] [data-beat]").count()).toBe(0);
      expect(await page.locator("[data-message] [data-judging]").count()).toBe(0);
    } finally {
      await context.close();
    }
  }, 120_000);
});
