import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";

import type { Browser } from "playwright-core";

// Which agents the sidebar lists (docs/web.md, 「Sidebar」): the agency's two axes and its places in three branches —
// the supervisors, the roles and the repositories — each read from the agency's own lists, and a gate in none of them. It drives the console
// tests/support/browser-console.ts stands up; the suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "agents-listed", password: "fixture-password-2255" };

const BRANCH_KEYS = ["agents.label.group_supervisor", "agents.label.group_role", "agents.label.group_repository"];

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
  test("stand in the sidebar as the supervisors, the roles and the repositories, and no gate among them", async () => {
    const context = await browser!.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block", reducedMotion: "reduce" });
    const at = cookie.indexOf("=");

    await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

    try {
      const page = await context.newPage();

      await page.goto(`${origin}/`, { waitUntil: "load" });

      const sidebar = page.locator("#dashboard-sidebar-default, [data-slot='sidebar'], aside").first();
      const branches = BRANCH_KEYS.map((key) => wording(key));

      await sidebar.getByText(branches[0]!, { exact: true }).first().waitFor({ timeout: 20_000 });

      const told = await sidebar.innerText();
      const where = branches.map((name) => told.indexOf(name));

      // Each branch stands where its list holds anything, in this order.
      expect(where.every((one) => one >= 0)).toBe(true);
      expect([...where].sort((one, other) => one - other)).toEqual(where);

      const links = await sidebar.locator("a[href*='/agents/']").evaluateAll((all) => all.map((one) => decodeURIComponent(one.getAttribute("href") ?? "")));

      for (const hidden of ["gate-session", "gate-a"]) {
        expect(links.some((href) => href.endsWith(`/agents/${hidden}`))).toBe(false);
      }
    } finally {
      await context.close();
    }
  }, 90_000);
});
