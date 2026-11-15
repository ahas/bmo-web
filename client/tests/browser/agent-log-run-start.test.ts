import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { ROLE_LOG, RUN_FROM } from "../support/role-log";

import type { Browser, Page } from "playwright-core";

// A working agent's state cell opens its role's log where that run started, not at the log's end (docs/web.md,
// 「Agent screen」): the role's log holds the lines of several agents, one of them running a job since the middle of
// it, and the run's first line stands at the top of the log's view once the lines above it have been read in, with
// none of the log's newer lines followed. The log is the console's own read through the agency's stand-in
// (tests/support/role-log.ts).
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up; the suite
// stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "agent-log-run-start", password: "fixture-password-3055" };
const WIDTHS = [
  { width: 1280, height: 800, phone: false },
  { width: 360, height: 780, phone: true }
] as const;

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

// Where the run's first line stands in the box the log scrolls in, below whatever head stays at its top: how far its
// top is from the top of what is in view, and whether a row of the log stands in view above it.
async function runStart(page: Page): Promise<{ offset: number; rowAbove: boolean; scrolled: number }> {
  return await page.evaluate((header) => {
    const log = document.querySelector("[role=dialog] [data-agent-log]")!;
    let scroller = log.parentElement!;

    while (!/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement!;

    const head = scroller.querySelector("[data-work-head]");
    const top = Math.max(scroller.getBoundingClientRect().top, head?.getBoundingClientRect().bottom ?? 0);
    const rows = [...log.querySelectorAll("[data-log-row]")];
    const at = rows.findIndex((row) => row.getAttribute("data-log-row") === String(header));
    const above = rows.slice(0, at).filter((row) => row.getBoundingClientRect().bottom > top + 1);

    return { offset: Math.round(rows[at]!.getBoundingClientRect().top - top), rowAbove: above.length > 0, scrolled: scroller.scrollTop };
  }, RUN_FROM);
}

describe.skipIf(!origin || !touchReady())("a working agent's state cell", () => {
  for (const viewport of WIDTHS) {
    test(`opens its role's log of several agents at the start of the run, ${viewport.width}px wide`, async () => {
      const context = await browser!.newContext({
        viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.phone, hasTouch: viewport.phone, serviceWorkers: "block", reducedMotion: "reduce"
      });
      const at = cookie.indexOf("=");
      const now = Date.now();

      await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
      // The seat runs the job, opened by the job's run.
      await context.route(/\/api\/agent-runs$/, (route) =>
        route.fulfill({
          json: {
            readAt: now,
            runs: [
              {
                role: ROLE_LOG.role, agent: ROLE_LOG.seat, place: ROLE_LOG.checkout, path: `/srv/checkouts/${ROLE_LOG.checkout}`, source: "Job", provider: null,
                model: null, since: now - 600_000, title: "Running item", itemId: ROLE_LOG.item, log: ROLE_LOG.run, session: null,
                stop: { kind: "item", id: String(ROLE_LOG.item) }
              }
            ],
            reservations: []
          }
        })
      );

      try {
        const page = await context.newPage();
        const log = new RegExp(`/api/agents/${ROLE_LOG.role}/log\\?`);
        const reads: string[] = [];

        page.on("request", (request) => {
          if (log.test(request.url())) reads.push(new URL(request.url()).search);
        });

        await page.goto(`${origin}/agents?tab=supervisors`, { waitUntil: "load" });

        const cell = page.locator("[data-role-agents-table] tbody tr").filter({ hasText: ROLE_LOG.seat }).locator('[data-agent-state="working"]');

        await cell.waitFor({ timeout: 15_000 });
        await cell.click();

        const dialog = page.getByRole("dialog").filter({ has: page.locator("[data-agent-log]") }).last();
        const header = dialog.getByText(ROLE_LOG.header, { exact: true });

        // The run is read from its start, and the lines above it are read in once it stands.
        await header.waitFor({ timeout: 15_000 });
        await dialog.locator(`[data-log-row="${RUN_FROM - 1}"]`).waitFor({ state: "attached", timeout: 15_000 });
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

        expect(reads.slice(0, 2)).toEqual([`?run=${ROLE_LOG.run}&after=0&limit=200`, `?before=${RUN_FROM}&limit=200`]);

        const stands = await runStart(page);

        expect(stands.rowAbove).toBe(false);
        expect(Math.abs(stands.offset)).toBeLessThanOrEqual(1);
        expect(stands.scrolled).toBeGreaterThan(0);
        expect(await header.isVisible()).toBe(true);
        // The log's newer lines are not followed: the way to its end stands.
        expect(await dialog.locator("[data-log-to-end]").isVisible()).toBe(true);
      } finally {
        await context.close();
      }
    }, 60_000);
  }
});
