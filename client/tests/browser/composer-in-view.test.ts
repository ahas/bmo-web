import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, BrowserContext, Page } from "playwright-core";
import type { ArchivedMessage, MessagePage } from "../../apps/web/shared/types";

// The room's input bar stands within what is visible from the room's first frame, with nothing touched,
// and stays there as a keyboard comes over the window and goes (docs/web.md, 「Layout fundamentals」, the
// vertical). What a phone reports of its window is played by a stand-in for the window's height and the
// visual viewport, laid over the browser's own before the page's first script: a desktop browser has no
// bar of its own laid over the page's foot and no keyboard, so the numbers a phone reports are given to the
// page the way a phone gives them, and the browser lays the page out by its own dynamic viewport as ever.
// The room is a fixture served through the page's own routes; the console around it is the one given in
// BMO_CONSOLE_TEST_URL, which tests/support/browser-console.ts stands up with this file's fixture account
// (docs/checks.md, 「How the suite runs the tests」). The suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "composer-view", password: "fixture-password-2170" };
const PHONES = [{ width: 375, height: 667 }, { width: 390, height: 844 }];
const CHAT = -100_000_002_170;
const OTHER = 777_002;
// A phone's bar laid over the foot of the page as it loads, which the window's own numbers leave out
// while the stylesheet's dynamic viewport still runs under it.
const BAR_PX = 48;
// A phone's keyboard laid over the window.
const KEYBOARD_PX = 300;
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

// A room long enough to fill a phone's screen several times over.
function roomRows(): ArchivedMessage[] {
  const rows: ArchivedMessage[] = [];
  let clock = 1_791_400_000;

  for (let at = 0; at < 60; at++) {
    clock += 60;
    rows.push({
      chatId: CHAT,
      messageId: 9_000 + at,
      senderId: at % 3 === 0 ? owner : OTHER,
      senderName: at % 3 === 0 ? "composer-view" : "tester",
      sentAt: clock,
      text: `line ${at} `.repeat(1 + (at % 5) * 3),
      imagePath: null,
      replyToMessageId: null
    });
  }

  return rows;
}

// What the window reports of itself: its own height and the visible part of it, as the visual viewport
// gives them. Null leaves the browser's own number standing.
interface Reported {
  windowHeight: number | null;
  height: number | null;
  offsetTop: number | null;
}

declare global {
  interface Window {
    // Set by the stand-in below.
    report: (next: Partial<Reported>) => void;
  }
}

// The stand-in, laid over the browser's own numbers before the page's first script runs. `report` changes
// what is reported and tells the page the way a phone does: a resize of the visual viewport and of the window.
function standIn(initial: Reported): void {
  const reported = { ...initial };
  const visual = window.visualViewport!;
  // The browser's own getters, read through before anything is laid over them.
  const ownGetter = (on: object, name: string): (() => number) => {
    const getter = Object.getOwnPropertyDescriptor(on, name)?.get;

    return (): number => getter?.call(on === window ? window : visual) ?? 0;
  };
  const own = {
    innerHeight: ownGetter(window, "innerHeight"),
    height: ownGetter(VisualViewport.prototype, "height"),
    offsetTop: ownGetter(VisualViewport.prototype, "offsetTop")
  };

  Object.defineProperty(window, "innerHeight", { configurable: true, get: () => reported.windowHeight ?? own.innerHeight() });
  Object.defineProperty(visual, "height", { configurable: true, get: () => reported.height ?? own.height() });
  Object.defineProperty(visual, "offsetTop", { configurable: true, get: () => reported.offsetTop ?? own.offsetTop() });

  window.report = (next) => {
    Object.assign(reported, next);
    visual.dispatchEvent(new Event("resize"));
    window.dispatchEvent(new Event("resize"));
  };
}

