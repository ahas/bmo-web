import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser } from "playwright-core";

// The agent management screen's tabs (docs/web.md, 「Agent management screen」): the supervisors, the roles and the
// repositories each stand as one shared settings table with every row the agency answers, and a column's width dragged
// moves that column alone — every other column keeps the width it stood at and the table grows or shrinks by the
// drag. It drives the console tests/support/browser-console.ts stands up; the suite stands up no console, so there it
// skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "agents-general", password: "fixture-password-2301" };

let browser: Browser | null = null;
let cookie = "";

beforeAll(async () => {
  if (!origin || !touchReady()) return;

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

describe.skipIf(!origin || !touchReady())("the agent management screen's tabs", () => {
  for (const [width, height, phone] of [[1280, 900, false], [360, 780, true]] as const) {
    test(`stand every supervisor, role and repository as a row, ${width}px wide`, async () => {
      const context = await browser!.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, serviceWorkers: "block", reducedMotion: "reduce" });
      const at = cookie.indexOf("=");

      await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/agents`, { waitUntil: "load" });
        await page.locator("#setting-supervisor-agent-a").waitFor({ timeout: 15_000 });
        expect(await page.locator("#setting-supervisor-companion-a").count()).toBe(1);
        expect((await page.getByRole("tab").allInnerTexts()).map((one) => one.trim())).toEqual(
          ["agents.label.tab_supervisors", "agents.label.tab_roles", "agents.label.tab_repositories", "agents.label.tab_models", "agents.label.tab_model_files"].map((key) => wording(key))
        );

        await page.goto(`${origin}/agents?tab=roles`, { waitUntil: "load" });
        await page.locator("#setting-role-worker").waitFor({ timeout: 15_000 });
        for (const name of ["delegator", "helper", "builder", "scout", "searcher"]) expect(await page.locator(`#setting-role-${name}`).count()).toBe(1);

        await page.goto(`${origin}/agents?tab=repositories`, { waitUntil: "load" });
        await page.locator("#setting-repository-repo-a").waitFor({ timeout: 15_000 });
        expect(await page.locator("#setting-repository-repo-c").count()).toBe(1);

        // The page itself never scrolls sideways; a wide table scrolls inside its own box.
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      } finally {
        await context.close();
      }
    }, 60_000);
  }

  test("move only the dragged column, every other one keeping its width", async () => {
    const context = await browser!.newContext({ viewport: { width: 1600, height: 900 }, serviceWorkers: "block", reducedMotion: "reduce" });
    const at = cookie.indexOf("=");

    await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

    try {
      const page = await context.newPage();

      await page.goto(`${origin}/agents`, { waitUntil: "load" });
      await page.locator("#setting-supervisor-agent-a").waitFor({ timeout: 15_000 });

      const widths = async (): Promise<number[]> =>
        await page.locator("[data-settings-table] thead > tr > th").evaluateAll((cells) => cells.map((cell) => Math.round(cell.getBoundingClientRect().width)));
      const before = await widths();
      const edge = page.locator("[data-settings-table] thead > tr > th").nth(2).getByRole("separator");
      const box = (await edge.boundingBox())!;

      // A first drag holds every width, then narrows the third column by 40 pixels.
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 - 40, box.y + box.height / 2, { steps: 5 });
      await page.mouse.up();

      const after = await widths();

      expect(after[2]).toBeLessThan(before[2]!);
      expect(after.filter((_, index) => index !== 2)).toEqual(before.filter((_, index) => index !== 2));
    } finally {
      await context.close();
    }
  }, 60_000);
});
