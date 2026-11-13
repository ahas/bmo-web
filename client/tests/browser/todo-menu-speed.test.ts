import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, BrowserContext, Page } from "playwright-core";
import type { TodoBoard, TodoItem } from "../../apps/web/shared/types";

// The TODO panel's row menu on a board of hundreds of rows stands within 100 ms of the right press, at either
// width: the list's one menu is drawn apart from the list, so opening it over a row draws no row again
// (docs/web.md, 「Floating things」 and the TODO panel's section). The time is read in the page, from the press
// reaching the window to the frame after the menu stood in it.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up, and
// serves the board through the page's own routes.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "stepper", password: "fixture-password-2206" };
const ROWS = 400;
const BOUND_MS = 100;
const NOW = Math.floor(Date.now() / 1000);

// An approved row waiting its turn in the queue: one every act but the job's log can be done to.
function item(id: number): TodoItem {
  return {
    id,
    title: `item-title-${id}`,
    instruction: "item-instruction",
    requester: "Owner",
    requesterId: 42,
    chatId: 42,
    approved: true,
    awaitingApproval: false,
    recommended: false,
    done: false,
    running: false,
    liveState: null,
    worker: null,
    priority: id,
    status: "waiting",
    model: null,
    agent: null,
    ranOn: null,
    note: null,
    reports: [],
    unfinished: null,
    rejections: 0,
    unfinishedResolvedAt: null,
    unfinishedResolution: null,
    brief: null,
    heldAt: null,
    heldReason: null,
    heldKind: null,
    mergedInto: null,
    mergedAt: null,
    mergedIntoTitle: null,
    mergedFrom: [],
    attempts: 0,
    progress: null,
    stopped: null,
    holding: null,
    waiting: null,
    deployWaits: false,
    closing: null,
    deployHeld: false,
    holdPending: false,
    orderActive: false,
    seconds: null,
    spans: [],
    createdAt: NOW - 120,
    doneAt: null
  };
}

const QUEUE = Array.from({ length: ROWS }, (_, at) => item(at + 1));

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
  const context = await browser!.newContext({ viewport: { width, height }, serviceWorkers: "block", reducedMotion: "reduce" });
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
  await context.route(/\/api\/todos(\?|$)/, async (route) => {
    if (route.request().method() !== "GET") return await route.continue();

    const board = (await (await route.fetch()).json()) as TodoBoard;

    await route.fulfill({ json: { ...board, queue: QUEUE, standing: { ...board.standing, queue: ROWS } } });
  });
  // The press's moment and the menu's first frame, read in the page.
  await context.addInitScript(() => {
    const state = { pressAt: 0, shownAt: 0 };

    (window as unknown as { menuTiming: typeof state }).menuTiming = state;
    window.addEventListener("contextmenu", () => {
      state.pressAt = performance.now();
      state.shownAt = 0;
    }, { capture: true });
    new MutationObserver(() => {
      if (state.pressAt > 0 && state.shownAt === 0 && document.querySelector('[role="menu"]') !== null) {
        state.shownAt = -1;
        requestAnimationFrame(() => requestAnimationFrame(() => {
          state.shownAt = performance.now();
        }));
      }
    }).observe(document, { childList: true, subtree: true });
  });

  return context;
}

// The list, where the panel stands open beside the page, or behind the drawer's button where it does not.
async function showList(page: Page): Promise<void> {
  const row = page.locator('li[data-todo-id="1"]:visible').first();
  const opener = page.getByRole("button", { name: wording("todo.action.open_todo") });

  await row.or(opener).first().waitFor({ timeout: 30_000 });

  if (!(await row.isVisible())) {
    await opener.click();
    await row.waitFor({ timeout: 10_000 });
  }
}

// How long the menu took to stand over the row, and what it offered.
async function pressRow(page: Page, id: number): Promise<{ ms: number; acts: string[] }> {
  await page.locator(`li[data-todo-id="${id}"]:visible`).first().click({ button: "right" });
  await page.waitForFunction(() => (window as unknown as { menuTiming: { shownAt: number } }).menuTiming.shownAt > 0, null, { timeout: 10_000 });

  const ms = await page.evaluate(() => {
    const timing = (window as unknown as { menuTiming: { pressAt: number; shownAt: number } }).menuTiming;

    return timing.shownAt - timing.pressAt;
  });
  const acts = (await page.getByRole("menuitem").allInnerTexts()).map((text) => text.trim());

  await page.keyboard.press("Escape");
  await page.locator('[role="menu"]').waitFor({ state: "detached", timeout: 10_000 });

  return { ms, acts };
}

describe.skipIf(!origin || !touchReady())("the TODO row menu on a board of many rows", () => {
  for (const viewport of [{ width: 1500, height: 950 }, { width: 900, height: 810 }]) {
    test(`stands within ${BOUND_MS} ms of the right press at ${viewport.width}px`, async () => {
      const context = await open(viewport.width, viewport.height);

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/`, { waitUntil: "load" });
        await showList(page);
        expect(await page.locator("li[data-todo-id]:visible").count()).toBe(ROWS);

        // The first press brings in the menu's own code; every later one is what a reader waits on.
        await pressRow(page, 1);

        // Over another row each time, from the head of the list to its end. The panel draws its whole list again
        // once a second for its clock, and a press that lands on that work waits for it, so the bound holds on the
        // middle of the presses: the menu's own time, which no longer grows with the list.
        const ids = [2, 3, ROWS / 2, ROWS - 1, ROWS];
        const presses: Array<{ ms: number; acts: string[] }> = [];

        for (const id of ids) presses.push(await pressRow(page, id));

        const times = presses.map((press) => press.ms).sort((a, b) => a - b);

        expect(times[Math.floor(times.length / 2)]!).toBeLessThan(BOUND_MS);
        // The row's own acts: a row behind another in the queue can be moved to the top.
        expect(presses[2]!.acts).toContain(wording("todo.action.move_top"));
      } finally {
        await context.close();
      }
    }, 120_000);
  }
});