async function open(phone: (typeof PHONES)[number], reported: Reported): Promise<BrowserContext> {
  const rows = roomRows();
  const context = await browser!.newContext({
    viewport: phone,
    isMobile: true,
    hasTouch: true,
    serviceWorkers: "block",
    reducedMotion: "reduce"
  });
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
  await context.addInitScript(standIn, reported);
  await context.route(/\/api\/control$/, (route) => route.fulfill({ json: { reachable: true, ownerChatId: owner } }));
  await context.route(/\/api\/rooms$/, (route) =>
    route.fulfill({
      json: [{ chatId: CHAT, title: "composer-view", messageCount: rows.length, lastMessageAt: rows.at(-1)!.sentAt, unread: 0, firstUnread: null, readTo: null }]
    })
  );
  await context.route(new RegExp(`/api/rooms/${CHAT}/`), async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname.endsWith("/messages")) {
      const page: MessagePage = { messages: rows, judgements: [], hasMore: false };

      await route.fulfill({ json: page });
    } else if (url.pathname.endsWith("/read")) {
      await route.fulfill({ json: { unread: 0, firstUnread: null, readTo: null } });
    } else {
      await route.fulfill({ status: 404, json: { message: "no such fixture" } });
    }
  });

  return context;
}

// The room loaded the way a refresh loads it, its address opened afresh, and waited on until its
// conversation stands open; nothing on the page is pressed, tapped or typed into.
async function loadFresh(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();

  await page.goto(`${origin}/rooms/${CHAT}`, { waitUntil: "load" });
  await page.locator("[data-message]").first().waitFor({ state: "visible", timeout: 30_000 });
  await page.locator("form textarea").first().waitFor({ state: "attached" });

  return page;
}

// Where the input bar's box stands, and the visible part of the window as the page is told it.
interface Placed {
  top: number;
  bottom: number;
  visibleTop: number;
  visibleBottom: number;
}

async function placed(page: Page): Promise<Placed> {
  return await page.evaluate(
    () =>
      new Promise<Placed>((resolve) => {
        // Two frames, so what the last report changed is laid out before it is measured.
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            const box = document.querySelector("form textarea")!.closest("form")!.getBoundingClientRect();
            const visual = window.visualViewport!;

            resolve({ top: box.top, bottom: box.bottom, visibleTop: visual.offsetTop, visibleBottom: visual.offsetTop + visual.height });
          })
        );
      })
  );
}

function expectInView(at: Placed): void {
  expect(at.top).toBeGreaterThanOrEqual(at.visibleTop);
  expect(at.bottom).toBeLessThanOrEqual(at.visibleBottom + 1);
}

describe.skipIf(!origin || !touchReady())("the room's input bar stands within what is visible", () => {
  for (const phone of PHONES) {
    test(`on a fresh load at ${phone.width}x${phone.height}, before anything is touched`, async () => {
      const context = await open(phone, { windowHeight: null, height: null, offsetTop: null });

      try {
        const page = await loadFresh(context);
        const at = await placed(page);

        expectInView(at);
        expect(at.visibleBottom).toBe(phone.height);
      } finally {
        await context.close();
      }
    }, TEST_MS);

    test(`on a fresh load at ${phone.width}x${phone.height} under a bar the window's own height leaves out`, async () => {
      // The window and its visible part both stop short of the bar laid over the page's foot, while the
      // dynamic viewport the stylesheet reads still runs under it.
      const visible = phone.height - BAR_PX;
      const context = await open(phone, { windowHeight: visible, height: visible, offsetTop: 0 });

      try {
        const page = await loadFresh(context);
        const at = await placed(page);

        expect(at.visibleBottom).toBe(visible);
        expectInView(at);
      } finally {
        await context.close();
      }
    }, TEST_MS);

    test(`at ${phone.width}x${phone.height} a keyboard coming over the window and going leaves it in view`, async () => {
      const context = await open(phone, { windowHeight: null, height: null, offsetTop: null });

      try {
        const page = await loadFresh(context);

        expectInView(await placed(page));

        // The keyboard lays itself over the window: the window keeps its height, its visible part shrinks.
        await page.evaluate((visible) => window.report({ height: visible, offsetTop: 0 }), phone.height - KEYBOARD_PX);

        const raised = await placed(page);

        expect(raised.visibleBottom).toBe(phone.height - KEYBOARD_PX);
        expectInView(raised);

        // And goes again.
        await page.evaluate(() => window.report({ height: null, offsetTop: null }));

        const lowered = await placed(page);

        expect(lowered.visibleBottom).toBe(phone.height);
        expectInView(lowered);
        expect(lowered.bottom).toBeGreaterThan(raised.bottom);
      } finally {
        await context.close();
      }
    }, TEST_MS);
  }
});
