import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { ASKED_RUN } from "../support/asked-run";
import { POLL_INTERVAL_MS } from "../../apps/web/shared/config";

import type { Browser, Locator, Page } from "playwright-core";
import type { AgentList, AgentSummary } from "../../apps/web/shared/types";

// An agent row nested under a sidebar branch stands open until it is folded, one whose lines first come while the
// sidebar stands among them, and its state is its agent's wherever the agent stands in the list (docs/web.md,
// 「Sidebar」). The console's agent list is rewritten on its way to the page, so the lines and the order change
// between two reads while the sidebar stands, and the page's clock is moved on to the next read rather than waited
// for. A role's row with runs going keeps its name whole at the sidebar's opening width. It drives the console
// tests/support/browser-console.ts stands up, whose roles hold a worker and a seeker with runs going; the
// suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "sidebar-agent-rows", password: "fixture-password-3165" };
const WIDE = { width: 1280, height: 800 };

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

// What the test makes of the agent list the console serves: whether the seeker's runs stand, and whether it
// stands before the worker.
interface Shape {
  seekerRuns: boolean;
  seekerFirst: boolean;
}

function reshaped(list: AgentList, shape: Shape): AgentList {
  const isRole = (name: string) => (agent: AgentSummary) => agent.kind === "role" && agent.name === name;
  const seeker = list.agents.find(isRole(ASKED_RUN.role))!;
  const shaped = shape.seekerRuns ? seeker : { ...seeker, running: 0, runs: [] };
  const others = list.agents.filter((agent) => !isRole(ASKED_RUN.role)(agent));
  const worker = others.findIndex(isRole("worker"));
  const at = shape.seekerFirst ? worker : worker + 1;

  return { ...list, agents: [...others.slice(0, at), shaped, ...others.slice(at)] };
}

// A role's row in the sidebar, by the name it stands under.
function roleRow(page: Page, name: string): Locator {
  return page.locator('nav [data-slot="linkLabel"]').filter({ hasText: new RegExp(`^\\s*${name}\\s*$`) }).first().locator("xpath=ancestor::li[1]");
}

// The control that folds a row's lines, the one a row with lines under it carries, standing as asked where that is
// given.
function linesControl(row: Locator, expanded?: "true" | "false"): Locator {
  return row.locator(`[data-slot="linkTrailing"][aria-controls]${expanded === undefined ? "" : `[aria-expanded="${expanded}"]`}`).first();
}

// The sidebar reads the agents again on its clock, and the page has taken that read in.
async function readAgain(page: Page): Promise<void> {
  const read = page.waitForResponse(/\/api\/agents(\?|$)/, { timeout: 10_000 });

  await page.clock.runFor(POLL_INTERVAL_MS * 2);
  await read;
}

// The roles' rows stand in the order named.
async function standInOrder(page: Page, first: string, second: string): Promise<void> {
  await page.waitForFunction(([before, after]) => {
    const labels = [...document.querySelectorAll('nav [data-slot="linkLabel"]')].map((label) => label.textContent?.trim());
    const at = labels.indexOf(before);

    return at >= 0 && at < labels.indexOf(after);
  }, [first, second] as const, { timeout: 5_000 });
}

describe.skipIf(!origin || !touchReady())("the agent rows nested under the sidebar's branches", () => {
  test("a row whose lines first come opens, and a folded row stays folded wherever its agent stands", async () => {
    const context = await browser!.newContext({ viewport: WIDE, serviceWorkers: "block", reducedMotion: "reduce" });
    const at = cookie.indexOf("=");

    await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

    try {
      const page = await context.newPage();
      const shape: Shape = { seekerRuns: false, seekerFirst: false };

      // The stream is down, so the sidebar's clock is what reads the agents again.
      await page.route(/\/api\/events/, (route) => route.abort());
      await page.route(/\/api\/agents(\?|$)/, async (route) => {
        const served = await route.fetch();

        await route.fulfill({ response: served, json: reshaped((await served.json()) as AgentList, shape) });
      });
      await page.clock.install();
      await page.goto(`${origin}/`, { waitUntil: "load" });

      const worker = roleRow(page, "worker");
      const seeker = roleRow(page, ASKED_RUN.role);

      await worker.waitFor({ timeout: 10_000 });
      expect(await linesControl(seeker).count()).toBe(0);

      // Its first run comes while the sidebar stands: the row opens on it as the worker's did from the start.
      shape.seekerRuns = true;
      await readAgain(page);
      await linesControl(seeker, "true").waitFor({ timeout: 5_000 });
      expect(await page.locator(`[id="${await linesControl(seeker).getAttribute("aria-controls")}"]`).innerText()).toContain(ASKED_RUN.title);
      expect(await linesControl(worker).getAttribute("aria-expanded")).toBe("true");

      // Folded, then standing before the worker: the fold stays with the seeker and the worker stays open.
      await linesControl(seeker).click();
      await linesControl(seeker, "false").waitFor({ timeout: 5_000 });
      shape.seekerFirst = true;
      await readAgain(page);
      await standInOrder(page, ASKED_RUN.role, "worker");
      expect(await linesControl(seeker).getAttribute("aria-expanded")).toBe("false");
      expect(await linesControl(worker).getAttribute("aria-expanded")).toBe("true");

      // Its run ends and another comes: the row comes back folded, as it was left.
      shape.seekerRuns = false;
      await readAgain(page);
      await linesControl(seeker).waitFor({ state: "detached", timeout: 5_000 });
      shape.seekerRuns = true;
      await readAgain(page);
      await linesControl(seeker).waitFor({ timeout: 5_000 });
      expect(await linesControl(seeker).getAttribute("aria-expanded")).toBe("false");
      expect(await linesControl(worker).getAttribute("aria-expanded")).toBe("true");
    } finally {
      await context.close();
    }
  }, 60_000);

  // A role with runs going stands its name whole beside its count badge and its chevron at the width the sidebar
  // opens at, on the desktop's narrowest window as on a wider one, and its turning mark goes around its own mark
  // rather than taking a place at the line's end (docs/web.md, 「Sidebar」).
  test.each([1024, 1280])("a running role's name stands whole at the sidebar's opening width on a %ipx window", async (width) => {
    const context = await browser!.newContext({ viewport: { ...WIDE, width }, serviceWorkers: "block", reducedMotion: "reduce" });
    const at = cookie.indexOf("=");

    await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

    try {
      const page = await context.newPage();

      await page.goto(`${origin}/`, { waitUntil: "load" });

      for (const name of ["worker", ASKED_RUN.role]) {
        const link = roleRow(page, name).locator('[data-slot="link"]').first();

        await link.locator('[data-slot="busyMark"]').waitFor({ timeout: 10_000 });
        expect(await link.locator('[data-slot="linkTrailing"] [data-slot="busyMark"]').count()).toBe(0);

        const label = await link.locator('[data-slot="linkLabel"]').evaluate((element) => ({ shown: element.clientWidth, needed: element.scrollWidth }));

        expect(label.needed).toBeGreaterThan(0);
        expect(label.shown).toBeGreaterThanOrEqual(label.needed);
      }
    } finally {
      await context.close();
    }
  }, 60_000);
});
