import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser } from "playwright-core";

// The marker the owner's own chat stands for a task a supervisor delegated to its double (docs/web.md, the room
// screen's delegated-run marker): the harness's agency lists one run still going and one already ended, so the room
// stands the working marker for the running run alone, and stands none for the ended one. It is read at a desktop
// width and at a phone's, where the line must still fit the room. It drives the console tests/support/browser-console.ts
// stands up; the suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "delegation-marker", password: "fixture-password-2373" };

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

describe.skipIf(!origin || !touchReady())("the delegated-run marker in the owner's own chat", () => {
  test("a running delegation stands the marker and an ended one does not, at a desktop width and a phone's", async () => {
    for (const viewport of [{ width: 1280, height: 900 }, { width: 360, height: 780 }]) {
      const context = await browser!.newContext({
        viewport,
        serviceWorkers: "block",
        reducedMotion: "reduce",
        ...(viewport.width < 600 ? { deviceScaleFactor: 3, isMobile: true, hasTouch: true } : {})
      });
      const at = cookie.indexOf("=");

      await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/rooms/42`, { waitUntil: "load" });

        const marker = page.locator("[data-delegation-marker]");

        await marker.waitFor({ timeout: 30_000 });

        const running = marker.locator('[data-delegation-stage="running"]');

        expect(await running.count()).toBe(1);
        expect(await marker.locator('[data-delegation-stage="waiting"]').count()).toBe(0);
        // The ended run stands no marker while the other still goes, and nothing of it is drawn beside the marker.
        expect(await marker.locator('[data-delegation-stage="ended"]').count()).toBe(0);

        const text = (await marker.innerText()).replace(/\s+/g, " ");

        expect(text).toContain("Check the room marker");
        expect(text).not.toContain("Retire the old marker");
        expect(text).not.toContain("all checks passed");

        // The line stays inside the room at both widths rather than running past its edge.
        const box = await running.boundingBox();

        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.width).toBeLessThanOrEqual(viewport.width);
      } finally {
        await context.close();
      }
    }
  }, 120_000);
});
