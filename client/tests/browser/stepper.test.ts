import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";

import type { Browser, BrowserContext, Locator, Page } from "playwright-core";
import type { AgentLogLine, AgentLogPage, LiveRun, StatusView, TodoBoard, TodoItem, WorkOrderView, WorkTask } from "../../apps/web/shared/types";

// The one vertical stepper work progress is read on (docs/web.md, 「The progress stepper」), in the three
// places it stands: an agent's screen, the log dialog the TODO panel opens over a running job, and a TODO
// item's work order on its status tab. Each is read as the browser lays it out: how many steps stand, which
// state each wears, which stand open, and that a press on a folded head opens it.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up,
// and serves what the three places read through the page's own routes. The suite stands up no console, so
// there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "stepper", password: "fixture-password-2206" };
const AGENT = "worker";
const ITEM = 1;
const NOW = Math.floor(Date.now() / 1000);

// The worker at work on the item.
const RUN: LiveRun = {
  id: 1,
  kind: "worker",
  agent: AGENT,
  chatId: null,
  messageId: null,
  startedAt: NOW - 600,
  unit: "fixture-unit",
  capSeconds: null,
  depth: null,
  model: null,
  startedBy: null,
  todoId: ITEM,
  progress: null,
  stop: { kind: "item", id: String(ITEM) }
};

function line(id: number, run: string, kind: AgentLogLine["kind"], text: string, at: number): AgentLogLine {
  return { id, agent: AGENT, run, chatId: null, at, kind, name: null, tool: null, parent: null, ref: null, state: null, truncated: false, text, patches: [], patchesMore: 0 };
}

// Two runs: one that ended, and the one going now.
const LOG: AgentLogPage = {
  lines: [
    line(1, "run-a", "start", "model-a", NOW - 3_000),
    line(2, "run-a", "text", "answer-a", NOW - 2_900),
    line(3, "run-a", "end", "done-a", NOW - 2_800),
    line(4, "run-b", "start", "model-b", NOW - 600),
    line(5, "run-b", "text", "answer-b", NOW - 500)
  ],
  hasMore: false
};

function task(id: string, state: WorkTask["state"], over: Partial<WorkTask> = {}): WorkTask {
  return { id, title: `task-${id}`, role: "scout", model: "model-a", instruction: "instruction", state, attempt: 1, unit: null, jobId: null, startedAt: null, result: null, artifact: null, error: null, ...over };
}

// An order in its build: a stage of two branches done, one build task done and one running.
const ORDER: WorkOrderView = {
  todoId: ITEM,
  intent: "intent",
  instruction: "instruction",
  status: "active",
  phase: "implementation",
  stage: 1,
  stages: [{ title: "stage-one", tasks: [task("s1", "done", { startedAt: (NOW - 3_000) * 1000, jobId: 11 }), task("s2", "done", { startedAt: (NOW - 2_990) * 1000, jobId: 12 })] }],
  tasks: [
    task("b1", "done", { role: "builder", startedAt: (NOW - 2_000) * 1000, jobId: 13 }),
    task("b2", "running", { role: "builder", startedAt: (NOW - 600) * 1000, jobId: 14 })
  ],
  history: [],
  control: null,
  worker: AGENT,
  cwd: "/home/user/checkout",
  chatId: 42,
  model: "auto",
  error: null,
  updatedAt: NOW,
  ended: { s1: NOW - 2_500, s2: NOW - 2_400, b1: NOW - 1_000 }
};

