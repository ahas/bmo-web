import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, BrowserContext, Page } from "playwright-core";
import type { TodoBoard, TodoItem, TodoModelPlan } from "../../apps/web/shared/types";

// A TODO row says where its item's work stands on its way live (docs/web.md, the TODO panel's section): being tested
// while a job of it runs its close, waiting to go live once the close handed its commit over, a chip for each commit
// where its work spans repositories, and nothing where the item says neither — in its state chips, in place of the
// running word, at both widths.
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

// The four rows: one whose job runs its close, which keeps its running word, one whose commit waits to go live, one
// whose work waits on a commit in each of two repositories, and one that says neither.
const TESTING = item(1, { running: true, status: "running", liveState: "running", closing: { phase: "testing", waiting: [] } });
const WAITING = item(2, { running: true, status: "leased", closing: { phase: "waiting-live", waiting: [{ repository: null, commit: "0123abcd0123" }] } });
const PLAIN = item(3);
const SPANNING = item(4, {
  closing: { phase: "waiting-batch", waiting: [{ repository: "repo-a", commit: "aaaa1111bbbb2222" }, { repository: "repo-b", commit: "cccc3333dddd4444" }] }
});

const PLAN: TodoModelPlan = { workers: {}, agents: {}, running: {}, chosenBy: {} };

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
      json: { ...board, pending: [], queue: [TESTING, WAITING, PLAIN, SPANNING], held: [], merged: [], done: [], standing: { ...board.standing, queue: 4, running: 2, waiting: 1, deploy: 1 } }
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

// What a row says of its way live, by the item it stands on: the words of each of its chips, none where it says none.
async function wayLiveOf(page: Page, id: number): Promise<string[]> {
  const words = await page.locator(`[data-todo-id="${id}"] [data-item-deploy]:visible`).allInnerTexts();

  return words.map((one) => one.trim());
}

describe.skipIf(!origin || !touchReady())("what a TODO row says of its item's way live", () => {
  for (const { width, height, phone } of WIDTHS) {
    test(`a row whose close checks its change, a row waiting to go live, one waiting in two repositories and a row that says neither at ${width}`, async () => {
      const context = await open(width, height);
      const page = await context.newPage();

      try {
        await page.goto(`${origin}/`, { waitUntil: "domcontentloaded" });
        await panel(page, phone);

        expect(await wayLiveOf(page, TESTING.id)).toEqual([]);
        expect(await page.locator(`[data-todo-id="${TESTING.id}"]:visible`).first().innerText()).toContain(wording("todo.label.state_running"));
        expect(await wayLiveOf(page, WAITING.id)).toEqual([`${wording("todo.label.deploy_waiting_live")} · 0123abcd0123`]);
        expect(await wayLiveOf(page, PLAIN.id)).toEqual([]);
        expect(await wayLiveOf(page, SPANNING.id)).toEqual([
          `${wording("todo.label.deploy_waiting_live")} · repo-a · aaaa1111bbbb`,
          `${wording("todo.label.deploy_waiting_live")} · repo-b · cccc3333dddd`
        ]);

        // Its chips wrap within the row rather than running past its edge.
        const row = (await page.locator(`[data-todo-id="${SPANNING.id}"]:visible`).first().boundingBox())!;
        const chips = await page.locator(`[data-todo-id="${SPANNING.id}"] [data-item-deploy]:visible`).evaluateAll((all) => all.map((one) => one.getBoundingClientRect().right));

        expect(Math.max(...chips)).toBeLessThanOrEqual(row.x + row.width + 0.5);
      } finally {
        await context.close();
      }
    }, 120_000);
  }
});
