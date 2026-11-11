import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, BrowserContext, Page } from "playwright-core";
import type { AgentLogLine, AgentLogPage, LiveRun, StatusView, TodoBoard, TodoItem } from "../../apps/web/shared/types";

// The TODO panel's row menu entry on a running line: it names the running job's log and opens that log in the
// dialog the panel a person is reading draws. A job that ended between the menu opening and the press answers with
// the message pill, which is read where it stands, rather than leaving only a line under the list.
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
    worker: AGENT,
    cowork: false,
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

async function open(width: number, height: number, live: LiveRun[]): Promise<BrowserContext> {
  const context = await browser!.newContext({ viewport: { width, height }, serviceWorkers: "block", reducedMotion: "reduce" });
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

async function rowOf(page: Page) {
  const row = page.locator(`li[data-todo-id="${ITEM}"]:visible`).first();

  if (!(await row.waitFor({ timeout: 5_000 }).then(() => true, () => false))) {
    await page.getByRole("button", { name: wording("todo.action.open_todo") }).click();
    await row.waitFor({ timeout: 5_000 });
  }

  return row;
}

async function pressLog(page: Page): Promise<string> {
  const row = await rowOf(page);

  await row.click({ button: "right" });

  const entry = page.getByRole("menuitem").first();

  await entry.waitFor({ state: "visible", timeout: 5_000 });
  const label = (await entry.innerText()).trim();
  await entry.click();

  return label;
}

describe.skipIf(!origin || !touchReady())("the TODO row menu's job log", () => {
  for (const viewport of [{ width: 1500, height: 950 }, { width: 900, height: 810 }]) {
    test(`opens the running job's log in the panel being read at ${viewport.width}px`, async () => {
      const context = await open(viewport.width, viewport.height, [RUN]);

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/`, { waitUntil: "load" });

        expect(await pressLog(page)).toBe(wording("todo.action.job_log"));
        await page.getByText("fixture-job-line").waitFor({ state: "visible", timeout: 10_000 });

        const dialog = page.getByRole("dialog").last();

        expect(await dialog.isVisible()).toBe(true);
      } finally {
        await context.close();
      }
    }, 60_000);
  }

  test("opens the running job's log from the opened item's state mark, at 1280 and 360", async () => {
    for (const [width, height] of [[1280, 900], [360, 780]] as const) {
      const context = await open(width, height, [RUN]);

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/?todo=${ITEM}`, { waitUntil: "load" });

        const mark = page.locator("[data-item-state-log]:visible").first();

        await mark.waitFor({ timeout: 15_000 });
        await mark.click();
        await page.getByText("fixture-job-line").waitFor({ state: "visible", timeout: 10_000 });
      } finally {
        await context.close();
      }
    }
  }, 90_000);

  test("says in the message pill that the job has ended, in either width", async () => {
    const context = await open(900, 810, []);

    try {
      const page = await context.newPage();

      await page.goto(`${origin}/`, { waitUntil: "load" });
      await pressLog(page);

      const island = page.locator(".bmo-island");

      await island.waitFor({ state: "visible", timeout: 5_000 });
      expect(await island.innerText()).toContain(wording("todo.error.job_ended", { id: ITEM }));
      expect(await page.getByRole("dialog").count()).toBe(0);
    } finally {
      await context.close();
    }
  }, 60_000);
});
