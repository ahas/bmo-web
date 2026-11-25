import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, BrowserContext, Page } from "playwright-core";
import type { ArchivedMessage } from "../../apps/web/shared/types";

// The conversation's end stands the same step above the input bar in every room (docs/web.md, 「Presence and
// typing」, where the typing band stands): the owner's own private chat, a group room and a room on a chat service,
// with the same line said in each, read at its end at a desk's width and a phone's. Nobody writes, so no typing
// picture stands, and the space between the newest message's foot and the input bar's top edge is the same in all
// three; a room where somebody writes makes room for the picture alone while it stands.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up, whose
// owner's chat is room 42, and serves each room's line and the stream through the page's own routes; the suite stands
// up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "room-bottom", password: "fixture-password-3188" };
const OWNER_CHAT = 42;
const ROOMS = [
  { kind: "owner's private chat", chat: OWNER_CHAT },
  { kind: "group room", chat: 44 },
  { kind: "chat service room", chat: -9_002_000_000_002 }
] as const;
const WIDTHS = [
  { width: 1280, height: 800, phone: false },
  { width: 360, height: 780, phone: true }
] as const;
const WRITER = 7701;

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

// The same line in every room: enough of it that the conversation scrolls at both widths.
function lineOf(chat: number): ArchivedMessage[] {
  const now = Math.floor(Date.now() / 1000);

  return Array.from({ length: 24 }, (_, at) => ({
    chatId: chat, messageId: String(9_600 + at), senderId: at % 2 === 0 ? 7 : 1, senderName: at % 2 === 0 ? "person-b" : "owner",
    sentAt: now - 2_400 + at * 60, text: `words said in the room, line ${at + 1}`, imagePath: null, replyToMessageId: null
  }));
}

function streamOf(chat: number, writing: boolean): string {
  const run = `event: run\ndata: ${JSON.stringify({ run: "bottom-run" })}\n\n`;

  if (!writing) return run;

  const mark = { id: null, at: 1, type: "typing", chatId: chat, messageId: null, who: { kind: "person", via: "chat-a", personId: WRITER }, on: true, lastsMs: null };

  return `${run}event: bot\ndata: ${JSON.stringify(mark)}\n\n`;
}

async function contextOf(viewport: (typeof WIDTHS)[number], chat: number, writing: boolean): Promise<BrowserContext> {
  const context = await browser!.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.phone,
    hasTouch: viewport.phone,
    serviceWorkers: "block",
    reducedMotion: "reduce",
    locale: "ko-KR"
  });
  const at = cookie.indexOf("=");
  let served = false;

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
  await context.route(/\/api\/control$/, (route) => route.fulfill({ json: { reachable: true, ownerChatId: OWNER_CHAT } }));
  // The stream is served once; the tab's next open is left waiting, so a mark it handed stands while it is measured.
  await context.route(/\/api\/events(\?|$)/, async (route) => {
    if (served) return;

    served = true;
    await route.fulfill({ status: 200, contentType: "text/event-stream", body: streamOf(chat, writing) });
  });
  await context.route(new RegExp(`/api/rooms/${chat}/messages(\\?|$)`), (route) =>
    route.fulfill({ json: { messages: lineOf(chat), judgements: [], hasMore: false } })
  );
  await context.route(new RegExp(`/api/rooms/${chat}/members$`), (route) =>
    route.fulfill({ json: { members: [{ person: WRITER, name: "agent-b", status: null, account: null, inConsole: false }], chatMembers: "listed", entry: { letIn: false, takeOut: false } } })
  );

  return context;
}

type Bottom = {
  // From the newest message's foot to the input bar's top edge.
  space: number;
  // The typing band's height as drawn, zero where it stands not at all.
  band: number;
  picture: boolean;
};

async function bottomOf(page: Page, chat: number, writing: boolean): Promise<Bottom> {
  await page.goto(`${origin}/rooms/${chat}`, { waitUntil: "load" });
  await page.locator(`[data-message="m${9_623}"]`).waitFor({ timeout: 60_000 });
  await page.locator("form textarea").first().waitFor({ timeout: 60_000 });

  if (writing) await page.locator("[data-typing-picture]").waitFor({ timeout: 30_000 });

  // The conversation read at its end, settled over two frames after the last scroll.
  for (let round = 0; round < 3; round += 1) {
    await page.evaluate(
      async () =>
        await new Promise<void>((settled) => {
          let at: HTMLElement | null = document.querySelector("[data-message]");

          while (at !== null && !/(auto|scroll)/.test(getComputedStyle(at).overflowY)) at = at.parentElement;
          at?.scrollTo({ top: at.scrollHeight, behavior: "instant" });
          requestAnimationFrame(() => requestAnimationFrame(() => settled()));
        })
    );
    await Bun.sleep(200);
  }

  return await page.evaluate(() => {
    const newest = [...document.querySelectorAll<HTMLElement>("[data-message]")].at(-1)!;
    const foot = document.querySelector<HTMLElement>("[data-screen-foot]:not([data-typing-band])")!;
    const band = document.querySelector<HTMLElement>("[data-typing-band]");
    const picture = document.querySelector<HTMLElement>("[data-typing-picture]");

    return {
      space: Math.round(foot.getBoundingClientRect().top - newest.getBoundingClientRect().bottom),
      band: band === null ? 0 : Math.round(band.getBoundingClientRect().height),
      picture: picture !== null && getComputedStyle(picture).display !== "none"
    };
  });
}

async function measured(viewport: (typeof WIDTHS)[number], chat: number, writing: boolean): Promise<Bottom> {
  const context = await contextOf(viewport, chat, writing);

  try {
    return await bottomOf(await context.newPage(), chat, writing);
  } finally {
    await context.close();
  }
}

describe.skipIf(!origin || !touchReady())("the space under a room's newest message", () => {
  for (const viewport of WIDTHS) {
    test(`is the owner's private chat's in every room where nobody writes, ${viewport.width}px`, async () => {
      const spaces: Record<string, Bottom> = {};

      for (const { kind, chat } of ROOMS) spaces[kind] = await measured(viewport, chat, false);

      const reference = spaces["owner's private chat"]!;

      expect(reference.band).toBe(0);

      for (const { kind } of ROOMS) {
        expect({ kind, ...spaces[kind]! }).toEqual({ kind, space: reference.space, band: 0, picture: false });
      }
    }, 240_000);

    test(`grows by the typing picture's band alone while somebody writes, ${viewport.width}px`, async () => {
      const quiet = await measured(viewport, ROOMS[1].chat, false);
      const writing = await measured(viewport, ROOMS[1].chat, true);

      expect(writing.picture).toBe(true);
      expect(writing.band).toBeGreaterThan(0);
      expect(writing.space).toBe(quiet.space + writing.band);
    }, 240_000);
  }
});
