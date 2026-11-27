import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";

import type { Browser, BrowserContext, Locator, Page } from "playwright-core";
import type { TodoBoard, TodoItem } from "../../apps/web/shared/types";

// The TODO panel's queue lines carry on the console's one handle (docs/web.md, 「Changing an order」 and the TODO
// panel's section): a waiting line stands a handle named for its number, a running line stands none, and the
// handle's arrow keys carry its line one place — the whole queue order reaching the bot as it lands, the focus
// coming to rest on the row it lands so the keys go on answering from there.
// It drives the console tests/support/browser-console.ts stands up, serving its board through the page's own
// routes; the suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "todo-order-handle", password: "fixture-password-3961" };
const FIRST = 3961;
const SECOND = 3962;
const RUNNING = 3963;
const NOW = Math.floor(Date.now() / 1000);

function line(id: number, over: Partial<TodoItem> = {}): TodoItem {
  return {
    id,
    title: `item-${id}`,
    instruction: "Do the thing.",
    requester: "requester-a",
    requesterId: null,
    chatId: null,
    approved: true,
    awaitingApproval: false,
    recommended: false,
    done: false,
    running: false,
    worker: null,
    priority: id - FIRST + 1,
    status: "open",
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
    createdAt: NOW - 4_000,
    doneAt: null,
    ...over
  };
}

const LINES = [line(FIRST), line(SECOND), line(RUNNING, { liveState: "running", running: true, worker: "worker-a" })];

let browser: Browser | null = null;
let cookie = "";

beforeAll(async () => {
  if (!origin || !touchReady()) return;

  const login = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...ACCOUNT }) });

  expect(login.ok).toBe(true);
  cookie = login.headers.get("set-cookie")!.split(";")[0]!;
  browser = await chromium.launch();
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();
}, BROWSER_HOOK_MS);

// The bot's queue, kept in the order the panel last wrote it, so the read after a move answers the order that
// move left and every order the panel sends is held for the test to read.
async function standingBoard(context: BrowserContext): Promise<{ writes: { id: number; order: number[] }[] }> {
  let queue = LINES.map((one) => one.id);
  const writes: { id: number; order: number[] }[] = [];

  await context.route(/\/api\/todos(\?|$)/, async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as { action?: string; id?: number; order?: number[] };

      if (body.action === "reorder" && body.id !== undefined && Array.isArray(body.order)) {
        queue = body.order;
        writes.push({ id: body.id, order: body.order });
      }

      try {
        await route.fulfill({ json: {} });
      } catch {
        // A write the page let go of mid-flight answers nothing.
      }

      return;
    }

    try {
      const board = (await (await route.fetch()).json()) as TodoBoard;

      await route.fulfill({ json: { ...board, queue: queue.map((id) => LINES.find((one) => one.id === id)!) } });
    } catch {
      // A read the page let go of mid-flight — a reload landing while it stands — is nobody's news.
    }
  });

  return { writes };
}

// The panel's queue lines as they stand, by their numbers. The panel can stand twice over in the page, the
// drawer and the side beside it, so only the visible line is read.
async function stood(page: Page): Promise<number[]> {
  const ids = await page.locator("li[data-todo-id]:visible").evaluateAll((rows) => rows.map((row) => Number(row.dataset.todoId)));

  return ids.filter((id) => LINES.some((one) => one.id === id));
}

const handleOf = (page: Page, id: number): Locator => page.locator(`li[data-todo-id="${id}"]:visible`).getByRole("button", { name: wording("common.aria.reorder_named", { name: `#${id}` }), exact: true });

// Waits a bounded while for a read to hold, so an order sent on the keyboard is settled before the next key.
async function until<T>(read: () => Promise<T>, holds: (value: T) => boolean, ms = 10_000): Promise<T> {
  const stop = Date.now() + ms;

  for (;;) {
    const value = await read();

    if (holds(value) || Date.now() >= stop) return value;
    await new Promise((done) => setTimeout(done, 100));
  }
}

async function openPanel(page: Page): Promise<void> {
  await page.goto(`${origin}/`, { waitUntil: "load" });
  await page.waitForFunction(() => window.useNuxtApp?.().isHydrating === false, null, { timeout: 30_000 });

  const row = page.locator(`li[data-todo-id="${FIRST}"]:visible`).first();

  if (!(await row.waitFor({ timeout: 10_000 }).then(() => true, () => false))) {
    await page.getByRole("button", { name: wording("todo.action.open_todo") }).click();
    await row.waitFor({ timeout: 10_000 });
  }

  await row.waitFor({ timeout: 10_000 });
}

describe.skipIf(!origin || !touchReady())("the TODO panel's queue lines carried by their handle", () => {
  for (const [width, height, phone] of [
    [1280, 900, false],
    [360, 780, true]
  ] as const) {
    test(`stand one handle per waiting line, and move a line with its arrow keys, sending the whole order, at ${width}px`, async () => {
      const context = await browser!.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, serviceWorkers: "block", reducedMotion: "reduce" });
      const at = cookie.indexOf("=");

      await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
      const { writes } = await standingBoard(context);

      try {
        const page = await context.newPage();

        await openPanel(page);
        // The running line stands at the queue's head, pinned there whatever is written.
        expect(await stood(page)).toEqual([RUNNING, FIRST, SECOND]);

        // One handle at each waiting line, named by its number; the running line stands no handle, only its room.
        for (const id of [FIRST, SECOND]) expect(await handleOf(page, id).count()).toBe(1);
        expect(await page.getByRole("button", { name: wording("common.aria.reorder_named", { name: `#${RUNNING}` }), exact: true }).count()).toBe(0);

        const boxes = await Promise.all([FIRST, SECOND].map(async (id) => (await handleOf(page, id).boundingBox())!));

        expect(boxes.map((one) => Math.round(one.width))).toEqual([24, 24]);
        expect(boxes[0]!.x).toBe(boxes[1]!.x);

        // Down one place, and the focus lands with the line, so the next key answers from there. The whole queue
        // order is what the bot is asked for, the running head included.
        await handleOf(page, FIRST).press("ArrowDown");
        expect(await until(async () => await writes.length, (n) => n === 1)).toBe(1);
        expect(writes[0]).toEqual({ id: FIRST, order: [RUNNING, SECOND, FIRST] });
        expect(await until(async () => await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? ""), (label) => label === wording("common.aria.reorder_named", { name: `#${FIRST}` }))).toBe(wording("common.aria.reorder_named", { name: `#${FIRST}` }));
        expect(await stood(page)).toEqual([RUNNING, SECOND, FIRST]);

        // And back up it goes the same way; the ends hold a key as they hold a pointer, past neither end.
        await page.keyboard.press("ArrowUp");
        await until(async () => await writes.length, (n) => n === 2);
        expect(writes[1]).toEqual({ id: FIRST, order: [RUNNING, FIRST, SECOND] });
        expect(await stood(page)).toEqual([RUNNING, FIRST, SECOND]);

        await page.keyboard.press("ArrowUp");
        expect(await stood(page)).toEqual([RUNNING, FIRST, SECOND]);
        expect(writes.length).toBe(2);

        // The wider handle column takes no sideways travel out of the panel.
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      } finally {
        await context.close();
      }
    }, 120_000);
  }
});
