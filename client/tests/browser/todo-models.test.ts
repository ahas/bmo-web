import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, BrowserContext, Page } from "playwright-core";
import type { TodoBoard, TodoItem, TodoModelPlan } from "../../apps/web/shared/types";

// A TODO row names the model its work will go out on (docs/web.md, the TODO panel's section): the road of the agent the
// item names, none for an item that names no agent yet, and the road a running job of it actually took — each short
// (docs/web.md, the section on model names where room is short) at both widths.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up, and serves
// the board and the model plan through the page's own routes.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "todo-models", password: "fixture-password-2298" };
const NOW = Math.floor(Date.now() / 1000);

const WIDTHS = [
  { width: 1280, height: 900, phone: false },
  { width: 360, height: 780, phone: true }
];

// One row as the panel draws it.
function item(id: number, over: Partial<TodoItem> = {}): TodoItem {
  return {
    id,
    title: `item-${id}`,
    instruction: `item-${id}`,
    requester: "Owner",
    requesterId: 42,
    chatId: 42,
    approved: true,
    awaitingApproval: false,
    recommended: false,
    done: false,
    running: false,
    worker: "bmo-a",
   
    priority: 1,
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

// The three rows: one naming its agent, one naming none yet, and one a job is running.
const NAMED = item(1, { agent: "coder-03" });
const UNNAMED = item(2);
const RUNNING = item(3, { running: true, liveState: "running", status: "running", progress: null });

// What the agent and the running job go out on: the agent's own road, and the road the running job actually took. The
// worker's road names no item's model, since no item goes out on it.
const PLAN: TodoModelPlan = { workers: { "bmo-a": "deepseek/deepseek-flash" }, agents: { "coder-03": "claude-code/claude-opus-5-5" }, running: { 3: "deepseek/deepseek-v4-pro" }, chosenBy: { 3: "item" } };

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

async function open(width: number, height: number): Promise<BrowserContext> {
  const context = await browser!.newContext({ viewport: { width, height }, serviceWorkers: "block", reducedMotion: "reduce" });
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

  await context.route(/\/api\/todos\/model-plan/, (route) => route.fulfill({ json: PLAN }));
  await context.route(/\/api\/todos(\?|$)/, async (route) => {
    if (route.request().method() !== "GET") return await route.continue();

    const board = (await (await route.fetch()).json()) as TodoBoard;

    await route.fulfill({
      json: { ...board, pending: [], queue: [NAMED, UNNAMED, RUNNING], held: [], merged: [], done: [], standing: { ...board.standing, queue: 3, running: 1, waiting: 0 } }
    });
  });

  return context;
}

// The TODO panel as the width draws it: beside the page, or the drawer its top bar opens.
async function panel(page: Page, phone: boolean): Promise<void> {
  if (phone) {
    // The top bar's TODO button, which opens the panel's drawer at this width.
    await page.getByRole("button", { name: wording("todo.action.open_todo") }).click();
    await page.waitForTimeout(600);
  }

  await page.locator("[data-item-model]:visible").first().waitFor({ timeout: 30_000 });
}

// A row's model chip by the item it stands on, read off the rows the width draws.
async function modelOf(page: Page, id: number): Promise<string> {
  const chip = page.locator(`[data-todo-id="${id}"] [data-item-model]:visible`).first();

  return (await chip.innerText()).trim();
}

describe.skipIf(!origin || !touchReady())("the model a TODO row names", () => {
  for (const { width, height, phone } of WIDTHS) {
    test(`an item naming its agent, one naming none and a running job at ${width}`, async () => {
      const context = await open(width, height);
      const page = await context.newPage();

      try {
        await page.goto(`${origin}/`, { waitUntil: "domcontentloaded" });
        await panel(page, phone);

        expect(await modelOf(page, NAMED.id)).toBe("CC/CO55");
        expect(await page.locator(`[data-todo-id="${UNNAMED.id}"] [data-item-model]`).count()).toBe(0);
        expect(await modelOf(page, RUNNING.id)).toBe("DS/DSPv4");
      } finally {
        await context.close();
      }
    }, 120_000);
  }

  test("the opened item's head names the same model", async () => {
    const context = await open(1280, 900);
    const page = await context.newPage();

    try {
      // An address naming the item opens it, as a press on its row does.
      await page.goto(`${origin}/?todo=1`, { waitUntil: "domcontentloaded" });
      const head = page.locator('[role="dialog"] [data-item-model]:visible').first();

      await head.waitFor({ timeout: 30_000 });

      expect((await head.innerText()).trim()).toBe("CC/CO55");
    } finally {
      await context.close();
    }
  }, 120_000);
});

