import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, BrowserContext, Locator, Page } from "playwright-core";
import KO from "../fixtures/browser/sidebar-sections.test.ko.json";

// A reader's own screen (docs/web.md, 「A reader's own screens」), worked by hand at a desk's width and a phone's: its
// entry stands in the sidebar's my-apps section, a press opens it under the console's title bar, its module is read
// through the relay under the digest of its index and kept for good, and its button calls its app's own tool and
// shows what the tool answered; a call to it from another page is refused. Once the screen itself turns the PC off,
// its address opens onto the console's page saying the PC is off, at both widths. Every press lands on the control it
// says, nothing standing over it. It drives the console tests/support/browser-console.ts stands up, whose agency and
// tool host stand-ins answer the screen's session, list, module and calls; the suite stands up no console, so there it
// skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "personal-screens", password: "fixture-password-4102" };
const MINE = wording("screens.label.section_mine");
const PC_OFF = wording("screens.error.pc_off");
const TITLE = "Weekly notes";

const WIDTHS = [
  { width: 360, height: 740, phone: true },
  { width: 1280, height: 800, phone: false }
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

async function contextFor(width: number, height: number, phone: boolean): Promise<BrowserContext> {
  const context = await browser!.newContext({ viewport: { width, height }, hasTouch: phone, isMobile: phone, locale: "ko-KR", serviceWorkers: "block", reducedMotion: "reduce" });
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

  return context;
}

// Pressed as a hand presses it: the control in view and inside the screen's width, the point at its centre holding the
// control itself, then a tap on a phone and a click at a desk.
async function press(page: Page, control: Locator, phone: boolean): Promise<void> {
  await control.scrollIntoViewIfNeeded();

  const box = (await control.boundingBox())!;
  const viewport = page.viewportSize()!;

  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);

  const covered = await control.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);

    return top === null || element === top || element.contains(top) ? null : top.outerHTML.slice(0, 300);
  });

  expect(covered).toBeNull();
  if (phone) await control.tap();
  else await control.click();
}

// The home screen drawn and hydrated, and the sidebar the reader holds: on a phone, the drawer opened from the top bar.
async function sidebar(page: Page, phone: boolean): Promise<Locator> {
  await page.goto(`${origin}/`, { waitUntil: "load" });
  await page.waitForFunction(() => window.useNuxtApp?.().isHydrating === false, null, { timeout: 30_000 });

  if (!phone) return page.locator("[id^='console-sidebar-']").first();

  await press(page, page.getByRole("button", { name: KO.open_sidebar }), true);

  return page.getByRole("dialog");
}

describe.skipIf(!origin || !touchReady())("a reader's own screen", () => {
  for (const viewport of WIDTHS) {
    test(`opens from the my-apps section, reads its module by its digest and calls its own tool at ${viewport.width}px`, async () => {
      const context = await contextFor(viewport.width, viewport.height, viewport.phone);

      try {
        const page = await context.newPage();
        const modules: { url: string; cache: string | null; status: number }[] = [];

        page.on("response", (response) => {
          if (/\/api\/my-weekly-notes\/files\/[0-9a-f]{64}\/module\.js$/.test(response.url())) {
            modules.push({ url: response.url(), cache: response.headers()["cache-control"] ?? null, status: response.status() });
          }
        });

        const holder = await sidebar(page, viewport.phone);
        const mine = holder.locator(`nav[aria-label="${MINE}"]`);

        await mine.waitFor({ timeout: 20_000 });
        expect(await mine.locator("[data-slot='label']").first().textContent()).toBe(MINE);

        await press(page, mine.getByRole("link", { name: TITLE }), viewport.phone);
        await page.waitForURL(/\/my\/weekly-notes$/, { timeout: 20_000 });

        const screen = page.locator("[data-personal-screen='my-weekly-notes']");

        await screen.waitFor({ timeout: 20_000 });
        await expect(page.locator("[data-title-bar] [data-slot=title]").first().textContent()).resolves.toContain(TITLE);
        expect(modules.length).toBeGreaterThan(0);
        expect(modules[0]).toMatchObject({ status: 200, cache: "private, max-age=31536000, immutable" });

        await press(page, screen.locator("[data-personal-load]"), viewport.phone);
        await page.waitForFunction(() => document.querySelector("[data-personal-said]")?.textContent === "notes of week 47", null, { timeout: 10_000 });

        // The screen's tool is its own page's alone: the same call from the console's home is refused.
        await page.goto(`${origin}/`, { waitUntil: "load" });

        const elsewhere = await page.evaluate(
          async (address) => (await fetch(address, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status,
          `${origin}/api/my-weekly-notes/tools/weekly_notes`
        );

        expect(elsewhere).toBe(403);
      } finally {
        await context.close();
      }
    }, 120_000);
  }

  test("says the PC is off once it is, at a phone's width and a desk's", async () => {
    const phone = await contextFor(360, 740, true);
    const desk = await contextFor(1280, 800, false);

    try {
      const page = await phone.newPage();

      await page.goto(`${origin}/my/weekly-notes`, { waitUntil: "load" });

      const screen = page.locator("[data-personal-screen='my-weekly-notes']");

      await screen.waitFor({ timeout: 30_000 });
      await press(page, screen.locator("[data-personal-off]"), true);
      await page.waitForFunction(() => document.querySelector("[data-personal-said]")?.textContent === "off", null, { timeout: 10_000 });

      for (const held of [page, await desk.newPage()]) {
        await held.goto(`${origin}/my/weekly-notes`, { waitUntil: "load" });

        const unavailable = held.locator("[data-screen-unavailable]");

        await unavailable.waitFor({ timeout: 30_000 });
        expect((await unavailable.textContent())?.includes(PC_OFF)).toBe(true);
        expect(await held.locator("[data-personal-screen]").count()).toBe(0);

        // The page stands whole inside the width, its key reachable.
        const key = unavailable.getByRole("button");
        const box = (await key.boundingBox())!;

        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(held.viewportSize()!.width);
      }

      // The PC turned on again through the screen's own road, from a page at its address, for the next run.
      const turned = await page.evaluate(
        async (address) => (await fetch(address, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ on: true }) })).status,
        `${origin}/api/my-weekly-notes/tools/pc_switch`
      );

      expect(turned).toBe(200);
    } finally {
      await phone.close();
      await desk.close();
    }
  }, 120_000);
});
