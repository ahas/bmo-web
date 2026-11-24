import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, fingerOn, touchReady } from "./touch";

import type { Browser, BrowserContext, Locator, Page } from "playwright-core";
import KO from "../fixtures/browser/sidebar-sections.test.ko.json";

// A reader's own screen named in another language than the reader's, found in the console search (docs/web.md,
// 「Sidebar」, the search and the my-apps section), worked by hand at a phone's width and a desk's in Korean: with nothing
// typed the screen's row stands its reading as the sidebar's does, the original in the row's shared tooltip — brought by
// a pointer at a desk and by a held finger on a phone, which follows no link; the maker's name typed finds the row,
// saying under it that it matched the original; and choosing the row opens the screen. It drives the console
// tests/support/browser-console.ts stands up, whose tool host stand-in answers the personal-names account's one screen
// with English words alone; the translation is answered through the page's own route. The suite stands up no console,
// so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "personal-names", password: "fixture-password-4104" };
const ORIGINAL = "Ticket board";
// The reading shares no word with the original, so a typed original matches the original alone.
const READING = "Issue list read";

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

async function contextFor(width: number, height: number, phone: boolean, asked: string[][]): Promise<BrowserContext> {
  const context = await browser!.newContext({ viewport: { width, height }, hasTouch: phone, isMobile: phone, locale: "ko-KR", serviceWorkers: "block", reducedMotion: "reduce" });
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
  // The console's translator: the English name read into the reader's language.
  await context.route(/\/api\/translations$/, async (route) => {
    const body = route.request().postDataJSON() as { language: string; originals: string[] };

    asked.push([body.language, ...body.originals]);
    await route.fulfill({ json: { readings: body.originals.map((text) => ({ text: text === ORIGINAL ? READING : text, whole: true })) } });
  });

  return context;
}

// The control in view, inside the screen's width, and the point at its centre holding the control itself.
async function reachable(page: Page, control: Locator): Promise<{ x: number; y: number }> {
  await control.scrollIntoViewIfNeeded();

  const box = (await control.boundingBox())!;

  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);

  const covered = await control.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);

    return top === null || element === top || element.contains(top) ? null : top.outerHTML.slice(0, 300);
  });

  expect(covered).toBeNull();

  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

// Pressed as a hand presses it: a tap on a phone, a click at a desk.
async function press(page: Page, control: Locator, phone: boolean): Promise<void> {
  const at = await reachable(page, control);

  if (phone) await (await fingerOn(page)).tap(at);
  else await page.mouse.click(at.x, at.y);
}

// The search opened from the sidebar's button, once the reader's own screen stands read in the sidebar: on a phone the
// drawer opened from the top bar first.
async function openSearch(page: Page, phone: boolean): Promise<Locator> {
  await page.goto(`${origin}/`, { waitUntil: "load" });
  await page.waitForFunction(() => window.useNuxtApp?.().isHydrating === false, null, { timeout: 30_000 });

  if (phone) await press(page, page.getByRole("button", { name: KO.open_sidebar }), phone);

  const holder = phone ? page.getByRole("dialog") : page.locator("[id^='console-sidebar-']").first();

  await holder.getByRole("link", { name: READING }).waitFor({ timeout: 20_000 });
  await press(page, holder.locator("[data-console-search]").first(), phone);

  const box = page.getByPlaceholder(wording("screens.placeholder.find"), { exact: true });

  await box.waitFor({ timeout: 10_000 });

  return box;
}

describe.skipIf(!origin || !touchReady())("a reader's own screen in the console search", () => {
  for (const viewport of WIDTHS) {
    test(`stands as its reading, its original in its tooltip and found by it, at ${viewport.width}px`, async () => {
      const asked: string[][] = [];
      const context = await contextFor(viewport.width, viewport.height, viewport.phone, asked);

      try {
        const page = await context.newPage();
        const box = await openSearch(page, viewport.phone);

        // With nothing typed, the row names the screen by its reading, the original nowhere in the row itself.
        const row = page.getByRole("option").filter({ has: page.locator("[data-sidebar-read-name]") });

        await row.first().waitFor({ timeout: 10_000 });
        await expect(row.count()).resolves.toBe(1);
        await expect(row.locator("[data-sidebar-read-name]").textContent()).resolves.toBe(READING);
        expect(await row.textContent()).not.toContain(ORIGINAL);
        expect(asked).toContainEqual(["ko", ORIGINAL]);

        // The original stands in the row's tooltip: a pointer's hover at a desk, a held finger on a phone, which lifts
        // choosing nothing.
        const name = row.locator("[data-sidebar-read-name]");
        const at = await reachable(page, name);

        // The list may have just moved to bring the row into view, and a finger landing on a list still moving stops it
        // rather than holds a row, so the hand waits for it to settle, as a hand does.
        await page.waitForTimeout(300);
        if (viewport.phone) await (await fingerOn(page)).press(at);
        else await page.mouse.move(at.x, at.y);

        const tip = page.getByRole("tooltip").filter({ hasText: wording("screens.label.name_original", { name: ORIGINAL }) });

        await tip.first().waitFor({ timeout: 10_000 });
        await expect(tip.first().textContent()).resolves.toContain(READING);
        await expect(box.isVisible()).resolves.toBe(true);
        expect(new URL(page.url()).pathname).not.toMatch(/\/my\//);

        const tipBox = (await tip.first().boundingBox())!;

        expect(tipBox.x).toBeGreaterThanOrEqual(0);
        expect(tipBox.x + tipBox.width).toBeLessThanOrEqual(viewport.width);

        // The maker's name typed finds the row, which says under it that the original matched.
        if (viewport.phone) await press(page, box, true);
        await box.pressSequentially("Ticket");

        const found = page.getByRole("option").filter({ has: page.locator("[data-sidebar-read-name]") });

        await found.getByText(`${wording("common.label.original")} · ${ORIGINAL}`).waitFor({ timeout: 10_000 });
        await expect(found.locator("[data-sidebar-read-name]").textContent()).resolves.toBe(READING);

        // Choosing it opens the screen.
        await press(page, found.first(), viewport.phone);
        await page.waitForURL((url) => url.pathname.endsWith("/my/ticket-board"), { timeout: 20_000 });
      } finally {
        await context.close();
      }
    }, 120_000);
  }
});
