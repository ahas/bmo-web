import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { PAGING } from "../../apps/web/shared/config";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, BrowserContext, Page, Route } from "playwright-core";
import type { ArchivedMessage, MessagePage } from "../../apps/web/shared/types";
import KO from "../fixtures/browser/room-feed-gap.test.ko.json";

// The room's line stands whole whatever reads it: a send in a room opened at an unread message, and
// the stream coming back after more was said than one page holds, both leave every message between
// the first row shown and the last, in the room's order, and nothing twice (docs/web.md, 「A page joins
// the room's line where its rows stand」). The room is a fixture this test serves itself through the
// page's own routes, so its line is known row by row; the console around it is the one given in
// BMO_CONSOLE_TEST_URL, which tests/support/browser-console.ts stands up on a scratch database with stand-ins
// for the units it reads, this file's fixture account made there (docs/checks.md, 「How the suite runs the
// tests」). The suite stands up no console, so there it skips. BMO_TEST_VIDEO_DIR, where given, keeps a
// recording of each run there.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const videos = process.env.BMO_TEST_VIDEO_DIR;
const ACCOUNT = { name: "room-feed", password: "fixture-password-1457" };
const WIDTHS = [{ width: 1280, height: 800, phone: false }, { width: 360, height: 780, phone: true }];
const CHAT = -100_000_001_457;
const OTHER = 777_001;
const TEST_MS = 90_000;

let browser: Browser | null = null;
let cookie = "";
let owner = 0;

