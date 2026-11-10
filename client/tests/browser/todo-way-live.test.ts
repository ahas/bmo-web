import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, BrowserContext, Page } from "playwright-core";
import type { TodoBoard, TodoItem, TodoModelPlan } from "../../apps/web/shared/types";

// A TODO row says where its item's work stands on its way live (docs/web.md, the TODO panel's section): being tested
// while a job of it runs its close, waiting to go live once the close handed its commit over, and nothing where the
// item says neither — beside its state, at both widths.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up, and serves
// the board through the page's own route.

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
    cowork: false,
    priority: 1,
    status: "waiting",
    model: null,
    agent: null,
    ranOn: null,
    note: null,
    reports: [],
    unfinished: null,
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
    attempts: 1,
    progress: null,
    stopped: null,
    holding: null,
    waiting: null,
    deployWaits: false, closing: null,
    holdPending: false,
    orderActive: false,
    seconds: null,
    spans: [],
    createdAt: NOW - 120,
    doneAt: null,
    ...over
  };
}

// The three rows: one whose job runs its close, one whose commit waits to go live, and one that says neither.
const TESTING = item(1, { running: true, status: "running", liveState: "running", closing: { phase: "testing", commit: null } });
const WAITING = item(2, { running: true, status: "leased", closing: { phase: "waiting-live", commit: "0123abcd0123" } });
const PLAIN = item(3);

const PLAN: TodoModelPlan = { workers: {}, running: {}, chosenBy: {} };

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
      json: { ...board, pending: [], queue: [TESTING, WAITING, PLAIN], held: [], merged: [], done: [], standing: { ...board.standing, queue: 3, running: 2, waiting: 1 } }
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

  await page.locator("[data-todo-id]:visible").first().waitFor({ timeout: 30_000 });
}

// What a row says of its way live, by the item it stands on: the words, or nothing where it says none.
async function wayLiveOf(page: Page, id: number): Promise<string | null> {
  const words = page.locator(`[data-todo-id="${id}"] [data-item-deploy]:visible`);

  return (await words.count()) === 0 ? null : (await words.first().innerText()).trim();
}

describe.skipIf(!origin || !touchReady())("what a TODO row says of its item's way live", () => {
  for (const { width, height, phone } of WIDTHS) {
    test(`a row being tested, a row waiting to go live and a row that says neither at ${width}`, async () => {
      const context = await open(width, height);
      const page = await context.newPage();

      try {
        await page.goto(`${origin}/`, { waitUntil: "domcontentloaded" });
        await panel(page, phone);

        expect(await wayLiveOf(page, TESTING.id)).toBe(wording("todo.label.deploy_testing"));
        expect(await wayLiveOf(page, WAITING.id)).toBe(wording("todo.label.deploy_waiting_live"));
        expect(await wayLiveOf(page, PLAIN.id)).toBeNull();
      } finally {
        await context.close();
      }
    }, 120_000);
  }
});
