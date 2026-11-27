import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, BrowserContext, Page } from "playwright-core";
import type { TodoBoard, TodoItem } from "../../apps/web/shared/types";

declare global {
  interface Window {
    // The press's moment and the menu's first frame, as the page's own probe writes them.
    menuTiming: { pressAt: number; shownAt: number };
    // Each one-second interval a TODO panel set, with when its latest ticks began and what each cost.
    panelTicks: Array<Array<{ start: number; cost: number }>>;
  }
}

// The TODO panel's row menu on a board of hundreds of rows stands within 100 ms of the right press, at either
// width, and a press that lands on the panel's one-second tick waits for nothing: the list's one menu is drawn
// apart from the list, so opening it over a row draws no row again, and the tick redraws only the parts of a row
// that show a time, so it costs less than a frame however long the list is (docs/web.md, 「Floating things」 and
// the TODO panel's section). The press's time is read in the page, from the moment the pointer went down, which
// counts any work the press queued behind, to the frame after the menu stood. Each press is aimed just after the
// shown panel's tick, which is why the file waits on the page's own second: the tick is what it measures.
//
// Both budgets are held on the middle of what the run measured, never on its widest window, and why is the
// repository's rule for a speed budget (docs/checks.md, 「How a speed budget is held」). A window read as the time
// from one task of the page to the next charges its measurement with everything else the page was waiting on while
// it ran: the board, the agents or the questions coming back, a sheet of icons the page asked for, a part of itself
// the development server had not sent yet, the first drawing of the 400 rows, or other work the machine holds. None
// of that is the clock's or the menu's. Measured with the console the harness stands, at 1500px over 400 rows: the
// panel's own second costs 0.0 to 0.6 ms and draws no row of the list, while the widest of fifteen of its windows
// holds 36 ms on a quiet machine and has held 290 ms on a busy one; a press that is not the first stands the menu
// in 37 to 48 ms, of which the two frames it waits for are 6 ms. Set four more browsers driving the same console
// going at once, and the middle of the presses stays at 43 ms while the widest tick window reaches 222 ms: one of
// those figures is the console's work and the other is the machine's. A drawing that had wrongly found its way into
// the clock, or a menu drawn inside the list, costs every window of the run, which the middle of them says.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up, and
// serves the board through the page's own routes.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "stepper", password: "fixture-password-2206" };
const ROWS = 400;
const BOUND_MS = 100;
// How far after a tick's start a press is aimed, well inside the time a tick that drew the list again took.
const AIM_MS = 8;
// What one tick of the panel's clock may cost: less than a frame.
const TICK_BOUND_MS = 16;
// How many ticks the middle of is taken over: fewer than these, and the middle is one window's own chance.
const TICKS_LEAST = 8;
// A stretch of nothing but the panel's own seconds after the presses, both to give the middle a sample and to read
// the clock's cost where no press or driver's query stands beside it.
const SETTLE_MS = 6_000;
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
  // The press's moment, the menu's first frame and the panels' ticks, read in the page.
  await context.addInitScript(() => {
    const state = { pressAt: 0, shownAt: 0 };
    const original = window.setInterval.bind(window);

    window.menuTiming = state;
    window.panelTicks = [];
    // A one-second interval set from a TODO panel is timed from its start to the end of its task, the page's flush
    // of what it changed included.
    window.setInterval = ((run: TimerHandler, ms?: number, ...rest: unknown[]) => {
      if (ms !== 1000 || typeof run !== "function" || !(new Error().stack ?? "").includes("TodoPanel")) {
        return original(run, ms, ...rest);
      }

      const ticks: Array<{ start: number; cost: number }> = [];

      window.panelTicks.push(ticks);

      return original(() => {
        const start = performance.now();
        const ended = new MessageChannel();

        run();
        ended.port1.onmessage = () => {
          // Every tick of the run is kept: the budget holds on the middle of them, and the last few seconds of a
          // run are not a middle.
          ticks.push({ start, cost: performance.now() - start });
        };
        ended.port2.postMessage(null);
      }, ms);
    }) as typeof window.setInterval;
    window.addEventListener("pointerdown", (event) => {
      if (event.button !== 2) return;

      state.pressAt = event.timeStamp;
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

// How long until just after the shown panel's next tick. Its interval is the costliest of the panels': a hidden
// panel's clock stands still, and where no tick costs anything which one is aimed at makes no difference.
async function untilTick(page: Page): Promise<number> {
  await page.waitForFunction(() => window.panelTicks.some((ticks) => ticks.length > 0), null, { timeout: 10_000 });

  return await page.evaluate((aim) => {
    const cost = (ticks: Array<{ cost: number }>): number => Math.max(0, ...ticks.map((tick) => tick.cost));
    const shown = window.panelTicks.reduce((best, ticks) => (cost(ticks) > cost(best) ? ticks : best));
    let at = (shown.at(-1)?.start ?? performance.now()) + 1000 + aim;

    while (at - performance.now() < 50) at += 1000;

    return at - performance.now();
  }, AIM_MS);
}

// The middle of several timings: what the console's own work takes, not the widest window the machine happened to
// hand it (docs/checks.md, 「How a speed budget is held」).
function middle(values: readonly number[]): number {
  const sorted = [...values].sort((one, other) => one - other);

  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

// How long the menu took to stand over the row when pressed just after a tick, and what it offered.
async function pressRow(page: Page, id: number): Promise<{ ms: number; acts: string[] }> {
  const row = page.locator(`li[data-todo-id="${id}"]:visible`).first();

  await row.scrollIntoViewIfNeeded();

  const box = (await row.boundingBox())!;

  await page.waitForTimeout(await untilTick(page));
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: "right" });
  await page.waitForFunction(() => window.menuTiming.shownAt > 0, null, { timeout: 10_000 });

  const ms = await page.evaluate(() => {
    const timing = window.menuTiming;

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

        // Over another row each time, from the head of the list to its end, each just after a tick. The menu's own
        // opening and a re-read of the board land on a press or a second now and then, so each bound holds on the
        // middle of the run's measurements: a menu drawn inside the list would cost every press, and a clock that
        // drew the list again would cost every second.
        const ids = [2, 3, ROWS / 2, ROWS - 1, ROWS];
        const presses: Array<{ id: number; ms: number; acts: string[] }> = [];

        for (const id of ids) presses.push({ id, ...(await pressRow(page, id)) });

        // The clock's cost is read over the whole run: the seconds the presses fell between, and a stretch after
        // them with nothing else going on.
        await page.waitForTimeout(SETTLE_MS);

        const times = presses.map((press) => press.ms);
        const ticks = await page.evaluate(() => window.panelTicks.flat().map((tick) => tick.cost));

        expect(middle(times)).toBeLessThan(BOUND_MS);
        expect(ticks.length).toBeGreaterThanOrEqual(TICKS_LEAST);
        expect(middle(ticks)).toBeLessThan(TICK_BOUND_MS);
        // The row's own acts: a row behind another in the queue can be moved to the top.
        expect(presses[2]!.acts).toContain(wording("todo.action.move_top"));
      } finally {
        await context.close();
      }
    }, 120_000);
  }
});
