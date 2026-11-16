import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, BrowserContext, Locator, Page } from "playwright-core";
import type { TodoBoard, TodoItem } from "../../apps/web/shared/types";

// A running job keeps the agent it was launched on (docs/web.md, the TODO panel's section): the row and the opened
// item's head name the agent the job runs on, never the item's label, which may have been changed since. The head
// stands that agent read and not chosen, so no chooser is offered until the job is stopped. Both are read off the
// page at 1280 pixels and at 360 on a touch screen, the row's chip measured whole inside the viewport.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up, and
// serves the board through the page's own route.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "stepper", password: "fixture-password-2206" };
const ITEM = 1;
const JOB_AGENT = "coder-a";
const LABEL_AGENT = "coder-b";
const NOW = Math.floor(Date.now() / 1000);

function item(): TodoItem {
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
    liveState: "running",
    worker: JOB_AGENT,
    priority: 1,
    status: "running",
    model: null,
    agent: LABEL_AGENT,
    jobAgent: JOB_AGENT,
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

async function open(width: number, height: number): Promise<BrowserContext> {
  const phone = width < 640;
  const context = await browser!.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, serviceWorkers: "block", reducedMotion: "reduce" });
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
  await context.route(/\/api\/todos(\?|$)/, async (route) => {
    if (route.request().method() !== "GET") return await route.continue();

    const board = (await (await route.fetch()).json()) as TodoBoard;

    await route.fulfill({ json: { ...board, queue: [item()], standing: { ...board.standing, queue: 1, running: 1 } } });
  });
  await context.route(new RegExp(`/api/todos/${ITEM}/work-order$`), (route) => route.fulfill({ status: 204, body: "" }));

  return context;
}

// The row, where the panel stands open beside the page, or behind the drawer's button where it does not.
async function rowOf(page: Page): Promise<Locator> {
  const row = page.locator(`li[data-todo-id="${ITEM}"]:visible`).first();
  const opener = page.getByRole("button", { name: wording("todo.action.open_todo") });

  await row.or(opener).first().waitFor({ timeout: 20_000 });

  if (!(await row.isVisible())) {
    await opener.click();
    await row.waitFor({ timeout: 5_000 });
  }

  return row;
}

const VIEWPORTS = [[1280, 900], [360, 780]] as const;

describe.skipIf(!origin || !touchReady())("a running job's agent on the TODO panel", () => {
  for (const [width, height] of VIEWPORTS) {
    test(`the row names the agent the job runs on, whole in view, at ${width}px`, async () => {
      const context = await open(width, height);

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/`, { waitUntil: "load" });

        const chip = (await rowOf(page)).locator("[data-item-agent-named]");

        await chip.waitFor({ state: "visible", timeout: 5_000 });
        expect((await chip.innerText()).trim()).toBe(JOB_AGENT);

        // Where the panel is a drawer it slides in, so the chip is read once the drawer has come to rest: a chip that
        // never stands whole in view fails the bounded wait.
        await chip.evaluate(
          (el) =>
            new Promise<void>((resolve, reject) => {
              const until = performance.now() + 5_000;
              const look = (): void => {
                const box = el.getBoundingClientRect();

                if (box.left >= 0 && box.right <= window.innerWidth) resolve();
                else if (performance.now() > until) reject(new Error(`the chip stands at ${box.left}..${box.right} of ${window.innerWidth}`));
                else requestAnimationFrame(look);
              };

              look();
            })
        );
      } finally {
        await context.close();
      }
    }, 60_000);

    test(`the opened item's head stands the job's agent locked, with no chooser, at ${width}px`, async () => {
      const context = await open(width, height);

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/?todo=${ITEM}`, { waitUntil: "load" });

        const locked = page.locator("[data-item-agent-running]:visible").first();

        await locked.waitFor({ timeout: 15_000 });
        expect((await locked.innerText()).trim()).toBe(JOB_AGENT);
        expect(await page.getByText(LABEL_AGENT, { exact: true }).count()).toBe(0);
        expect(await page.locator("[data-item-agent]:not([data-item-agent-running])").count()).toBe(0);

        // Why it is locked is read in the shared tooltip, by a pointer over it or a tap where there is no hover.
        if (width < 640) await locked.tap();
        else await locked.hover();
        await page.locator("[data-reka-popper-content-wrapper]").filter({ hasText: wording("todo.label.agent_job_running").split("\n")[0]! }).first().waitFor({ timeout: 5_000 });
      } finally {
        await context.close();
      }
    }, 60_000);
  }
});
