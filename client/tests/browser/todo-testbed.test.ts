import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, Page } from "playwright-core";
import type { ItemTestbedTurn, TodoBoard, TodoItem } from "../../apps/web/shared/types";

// A running item whose job stands in the testbed's queue, on the TODO panel (docs/web.md, the TODO panel's section):
// its row carries one line under its title saying the command holding a seat, or the command's place in its lane's
// line, and nothing once the command has left the queue. Each phase is read as a tab opening reads it; which command
// belongs to which row is the server tests'.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up, and
// serves the board and the queue through the page's own routes.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "todo-testbed", password: "fixture-password-2771" };
const ITEM = 1;
const NOW = Math.floor(Date.now() / 1000);
const COMMAND = "cargo test --workspace --all-targets";

function item(): TodoItem {
  return {
    id: ITEM,
    title: "testbed-fixture",
    instruction: "testbed-fixture-brief",
    requester: "Owner",
    requesterId: 42,
    chatId: 42,
    approved: true,
    awaitingApproval: false,
    recommended: false,
    done: false,
    running: true,
    liveState: "running",
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
    deployWaits: false,
    closing: null,
    deployHeld: false,
    holdPending: false,
    orderActive: false,
    seconds: null,
    spans: [],
    createdAt: NOW - 30,
    doneAt: null
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

// Opens the console with the queue standing as given, and answers the row's line once the queue has been read.
async function opened(page: Page): Promise<void> {
  const read = page.waitForResponse((answer) => answer.url().includes("/api/todos/testbed"));

  await page.goto(`${origin}/`, { waitUntil: "load" });

  const row = page.locator(`li[data-todo-id="${ITEM}"]:visible`).first();

  if (!(await row.waitFor({ timeout: 10_000 }).then(() => true, () => false))) {
    await page.getByRole("button", { name: wording("todo.action.open_todo") }).click();
    await row.waitFor({ timeout: 10_000 });
  }

  await read;
}

describe.skipIf(!origin || !touchReady())("a running row's testbed line", () => {
  for (const [width, height] of [[1280, 900], [360, 780]] as const) {
    for (const scheme of ["light", "dark"] as const) {
      test(`says the held seat, then the place, then nothing, at ${width}px in ${scheme}`, async () => {
        const context = await browser!.newContext({ viewport: { width, height }, colorScheme: scheme, serviceWorkers: "block", reducedMotion: "reduce" });
        let turns: ItemTestbedTurn[] = [{ itemId: ITEM, command: COMMAND, place: null }];

        try {
          const at = cookie.indexOf("=");

          await context.addCookies([
            { name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! },
            { name: "nuxt-color-mode", value: scheme, url: origin! }
          ]);
          await context.route(/\/api\/todos(\?|$)/, async (route) => {
            if (route.request().method() !== "GET") return await route.continue();

            const board = (await (await route.fetch()).json()) as TodoBoard;

            await route.fulfill({ json: { ...board, queue: [item()] } });
          });
          await context.route(/\/api\/todos\/testbed/, async (route) => await route.fulfill({ json: { items: turns } }));

          const page = await context.newPage();

          await opened(page);

          const row = page.locator(`li[data-todo-id="${ITEM}"]:visible`).first();
          const line = row.locator("[data-item-testbed]");
          const holding = wording("todo.label.testbed_holding", { command: COMMAND });

          await line.waitFor({ timeout: 5_000 });
          expect((await line.textContent())?.replace(/\s+/g, " ").trim()).toBe(holding);

          // The command is machine text, and the line wraps inside its row rather than running past it.
          const fonts = await line.evaluate((one) => ({
            line: getComputedStyle(one).fontFamily,
            command: getComputedStyle(one.querySelector(".font-mono")!).fontFamily
          }));

          expect(fonts.command).not.toBe(fonts.line);

          const [lineBox, rowBox] = await Promise.all([line.boundingBox(), row.boundingBox()]);

          expect(lineBox!.x + lineBox!.width).toBeLessThanOrEqual(rowBox!.x + rowBox!.width + 0.5);

          turns = [{ itemId: ITEM, command: "check", place: 1234 }];
          await opened(page);
          await page.waitForFunction(
            ([selector, words]) => document.querySelector(selector)?.textContent?.replace(/\s+/g, " ").trim() === words,
            [`li[data-todo-id="${ITEM}"] [data-item-testbed]`, wording("todo.label.testbed_waiting", { n: "1,234", command: "check" })] as const,
            { timeout: 5_000 }
          );

          turns = [];
          await opened(page);
          expect(await line.count()).toBe(0);
        } finally {
          await context.close();
        }
      }, 60_000);
    }
  }
});
