import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, Page } from "playwright-core";
import type { TodoBoard, TodoItem } from "../../apps/web/shared/types";

// A launch whose agent is busy, watched on the TODO panel: the item is leased before the agency writes its job,
// the job then waits for its agent's seat, and only then runs. Its row reads waiting through the lease and the wait and
// running only once the job runs (docs/web.md, the TODO panel's section). Every label the row shows on one page is
// recorded as it changes, the panel re-read through its own refresh button as each phase comes.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up, and
// serves the board through the page's own route; how the server reads the agency's job into a row is the server
// tests'.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "stepper", password: "fixture-password-2206" };
const ITEM = 1;
const NOW = Math.floor(Date.now() / 1000);

// The phases of the launch, as the board answers them: the item leased with no job yet, its job waiting for its
// agent's seat, and its job running.
const PHASES: Partial<TodoItem>[] = [{ liveState: null }, { liveState: "waiting" }, { liveState: "running" }];

function item(over: Partial<TodoItem>): TodoItem {
  return {
    id: ITEM,
    title: "launch-fixture",
    instruction: "launch-fixture-brief",
    requester: "Owner",
    requesterId: 42,
    chatId: 42,
    approved: true,
    awaitingApproval: false,
    recommended: false,
    done: false,
    running: true,
    liveState: null,
    worker: "worker",
    priority: 1,
    status: "leased",
    model: null,
    agent: "agent-a",
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
    deployWaits: false,
    closing: null,
    deployHeld: false,
    holdPending: false,
    orderActive: false,
    seconds: null,
    spans: [],
    createdAt: NOW - 30,
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

// Records every text the shown row says, from the first paint on, into the page's `seenStates`.
function recordStates(id: number): void {
  const seen: string[] = [];
  const look = () => {
    const rows = [...document.querySelectorAll(`li[data-todo-id="${id}"]`)].filter((one) => one.getClientRects().length > 0);
    const words = rows.map((one) => (one.textContent ?? "").trim()).join(" | ");

    if (words !== "" && seen.at(-1) !== words) seen.push(words);
  };

  Object.assign(window, { seenStates: seen });
  new MutationObserver(look).observe(document, { subtree: true, childList: true, characterData: true });
}

async function seen(page: Page): Promise<string[]> {
  return await page.evaluate((): string[] => [...((Reflect.get(window, "seenStates") as string[] | undefined) ?? [])]);
}

async function refresh(page: Page): Promise<void> {
  const reads = page.waitForResponse((answer) => /\/api\/todos(\?|$)/.test(answer.url()) && answer.request().method() === "GET");

  await page.getByRole("button", { name: wording("common.action.refresh") }).locator("visible=true").first().click();
  await reads;
}

describe.skipIf(!origin || !touchReady())("a launch whose agent is busy, on the TODO panel", () => {
  for (const [width, height] of [[1280, 900], [360, 780]] as const) {
    test(`reads waiting through the lease and the wait and running only once its job runs, at ${width}px`, async () => {
      const context = await browser!.newContext({ viewport: { width, height }, serviceWorkers: "block", reducedMotion: "reduce" });
      let phase = 0;

      try {
        const at = cookie.indexOf("=");

        await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
        await context.route(/\/api\/todos(\?|$)/, async (route) => {
          if (route.request().method() !== "GET") return await route.continue();

          const board = (await (await route.fetch()).json()) as TodoBoard;

          await route.fulfill({ json: { ...board, queue: [item(PHASES[phase]!)] } });
        });
        await context.addInitScript(recordStates, ITEM);

        const page = await context.newPage();

        await page.goto(`${origin}/`, { waitUntil: "load" });

        const row = page.locator(`li[data-todo-id="${ITEM}"]:visible`).first();

        if (!(await row.waitFor({ timeout: 10_000 }).then(() => true, () => false))) {
          await page.getByRole("button", { name: wording("todo.action.open_todo") }).click();
          await row.waitFor({ timeout: 10_000 });
        }

        const running = wording("todo.label.state_running");
        const waiting = wording("todo.label.state_waiting");

        await row.getByText(waiting, { exact: true }).waitFor({ timeout: 5_000 });
        phase = 1;
        await refresh(page);
        await row.getByText(waiting, { exact: true }).waitFor({ timeout: 5_000 });

        const beforeRun = await seen(page);

        phase = 2;
        await refresh(page);
        await row.getByText(running, { exact: true }).waitFor({ timeout: 5_000 });

        const all = await seen(page);

        expect(beforeRun.length).toBeGreaterThan(0);
        expect(beforeRun.filter((words) => words.includes(running))).toEqual([]);
        expect(all.at(-1)).toContain(running);
      } finally {
        await context.close();
      }
    }, 60_000);
  }
});
