import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser } from "playwright-core";

// A supervisor's settings stand in tabs as an agent's do (docs/web.md, 「Agent management screen」, the agents tab): the
// tab row heads the dialog's body, it names its own settings, its system prompt and its draft, and a change written in
// one tab is still there after another was shown. A desktop's width and a phone's. It drives the console
// tests/support/browser-console.ts stands up; the suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "supervisor-tabs", password: "fixture-password-3378" };
const SCREENS = [
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

describe.skipIf(!origin || !touchReady())("a supervisor's settings", () => {
  for (const screen of SCREENS) {
    test(`stand in tabs, and keep a change across them, at ${screen.width}px`, async () => {
      const context = await browser!.newContext({ viewport: { width: screen.width, height: screen.height }, isMobile: screen.phone, hasTouch: screen.phone, reducedMotion: "reduce" });
      const at = cookie.indexOf("=");

      await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/organization?company=platform&tab=supervisors`, { waitUntil: "load" });

        const menu = page.getByRole("button", { name: wording("common.aria.menu_of", { name: "Agent A" }), exact: true });

        await menu.waitFor({ timeout: 20_000 });
        await menu.click();
        await page.getByRole("menuitem", { name: wording("agents.action.settings"), exact: true }).click();

        const dialog = page.getByRole("dialog");
        const tabs = dialog.locator("[data-supervisor-tabs]");

        await tabs.waitFor({ timeout: 10_000 });
        expect(await tabs.getByRole("tab").allInnerTexts()).toEqual([
          wording("agents.label.agent_tab_general"),
          wording("agents.label.agent_prompt"),
          wording("agents.title.draft")
        ]);

        // The tab row is the first thing under the dialog's head, so nothing stands between them.
        const head = (await dialog.locator("[data-slot=header]").boundingBox())!;
        const row = (await dialog.locator("[data-supervisor-tabs]").boundingBox())!;

        expect(Math.abs(row.y - (head.y + head.height))).toBeLessThanOrEqual(2);

        const label = dialog.getByRole("textbox").first();
        const written = `Agent A ${screen.width}`;

        await label.fill(written);
        await tabs.getByRole("tab", { name: wording("agents.title.draft") }).click();
        await tabs.getByRole("tab", { name: wording("agents.label.agent_tab_general") }).click();
        expect(await label.inputValue()).toBe(written);
      } finally {
        await context.close();
      }
    }, 90_000);
  }
});