function item(over: Partial<TodoItem> = {}): TodoItem {
  return {
    id: ITEM,
    title: "item-title",
    instruction: "item-instruction",
    requester: "Owner",
    requesterId: 42,
    chatId: 42,
    approved: true,
    done: false,
    running: true,
    worker: null,
    cowork: true,
    priority: 1,
    status: "running",
    model: null,
    ranOn: null,
    note: null,
    report: null,
    unfinished: null,
    unfinishedResolvedAt: null,
    unfinishedResolution: null,
    brief: null,
    briefRendering: null,
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
    deployWaits: false,
    holdPending: false,
    orderActive: true,
    seconds: null,
    spans: [],
    createdAt: NOW - 4_000,
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

async function open(): Promise<BrowserContext> {
  const context = await browser!.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block", reducedMotion: "reduce" });
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

  await context.route(/\/api\/status$/, async (route) => {
    const status = (await (await route.fetch()).json()) as StatusView;

    await route.fulfill({ json: { ...status, live: [RUN] } });
  });
  await context.route(new RegExp(`/api/agents/${AGENT}/log(\\?|$)`), async (route) => {
    await route.fulfill({ json: LOG });
  });
  await context.route(/\/api\/todos(\?|$)/, async (route) => {
    if (route.request().method() !== "GET") return await route.continue();

    const board = (await (await route.fetch()).json()) as TodoBoard;

    await route.fulfill({ json: { ...board, queue: [item()], standing: { ...board.standing, queue: 1, running: 1 } } });
  });
  await context.route(new RegExp(`/api/todos/${ITEM}$`), async (route) => {
    await route.fulfill({ json: item() });
  });
  await context.route(new RegExp(`/api/todos/${ITEM}/work-order$`), async (route) => {
    if (route.request().method() !== "GET") return await route.continue();

    await route.fulfill({ json: ORDER });
  });

  return context;
}

interface Read {
  states: string[];
  open: boolean[];
  bodies: number;
}

// The steps a stepper stands, as the browser has them.
async function stepper(list: Locator): Promise<Read> {
  return await list.evaluate((element) => {
    const steps = [...element.children];

    return {
      states: steps.map((step) => step.getAttribute("data-step") ?? ""),
      open: steps.map((step) => step.querySelector(":scope > div > button")?.getAttribute("aria-expanded") === "true"),
      bodies: steps.filter((step) => step.querySelector("[data-state=open] > :not(button)") !== null).length
    };
  });
}

// A reading taken again until it holds what is waited for, or the wait is up; the last reading either way.
async function until<T>(read: () => Promise<T>, holds: (value: T) => boolean, ms = 10_000): Promise<T> {
  const end = Date.now() + ms;
  let value = await read();

  while (!holds(value) && Date.now() < end) {
    await Bun.sleep(100);
    value = await read();
  }

  return value;
}

// The item's row on the TODO panel, which a wide screen stands open beside the page and a press opens
// otherwise.
async function todoRow(page: Page): Promise<Locator> {
  const row = page.locator(`li[data-todo-id="${ITEM}"]`).first();

  if (!(await row.waitFor({ timeout: 5_000 }).then(() => true, () => false))) {
    await page.getByRole("button", { name: wording("todo.action.open_todo") }).click();
    await row.waitFor();
  }

  return row;
}

function stepperIn(scope: Page | Locator): Locator {
  return scope.locator("ol:has(> li[data-step])").first();
}

describe.skipIf(!origin || !touchReady())("the progress stepper", () => {
  test("an agent's screen stands its runs as steps, the newest open, and a folded one opens on a press", async () => {
    const context = await open();

    try {
      const page = await context.newPage();

      await page.goto(`${origin}/agents/${AGENT}`, { waitUntil: "load" });

      const list = stepperIn(page);

      await list.locator("> li").nth(1).waitFor();

      const first = await stepper(list);

      expect(first.states).toEqual(["done", "running"]);
      expect(first.open).toEqual([false, true]);
      expect(first.bodies).toBe(1);

      await list.locator("> li").first().locator("button").first().click();
      expect(await until(async () => (await stepper(list)).open, (open) => open.every(Boolean))).toEqual([true, true]);
    } finally {
      await context.close();
    }
  }, 60_000);

  test("the log dialog the TODO panel opens over a running job stands the same steps", async () => {
    const context = await open();

    try {
      const page = await context.newPage();

      await page.goto(`${origin}/agents/${AGENT}`, { waitUntil: "load" });
      const row = await todoRow(page);
      await row.click({ button: "right" });
      await page.getByRole("menuitem").first().click();

      const dialog = page.getByRole("dialog").filter({ has: page.locator("ol > li[data-step]") }).last();
      const list = stepperIn(dialog);

      await list.locator("> li").nth(1).waitFor();

      const read = await stepper(list);

      expect(read.states).toEqual(["done", "running"]);
      expect(read.open).toEqual([false, true]);
      expect(read.bodies).toBe(1);
    } finally {
      await context.close();
    }
  }, 60_000);

  test("a TODO item's work order stands its steps, the running one open with its tasks", async () => {
    const context = await open();

    try {
      const page = await context.newPage();

      await page.goto(`${origin}/agents/${AGENT}`, { waitUntil: "load" });
      const row = await todoRow(page);
      await row.getByText("item-title").first().click();

      const list = stepperIn(page.getByRole("dialog").last());

      await list.locator("> li").nth(2).waitFor();

      const read = await stepper(list);

      expect(read.states).toEqual(["done", "done", "running"]);
      expect(read.open).toEqual([false, false, true]);
      expect(await list.locator("> li").nth(2).locator("[data-state=open] li button").count()).toBe(1);

      // The stage of two branches opens onto its two tasks, and a task opens the step's dialog.
      await list.locator("> li").first().locator("button").first().click();
      expect(await until(async () => await list.locator("> li").first().locator("[data-state=open] li button").count(), (n) => n === 2)).toBe(2);
      await list.locator("> li").first().locator("[data-state=open] li button").nth(1).click();
      expect(await until(async () => await page.getByRole("dialog").filter({ hasText: "task-s2" }).count(), (n) => n > 0)).toBeGreaterThan(0);
    } finally {
      await context.close();
    }
  }, 60_000);
});