beforeAll(async () => {
  if (!origin || !touchReady()) {
    return;
  }

  const login = await fetch(`${origin}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(ACCOUNT)
  });

  expect(login.ok).toBe(true);
  cookie = login.headers.get("set-cookie")!.split(";")[0]!;

  const asked = await fetch(`${origin}/api/owner`, { headers: { cookie } });

  owner = ((await asked.json()) as { chatId: number | null }).chatId ?? 1;
  browser = await chromium.launch();
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();
}, BROWSER_HOOK_MS);

// A room's line as the archive keeps it. Telegram's numbers and the console's below zero are mixed
// in it as in a real room, so nothing here can be put in order by its number.
class Room {
  readonly rows: ArchivedMessage[] = [];
  // Every read the screen asked for, as its query.
  readonly asked: string[] = [];
  private telegram = 5_000;
  private console = -990_000_000;
  private clock = 1_791_400_000;

  say(text: string, mine: boolean, seconds = 60): ArchivedMessage {
    this.clock += seconds;

    const fromConsole = mine && this.rows.length % 3 === 0;
    const messageId = String(fromConsole ? this.console-- : this.telegram++);
    const row: ArchivedMessage = {
      chatId: CHAT,
      messageId,
      senderId: mine ? owner : OTHER,
      senderName: mine ? "room-feed" : "tester",
      sentAt: this.clock,
      text,
      imagePath: null,
      replyToMessageId: null
    };

    this.rows.push(row);

    return row;
  }

  // A conversation over two days: the first day's evening, then the night after midnight.
  fill(count: number): void {
    for (let at = 0; at < count; at++) {
      this.say(`${KO.line_87}${this.rows.length + 1}`, at % 4 === 0, at === Math.floor(count / 2) ? 8 * 3600 : 60);
    }
  }

  ids(): string[] {
    return this.rows.map((row) => row.messageId);
  }

  // What the messages route answers, read the way the archive reads it: by place in the line.
  page(query: URLSearchParams): MessagePage {
    this.asked.push(query.toString());

    const limit = Number(query.get("limit") ?? 100);
    const place = (name: string) => this.rows.findIndex((row) => row.messageId === query.get(name));

    if (query.has("at")) {
      return { messages: this.rows.filter((row) => row.messageId === query.get("at")), judgements: [], hasMore: false };
    }

    if (query.has("after")) {
      const from = place("after") + 1;
      const rows = this.rows.slice(from, from + limit);

      return { messages: rows, judgements: [], hasMore: from + limit < this.rows.length };
    }

    const end = query.has("before") ? place("before") : this.rows.length;
    const start = Math.max(0, end - limit);

    return { messages: this.rows.slice(start, end), judgements: [], hasMore: start > 0 };
  }
}

// The stream as the console hears it: each connection names the bot's run and ends, and the next one
// is the stream coming back, which every screen answers with a read of its end.
interface Stream {
  up: boolean;
}

async function open(viewport: (typeof WIDTHS)[number], room: Room, firstUnread: string | null, stream: Stream): Promise<BrowserContext> {
  const context = await browser!.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.phone,
    hasTouch: viewport.phone,
    serviceWorkers: "block",
    reducedMotion: "reduce",
    ...(videos ? { recordVideo: { dir: videos, size: { width: viewport.width, height: viewport.height } } } : {})
  });
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
  await context.route(/\/api\/control$/, (route) => route.fulfill({ json: { reachable: true, ownerChatId: owner } }));
  await context.route(/\/api\/events(\?|$)/, (route) =>
    stream.up
      ? route.fulfill({ contentType: "text/event-stream", body: `retry: 500\n\nevent: run\ndata: {"run":"fixture"}\n\n` })
      : route.abort()
  );
  await context.route(/\/api\/rooms$/, (route) =>
    route.fulfill({
      json: [{
        chatId: CHAT,
        title: KO.line_148,
        messageCount: room.rows.length,
        lastMessageAt: room.rows.at(-1)?.sentAt ?? null,
        unread: firstUnread === null ? 0 : room.rows.length - room.ids().indexOf(firstUnread),
        firstUnread,
        readTo: null
      }]
    })
  );
  await context.route(new RegExp(`/api/rooms/${CHAT}/`), (route) => answerRoom(route, room));

  return context;
}

async function answerRoom(route: Route, room: Room): Promise<void> {
  const url = new URL(route.request().url());
  const path = url.pathname;

  if (path.endsWith("/messages")) {
    await route.fulfill({ json: room.page(url.searchParams) });
  } else if (path.endsWith("/read")) {
    await route.fulfill({ json: { unread: 0, firstUnread: null, readTo: null } });
  } else if (path.endsWith("/say")) {
    const body = route.request().postDataJSON() as { text: string };
    const said = room.say(body.text, true, 30);

    await route.fulfill({ json: { messageId: said.messageId } });
  } else {
    await route.fulfill({ status: 404, json: { message: "no such fixture" } });
  }
}

// The room entered from inside the console, as a person goes to it, so the room list and its first
// unread message are known by the time the room opens.
async function visit(page: Page): Promise<void> {
  const listed = page.waitForResponse(/\/api\/rooms$/);

  await page.goto(`${origin}/`, { waitUntil: "load" });
  await page.waitForFunction(() => {
    const root: (Element & { __vue_app__?: { $nuxt?: { isHydrating?: boolean } } }) | null = document.querySelector("#__nuxt");

    return root?.__vue_app__?.$nuxt?.isHydrating === false;
  });
  await listed;
  await page.evaluate(async (path) => {
    const root: (Element & { __vue_app__?: { config: { globalProperties: { $router: { push: (to: string) => Promise<unknown> } } } } }) | null = document.querySelector("#__nuxt");

    await root!.__vue_app__!.config.globalProperties.$router.push(path);
  }, `/rooms/${CHAT}`);
}

// The archived rows the screen stands, top to bottom, by the number each carries.
async function shown(page: Page): Promise<string[]> {
  return await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[data-message]")]
      .map((row) => /^m(-?\d+)$/.exec(row.dataset.message ?? "")?.[1])
      .filter((id): id is string => id !== undefined)
  );
}

async function standing(page: Page, messageId: string): Promise<void> {
  await page.locator(`[data-message="m${messageId}"]`).waitFor({ state: "attached", timeout: 20_000 });
}

// Every row between the first shown and the last, in the room's order, each once.
function expectWhole(room: Room, rows: string[]): void {
  const line = room.ids();
  const from = line.indexOf(rows[0]!);

  expect(from).not.toBe(-1);
  expect(rows).toEqual(line.slice(from, from + rows.length));
  expect(rows.at(-1)).toBe(line.at(-1)!);
}

describe.skipIf(!origin || !touchReady())("the room's line after a send and after the stream comes back", () => {
  for (const viewport of WIDTHS) {
    test(`a send in a room opened at an unread message leaves no message out at ${viewport.width}px`, async () => {
      const room = new Room();

      room.fill(160);

      // The first unread message further back than the room's end page reaches: the room opens on the
      // stretch around it, read as its first read in place of the end (docs/web.md, 「Where a room opens is
      // settled before it is drawn」).
      const unread = room.ids()[room.rows.length - PAGING.defaultSize - 5]!;
      const context = await open(viewport, room, unread, { up: false });

      try {
        const page = await context.newPage();

        await visit(page);
        await standing(page, unread);

        // It opened on the stretch around the unread message, not at the end.
        expect(room.asked).toContain(`before=${unread}&limit=${Math.floor(PAGING.defaultSize / 2)}`);
        expect(await shown(page)).not.toContain(room.ids().at(-1)!);

        const box = page.locator("form textarea").first();

        await box.fill(KO.line_242);
        await page.locator("form [type='submit']").first().click();

        // The send's own read of the room's end has landed once the row it sent is archived.
        await standing(page, room.ids().at(-1)!);
        await page.waitForTimeout(500);

        expectWhole(room, await shown(page));
      } finally {
        await context.close();
      }
    }, TEST_MS);

    test(`the stream coming back after a gap wider than a page fills it at ${viewport.width}px`, async () => {
      const room = new Room();
      const stream = { up: false };

      room.fill(160);

      const context = await open(viewport, room, null, stream);

      try {
        const page = await context.newPage();

        await visit(page);
        await standing(page, room.ids().at(-1)!);

        // Said while the stream was down: more than the room's end page holds.
        room.fill(150);
        stream.up = true;

        await standing(page, room.ids().at(-1)!);
        await page.waitForTimeout(500);

        expectWhole(room, await shown(page));
      } finally {
        await context.close();
      }
    }, TEST_MS);
  }
});
