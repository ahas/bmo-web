import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";

import type { Browser, BrowserContext, Locator, Page } from "playwright-core";
import type { ArchivedMessage } from "../../apps/web/shared/types";

// A room's write controls follow the rooms section's write (docs/web.md, 「Access」): a member whose section writes
// meets the box to write in and sends a line from it, and one whose section only reads keeps the read-only screen
// with the conversation alone. The console is the one in BMO_CONSOLE_TEST_URL, whose fixture the two member logins
// and their sections are, and the room is a fixture served through the page's own routes; the suite stands up no
// console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const WRITER = { name: "room-writer", password: "fixture-password-2401" };
const READER = { name: "room-reader", password: "fixture-password-2402" };
const ROOM = 43;
const EARLIER: ArchivedMessage = {
  chatId: ROOM, messageId: "9500", senderId: 7, senderName: "person-b", sentAt: Math.floor(Date.now() / 1000) - 600,
  text: "said before", imagePath: null, replyToMessageId: null
};
const LINE = "written from the box";

let browser: Browser | null = null;

beforeAll(async () => {
  if (!origin || !touchReady()) return;

  browser = await chromium.launch();
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();
}, BROWSER_HOOK_MS);

// A page standing in a member's login, with the room's message page served as a fixture and every line sent
// gathered into `said`.
async function roomOf(
  account: { name: string; password: string },
  said: string[],
  viewport: { width: number; height: number } = { width: 1280, height: 900 }
): Promise<BrowserContext> {
  const login = await fetch(`${origin}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(account)
  });

  expect(login.ok).toBe(true);

  const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
  const at = cookie.indexOf("=");
  const context = await browser!.newContext({ viewport, serviceWorkers: "block", reducedMotion: "reduce" });

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
  await context.route(/\/api\/control$/, (route) => route.fulfill({ json: { reachable: true, ownerChatId: 42 } }));
  await context.route(new RegExp(`/api/rooms/${ROOM}/messages(\\?|$)`), (route) =>
    route.fulfill({ json: { messages: [EARLIER], judgements: [], hasMore: false } })
  );
  await context.route(new RegExp(`/api/rooms/${ROOM}/say$`), (route) => {
    said.push(String((route.request().postDataJSON() as { text?: unknown }).text ?? ""));

    return route.fulfill({ json: { messageId: "9501" } });
  });
  await context.route(new RegExp(`/api/rooms/${ROOM}/answerers$`), (route) =>
    route.fulfill({ json: { default: "", voice: null, agents: [] } })
  );

  return context;
}

async function open(context: BrowserContext): Promise<{ page: Page; box: Locator }> {
  const page = await context.newPage();

  await page.goto(`${origin}/rooms/${ROOM}`, { waitUntil: "load" });
  await page.locator(`[data-message="m${EARLIER.messageId}"]`).waitFor({ timeout: 60_000 });

  return { page, box: page.locator("form textarea").first() };
}

describe.skipIf(!origin || !touchReady())("a room's write controls", () => {
  test("stand for a member whose rooms section writes, and send a line from the box", async () => {
    const said: string[] = [];
    // A phone held upright, the viewport the design rules name, since the box is the new thing on this screen.
    const context = await roomOf(WRITER, said, { width: 360, height: 780 });

    try {
      const { page, box } = await open(context);

      await box.waitFor({ timeout: 60_000 });
      // The input bar is the one foot of the room besides the band its typing picture floats in.
      expect(await page.locator("[data-screen-foot]:not([data-typing-band])").count()).toBe(1);

      await box.fill(LINE);
      await box.press("Enter");

      for (let waited = 0; said.length === 0 && waited < 30_000; waited += 100) await Bun.sleep(100);

      expect(said).toEqual([LINE]);

      // The acts on a message are writes of the room too, so the answer stands in its menu.
      await page.locator(`[data-message="m${EARLIER.messageId}"] [data-bubble]`).click({ button: "right" });
      await page.getByRole("menuitem", { name: wording("room.action.reply") }).waitFor({ timeout: 15_000 });
      await page.keyboard.press("Escape");
    } finally {
      await context.close();
    }
  }, 180_000);

  test("are absent for a member whose rooms section only reads, with the conversation still read", async () => {
    const said: string[] = [];
    const context = await roomOf(READER, said);

    try {
      const { page, box } = await open(context);

      expect(await page.locator(`[data-message="m${EARLIER.messageId}"]`).count()).toBe(1);
      expect(await box.count()).toBe(0);
      expect(await page.locator("[data-screen-foot]:not([data-typing-band])").count()).toBe(0);
      expect(said).toEqual([]);

      // The menu still copies and chooses, and offers none of the writes.
      await page.locator(`[data-message="m${EARLIER.messageId}"] [data-bubble]`).click({ button: "right" });
      await page.getByRole("menuitem").first().waitFor({ timeout: 15_000 });
      expect(await page.getByRole("menuitem", { name: wording("room.action.reply") }).count()).toBe(0);
      await page.keyboard.press("Escape");
    } finally {
      await context.close();
    }
  }, 180_000);
});
