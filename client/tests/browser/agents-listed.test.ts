import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser } from "playwright-core";

// Which agents the sidebar and the agent management screen list (docs/web.md, 「Sidebar」): the agents a person
// designates and the workers, never the gate unit's session rows or a runner's. It drives the console
// tests/support/browser-console.ts stands up, whose agency lists all five kinds of row; the suite stands up no
// console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "agents-listed", password: "fixture-password-2255" };

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

describe.skipIf(!origin || !touchReady())("the agents listed", () => {
  test("are the designated agents and the workers, in the sidebar and on the agent management screen", async () => {
    const context = await browser!.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block", reducedMotion: "reduce" });
    const at = cookie.indexOf("=");

    await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

    try {
      const page = await context.newPage();

      await page.goto(`${origin}/agents`, { waitUntil: "load" });
      await page.getByRole("link", { name: "Worker" }).first().waitFor({ timeout: 20_000 });
      await page.waitForTimeout(1_000);

      const links = await page.locator("a[href*='/agents/']").evaluateAll((all) => all.map((one) => decodeURIComponent(one.getAttribute("href") ?? "")));

      expect(links.some((href) => href.endsWith("/agents/agent-a"))).toBe(true);
      expect(links.some((href) => href.endsWith("/agents/worker"))).toBe(true);

      for (const hidden of ["gate-session", "gate-a", "runner-a"]) {
        expect(links.some((href) => href.endsWith(`/agents/${hidden}`))).toBe(false);
      }

      expect(await page.getByText("Gate Session").count()).toBe(0);
      expect(await page.getByText("Gate A").count()).toBe(0);
      expect(await page.getByText("Runner A").count()).toBe(0);
    } finally {
      await context.close();
    }
  }, 90_000);
});
