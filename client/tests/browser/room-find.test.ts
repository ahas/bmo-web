import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser } from "playwright-core";

// Finding a phrase in a room (docs/web.md, the room screen's find), in the room the console made on the record road that the
// harness's receiver stands: the menu opens the find row in the top bar, the count says which hit is shown, a step
// brings the one before into view, and Escape folds the row and takes the marks away. It drives the console
// tests/support/browser-console.ts stands up; the suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "room-find", password: "fixture-password-2261" };
const RECORD_CHAT = -9_000_000_000_099;

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

describe.skipIf(!origin || !touchReady())("finding in a room", () => {
  for (const [width, height, phone] of [[1280, 900, false], [360, 780, true]] as const) {
    test(`counts the hits, steps among them and folds away, ${width}px wide`, async () => {
      const context = await browser!.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, serviceWorkers: "block", reducedMotion: "reduce" });
      const at = cookie.indexOf("=");

      await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/rooms/${RECORD_CHAT}`, { waitUntil: "load" });
        await page.locator("[data-message]").nth(2).waitFor({ timeout: 30_000 });

        await page.getByRole("button", { name: wording("common.action.more") }).first().click();
        await page.getByRole("menuitem", { name: wording("room.action.find") }).click();

        const box = page.getByRole("textbox", { name: wording("room.label.find_box") });

        await box.waitFor({ timeout: 10_000 });
        await box.fill("record");

        const count = page.locator("[data-find-count]");

        // The count as it stands once a hit is shown.
        const counted = (said: string) => page.waitForFunction((want) => document.querySelector("[data-find-count][data-find-shown]")?.textContent?.trim() === want, said, { timeout: 10_000 });

        await counted("3/3");
        await box.press("Enter");
        await counted("2/3");
        expect((await count.innerText()).trim()).toBe("2/3");

        // The page holds no page further back, so nothing says the search was cut short.
        expect(await page.getByText(wording("room.status.find_loaded_only")).count()).toBe(0);

        await box.press("Escape");
        await page.waitForFunction(() => document.querySelector("[data-find-row]") === null, undefined, { timeout: 10_000 });
      } finally {
        await context.close();
      }
    }, 90_000);
  }
});
