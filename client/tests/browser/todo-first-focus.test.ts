import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, BrowserContext, Page } from "playwright-core";
import type { TodoBoard, TodoItem } from "../../apps/web/shared/types";

// An item opened from the address as the page loads (docs/web.md, the TODO panel's section) puts the focus on its
// close mark with no key pressed, and the close draws no focus ring, as the bmo-ui layer keeps the ring off a focus a
// floating thing takes up on its own where no key opened it (bmo-ui's docs/design.md, "Focus"). Tab moves on from
// there and Shift+Tab back rings the close. Read off the page at 1280 pixels, where the item is a dialog; at 360 on a
// touch screen the item is a drawer over the TODO drawer, which takes up no focus as it opens, so nothing on the page
// is ringed.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up, and
// serves the board through the page's own route.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "stepper", password: "fixture-password-2206" };
const ITEM = 1;
const NOW = Math.floor(Date.now() / 1000);

function item(): TodoItem {
  return {
    id: ITEM,
    title: "item-title",
    instruction: "item-instruction",
    requester: "Owner",
    requesterId: 42,
    chatId: 42,
    approved: true, awaitingApproval: false,
    recommended: false,
    done: false,
    running: false,
    liveState: null,
    worker: null,
    priority: 1,
    status: "approved",
    model: null,
    agent: null,
    ranOn: null,
    note: null,
    reports: [],
    unfinished: null,
    rejections: 0,
    unfinishedResolvedAt: null,
    unfinishedResolution: null,
    heldAt: null,
    heldReason: null,
    dropReason: null,
    heldKind: null,
    noticesOff: null,
    mergedInto: null,
    mergedAt: null,
    mergedIntoTitle: null,
    mergedFrom: [],
    attempts: 0,
    progress: null,
    stopped: null,
    holding: null,
    waiting: null,
    deployWaits: false, closing: null, deployHeld: false,
    holdPending: false,
    orderActive: false,
    seconds: null,
    spans: [],
    createdAt: NOW - 120,
    doneAt: null
  };
}

let browser: Browser | null = null;
let cookie = "";

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
  browser = await chromium.launch();
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();
}, BROWSER_HOOK_MS);

async function open(width: number, height: number): Promise<BrowserContext> {
  const phone = width < 640;
  const context = await browser!.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, serviceWorkers: "block", reducedMotion: "reduce" });
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
  await context.route(/\/api\/todos(\?|$)/, async (route) => {
    if (route.request().method() !== "GET") return await route.continue();

    const board = (await (await route.fetch()).json()) as TodoBoard;

    await route.fulfill({ json: { ...board, queue: [item()], standing: { ...board.standing, queue: 1 } } });
  });
  await context.route(new RegExp(`/api/todos/${ITEM}/work-order$`), (route) => route.fulfill({ status: 204, body: "" }));

  return context;
}

// What holds the focus inside the item, whether it is the item's close, whether the browser counts the focus as the
// keyboard's, and whether a ring is drawn round it: an outline the stylesheet settled on, of any width.
interface Focused {
  close: boolean;
  visible: boolean;
  ringed: boolean;
}

async function focused(page: Page): Promise<Focused> {
  await page.waitForFunction(() => document.activeElement?.closest("[role=dialog]")?.querySelector("[data-item-close]") != null, null, { timeout: 20_000 });

  return page.evaluate(() => {
    const element = document.activeElement as HTMLElement;
    const style = getComputedStyle(element);

    return {
      close: element.hasAttribute("data-item-close"),
      visible: element.matches(":focus-visible"),
      ringed: style.outlineStyle !== "none" && Number.parseFloat(style.outlineWidth) > 0
    };
  });
}

describe.skipIf(!origin || !touchReady())("the focus an item opened from the address takes up", () => {
  test("stands on its close with no ring, and Tab and back ring the close, at 1280px", async () => {
    const context = await open(1280, 900);

    try {
      const page = await context.newPage();

      await page.goto(`${origin}/?todo=${ITEM}`, { waitUntil: "load" });
      expect(await focused(page)).toEqual({ close: true, visible: true, ringed: false });

      await page.keyboard.press("Tab");
      expect((await focused(page)).close).toBe(false);

      await page.keyboard.press("Shift+Tab");
      expect(await focused(page)).toEqual({ close: true, visible: true, ringed: true });
    } finally {
      await context.close();
    }
  }, 60_000);

  test("rings nothing on the page once the item stands, at 360px", async () => {
    const context = await open(360, 780);

    try {
      const page = await context.newPage();

      await page.goto(`${origin}/?todo=${ITEM}`, { waitUntil: "load" });
      await page.locator("[data-item-close]").waitFor({ state: "attached", timeout: 20_000 });
      await page.waitForFunction(() => [...document.querySelectorAll("[role=dialog]")].some((sheet) => sheet.getAttribute("data-state") === "open" && sheet.querySelector("[data-item-close]") !== null));

      expect(await page.evaluate(() => document.querySelector(":focus-visible")?.outerHTML.slice(0, 80) ?? null)).toBeNull();
    } finally {
      await context.close();
    }
  }, 60_000);
});
