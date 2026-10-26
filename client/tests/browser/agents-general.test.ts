import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser } from "playwright-core";

// The agents screen's one general tab (docs/web.md, 「Agent management screen」): every section of the agency's own
// settings on it, and every agent in the agent table once, though the agency names a worker in both its agents'
// answer and its workers'. It drives the console tests/support/browser-console.ts stands up; the suite stands up no
// console, so there it skips.

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

describe.skipIf(!origin || !touchReady())("the agents screen's general tab", () => {
  for (const [width, height, phone] of [[1280, 900, false], [360, 780, true]] as const) {
    test(`stands every section on one tab and every agent once, ${width}px wide`, async () => {
      const context = await browser!.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, serviceWorkers: "block", reducedMotion: "reduce" });
      const at = cookie.indexOf("=");

      await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/agents`, { waitUntil: "load" });
        await page.getByRole("heading", { name: wording("agents.title.section_agents") }).waitFor({ timeout: 15_000 });

        // No tab of its own for the supply or the agents: their sections stand on the general tab.
        const tabs = await page.getByRole("tab").allInnerTexts();

        expect(tabs.map((one) => one.trim())).not.toContain(wording("agents.title.section_agents"));
        for (const title of ["agents.title.section_providers", "agents.title.registry", "agents.title.catalogue", "agents.title.base_prompts", "agents.title.section_keepalive"]) {
          await expect(page.getByRole("heading", { name: wording(title), exact: true }).count()).resolves.toBe(1);
        }

        // The worker the agency names twice stands in the agent table once.
        const table = page.locator("section#settings-agents, section[aria-labelledby='agents-title']").first();
        const workerRows = table.locator('a[href$="/agents/worker"]');

        await workerRows.first().waitFor({ timeout: 15_000 });
        expect(await workerRows.count()).toBe(1);
        expect(await table.locator('a[href$="/agents/agent-a"]').count()).toBe(1);
      } finally {
        await context.close();
      }
    }, 60_000);
  }
});
