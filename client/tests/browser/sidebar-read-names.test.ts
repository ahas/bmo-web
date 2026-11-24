import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, fingerOn, touchReady } from "./touch";

import type { Browser, BrowserContext, Locator, Page } from "playwright-core";
import KO from "../fixtures/browser/sidebar-sections.test.ko.json";

// A reader's own screen named in another language than the reader's (docs/web.md, 「Sidebar」, the my-apps section), worked by hand at
// a phone's width and a desk's in Korean: an English-only screen's name stands in its row as the console's translator
// read it, the original kept in the row's shared tooltip — brought by a pointer at a desk and by a held finger on a
// phone, which follows no link — and the row still leads to the screen. It drives the console
// tests/support/browser-console.ts stands up, whose tool host stand-in answers the personal-names account's one screen
// with English words alone; the translation is answered through the page's own route. The suite stands up no console,
// so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "personal-names", password: "fixture-password-4104" };
const MINE = wording("screens.label.section_mine");
const ORIGINAL = "Ticket board";
const READING = "Read board of tickets";

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

// The home screen drawn and hydrated, and the sidebar the reader holds: on a phone, the drawer opened from the top bar.
async function sidebar(page: Page, phone: boolean): Promise<Locator> {
  await page.goto(`${origin}/`, { waitUntil: "load" });
  await page.waitForFunction(() => window.useNuxtApp?.().isHydrating === false, null, { timeout: 30_000 });

  if (!phone) return page.locator("[id^='console-sidebar-']").first();

  const opener = page.getByRole("button", { name: KO.open_sidebar });
  const at = await reachable(page, opener);

  await (await fingerOn(page)).tap(at);

  return page.getByRole("dialog");
}

describe.skipIf(!origin || !touchReady())("a reader's own screen named in another language", () => {
  for (const viewport of WIDTHS) {
    test(`stands in the sidebar as its reading, its original in its tooltip, at ${viewport.width}px`, async () => {
      const asked: string[][] = [];
      const context = await contextFor(viewport.width, viewport.height, viewport.phone, asked);

      try {
        const page = await context.newPage();
        const holder = await sidebar(page, viewport.phone);
        const mine = holder.locator(`nav[aria-label="${MINE}"]`);

        await mine.waitFor({ timeout: 20_000 });

        // The row names the screen by its reading once it comes, the original nowhere in the row itself.
        const row = mine.getByRole("link", { name: READING });

        await row.waitFor({ timeout: 20_000 });
        expect(await row.getAttribute("href")).toMatch(/\/my\/ticket-board$/);
        await expect(row.locator("[data-sidebar-read-name]").textContent()).resolves.toBe(READING);
        expect(await row.textContent()).not.toContain(ORIGINAL);
        expect(asked).toContainEqual(["ko", ORIGINAL]);

        // The original stands in the row's tooltip: a pointer's hover at a desk, a held finger on a phone, which lifts
        // pressing nothing.
        const name = row.locator("[data-sidebar-read-name]");
        const at = await reachable(page, name);
        const before = page.url();

        if (viewport.phone) await (await fingerOn(page)).press(at);
        else await page.mouse.move(at.x, at.y);

        const tip = page.getByRole("tooltip").filter({ hasText: wording("screens.label.name_original", { name: ORIGINAL }) });

        await tip.first().waitFor({ timeout: 10_000 });
        await expect(tip.first().textContent()).resolves.toContain(READING);
        expect(page.url()).toBe(before);

        const box = (await tip.first().boundingBox())!;

        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      } finally {
        await context.close();
      }
    }, 120_000);
  }
});
