import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { JOB_LOG } from "../support/job-log";

import type { Browser, BrowserContext } from "playwright-core";
import type { LiveRun, StatusView, TodoBoard, TodoItem } from "../../apps/web/shared/types";

declare global {
  interface Window {
    // The moment the log was first shown, as the page's own probe writes it.
    logShown?: { newestInView: boolean };
  }
}

// A running job's log opened from the TODO panel stands its newest lines the moment it is shown (docs/web.md, 「The work
// view」 and 「Where the log comes from」): the job's run is named in the ledger for the worker it was ordered for while
// its lines stand under the seat that ran it, in a log of thousands of lines whose results run to tens of thousands of
// characters, and the console server reads the run's newest lines out of the seat's log. The log's own lines are what
// is read, through the console's own server and the agency's stand-in (tests/support/job-log.ts).
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up; the suite
// stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "agent-log-open", password: "fixture-password-2809" };
const NOW = Math.floor(Date.now() / 1000);
const WIDTHS = [
  { width: 1280, height: 800, phone: false },
  { width: 360, height: 780, phone: true }
] as const;

const RUN: LiveRun = {
  id: JOB_LOG.job, kind: "worker", agent: JOB_LOG.seat, chatId: null, messageId: null, startedAt: NOW - 600, unit: JOB_LOG.run, capSeconds: null,
  depth: null, model: null, startedBy: null, todoId: JOB_LOG.item, progress: null, stop: { kind: "item", id: String(JOB_LOG.item) }
};

function item(): TodoItem {
  return {
    id: JOB_LOG.item, title: "item-title", instruction: "item-instruction", requester: "Owner", requesterId: 1, chatId: 1, approved: true, awaitingApproval: false,
    recommended: false, done: false, running: true, liveState: "running", worker: null, priority: 1, status: "running", model: null, agent: null, ranOn: null,
    note: null, reports: [], unfinished: null, rejections: 0, unfinishedResolvedAt: null, unfinishedResolution: null, brief: null, heldAt: null, heldReason: null,
    heldKind: null, mergedInto: null, mergedAt: null, mergedIntoTitle: null, mergedFrom: [], attempts: 1, progress: null, stopped: null, holding: null,
    waiting: null, deployWaits: false, closing: null, deployHeld: false, holdPending: false, orderActive: false, seconds: null, spans: [], createdAt: NOW - 4_000,
    doneAt: null
  };
}

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

async function open(viewport: (typeof WIDTHS)[number]): Promise<BrowserContext> {
  const context = await browser!.newContext({ viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.phone, hasTouch: viewport.phone, serviceWorkers: "block", reducedMotion: "reduce" });
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
  // The item runs, its job's run live on the seat; the job's log itself is the console's own read.
  await context.route(/\/api\/status$/, async (route) => {
    const status = (await (await route.fetch()).json()) as StatusView;

    await route.fulfill({ json: { ...status, live: [RUN] } });
  });
  await context.route(/\/api\/todos(\?|$)/, async (route) => {
    if (route.request().method() !== "GET") return await route.continue();

    const board = (await (await route.fetch()).json()) as TodoBoard;

    await route.fulfill({ json: { ...board, queue: [item()], standing: { ...board.standing, queue: 1, running: 1 } } });
  });
  await context.route(new RegExp(`/api/todos/${JOB_LOG.item}$`), (route) => route.fulfill({ json: item() }));
  // The moment the log is first shown, whether its newest line stands in view then.
  await context.addInitScript((newest: string) => {
    const seen = window;

    new MutationObserver(() => {
      const log = [...document.querySelectorAll("[role=dialog] [data-agent-log]")].find((one) => !one.classList.contains("invisible"));

      if (log === undefined || seen.logShown !== undefined) return;

      // In view of the box the log scrolls in: on a phone the drawer holding it may still be rising into the window.
      let scroller = log.parentElement;

      while (scroller !== null && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;

      const last = [...log.querySelectorAll("[data-log-row]")].at(-1);
      const box = last?.getBoundingClientRect();
      const frame = scroller?.getBoundingClientRect();

      seen.logShown = {
        newestInView: last?.textContent?.includes(newest) === true && box !== undefined && frame !== undefined && box.top < frame.bottom && box.bottom > frame.top
      };
    }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
  }, JOB_LOG.newest);

  return context;
}

describe.skipIf(!origin || !touchReady())("a long job's log opened from the TODO panel", () => {
  for (const viewport of WIDTHS) {
    test(`stands its newest line in view the moment it is shown, ${viewport.width}px wide`, async () => {
      const context = await open(viewport);

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/?todo=${JOB_LOG.item}`, { waitUntil: "load" });
        await page.locator("[data-item-state-log]").click({ timeout: 20_000 });

        const dialog = page.getByRole("dialog").filter({ has: page.locator("[data-agent-log]") }).last();
        const newest = dialog.getByText(JOB_LOG.newest, { exact: true });

        await newest.waitFor({ timeout: 10_000 });
        expect(await newest.isVisible()).toBe(true);
        expect(await page.evaluate(() => window.logShown)).toEqual({ newestInView: true });
      } finally {
        await context.close();
      }
    }, 60_000);
  }
});
