import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, BrowserContext, Page } from "playwright-core";
import type { AgentLogLine, AgentLogPage, LiveRun, StatusView, TodoBoard, TodoItem } from "../../apps/web/shared/types";

// The back gesture on a phone with the TODO panel standing in its drawer (docs/web.md, the TODO panel's section): an
// item an address named is closed by one press, the drawer by the next, and the press after that leaves the page. An
// item the reader closed is not opened again by going back onto the address that named it, and a link naming it again
// opens it again.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up, and
// serves the board, the live run and the run's log through the page's own routes.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "stepper", password: "fixture-password-2206" };
const AGENT = "worker";
const ITEM = 1;
const RUN_NAME = "fixture-unit";
const NOW = Math.floor(Date.now() / 1000);

const RUN: LiveRun = {
  id: 1,
  kind: "worker",
  agent: AGENT,
  chatId: null,
  messageId: null,
  startedAt: NOW - 60,
  unit: RUN_NAME,
  capSeconds: null,
  depth: null,
  model: null,
  startedBy: null,
  todoId: ITEM,
  progress: null,
  stop: { kind: "item", id: String(ITEM) }
};

const LINE: AgentLogLine = {
  id: 1,
  agent: AGENT,
  run: RUN_NAME,
  chatId: null,
  at: NOW - 30,
  kind: "text",
  name: null,
  tool: null,
  parent: null,
  ref: null,
  state: null,
  truncated: false,
  text: "fixture-job-line",
  patches: [],
  patchesMore: 0
};

const LOG: AgentLogPage = { lines: [LINE], hasMore: false };

function item(over: Partial<TodoItem> = {}): TodoItem {
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
    running: true,
    liveState: "running",
    worker: AGENT,
   
    priority: 1,
    status: "running",
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
    heldKind: null,
    mergedInto: null,
    mergedAt: null,
    mergedIntoTitle: null,
    mergedFrom: [],
    attempts: 1,
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
    doneAt: null,
    ...over
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

async function open(live: LiveRun[]): Promise<BrowserContext> {
  const context = await browser!.newContext({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true, serviceWorkers: "block" });
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

  await context.route(/\/api\/status$/, async (route) => {
    const status = (await (await route.fetch()).json()) as StatusView;

    await route.fulfill({ json: { ...status, live } });
  });
  await context.route(/\/api\/todos(\?|$)/, async (route) => {
    if (route.request().method() !== "GET") return await route.continue();

    const board = (await (await route.fetch()).json()) as TodoBoard;

    await route.fulfill({ json: { ...board, queue: [item()], standing: { ...board.standing, queue: 1, running: 1 } } });
  });
  // A running job's log opens at its end, the newest page, whichever run it was opened at.
  await context.route(new RegExp(`/api/agents/${AGENT}/log(\\?|$)`), (route) => route.fulfill({ json: LOG }));
  // An item with no work order is answered with no body, as the console's route answers it; the log must stand anyway.
  await context.route(new RegExp(`/api/todos/${ITEM}/work-order$`), (route) => route.fulfill({ status: 204, body: "" }));

  return context;
}


// Waits until the page stands at `path` with `sheets` dialogs open on the screen, the drawer among them. A dialog
// drawn by the panel no one is looking at is on the page and not on the screen, so only what is laid out counts.
async function settled(page: Page, path: string, sheets: number): Promise<void> {
  await page.waitForFunction(
    ([at, count]) => {
      const open = [...document.querySelectorAll('[role="dialog"][data-state="open"]')].filter(
        (sheet) => (sheet as HTMLElement).offsetParent !== null || getComputedStyle(sheet).position === "fixed"
      );

      return location.pathname.replace(/^.*\/console/, "") + location.search === at && open.length === count;
    },
    [path, sheets] as const,
    { timeout: 30_000 }
  );
}

async function back(page: Page, path: string, sheets: number): Promise<void> {
  await page.evaluate(() => history.back());
  await settled(page, path, sheets);
}

// The page opened and standing: the console's app is in the window once it has taken the page over.
async function visit(page: Page, path: string): Promise<void> {
  await page.goto(`${origin}${path}`, { waitUntil: "load" });
  await page.waitForFunction(
    () => {
      const app = window.useNuxtApp?.();

      return app?.$router !== undefined && app.isHydrating !== true;
    },
    null,
    { timeout: 30_000 }
  );
}

// A link inside the console naming the item, as an item's number or a notification is.
async function follow(page: Page): Promise<void> {
  await page.evaluate(async (id) => {
    await window.useNuxtApp?.().$router.push({ query: { todo: String(id) } });
  }, ITEM);
}

describe.skipIf(!origin || !touchReady())("the back gesture over the TODO drawer on a phone", () => {
  const NAMED = `/?todo=${ITEM}`;

  test("closes the job's log, the item and the drawer a press apiece, and never opens again the item it closed", async () => {
    const context = await open([RUN]);

    try {
      const page = await context.newPage();

      await visit(page, NAMED);
      await settled(page, NAMED, 2);

      await page.locator("[data-item-state-log]:visible").first().tap();
      await page.getByText("fixture-job-line").waitFor({ state: "visible", timeout: 10_000 });
      await settled(page, NAMED, 3);

      // The log, then the item, whose closing takes it off the address.
      await back(page, NAMED, 2);
      await back(page, "/", 1);
      // The drawer, and the address under it opens the item no more.
      await back(page, "/", 0);
      // Nothing comes back a moment later.
      await page.waitForTimeout(1_000);
      await settled(page, "/", 0);
      expect(await page.evaluate(() => (history.state as Record<string, unknown> | null)?.bmoLayer)).toBeUndefined();
    } finally {
      await context.close();
    }
  }, 120_000);

  test("an item closed by its own button stays closed on the way back, and a link naming it opens it again", async () => {
    const context = await open([RUN]);

    try {
      const page = await context.newPage();

      await visit(page, "/");
      await settled(page, "/", 0);
      await follow(page);
      await settled(page, NAMED, 2);

      await page.keyboard.press("Escape");
      await settled(page, "/", 1);

      // The drawer goes with one press, and the address that named the item opens nothing.
      await back(page, "/", 0);
      await page.waitForTimeout(1_000);
      await settled(page, "/", 0);

      await follow(page);
      await settled(page, NAMED, 2);
      expect(await page.evaluate(() => location.search)).toBe(`?todo=${ITEM}`);
    } finally {
      await context.close();
    }
  }, 120_000);
});
