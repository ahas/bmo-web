import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";

import type { Browser, BrowserContext, Page, Route } from "playwright-core";

// The desktop app's download page (docs/web.md, 「The desktop app's download page」): a member who holds no section
// but their account opens it from the user menu and reads the current release, Windows's installer first as the one
// primary download, its colour moving under the pointer and a press, each installer's size and SHA-256 beside it with
// a copy mark that stays in the window and copies it, Windows's warning and the three steps; no release
// published leaves the body saying so with nothing to download; a failed read offers to read again; and the pairing
// page opened with no code leads to it. Each layout is read at a desk's width and a phone's, in light and in dark, with
// nothing wider than the window. The page's own read is answered here; what the console's server makes of the
// release read is its own test's.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const MEMBER = { name: "pair-member", password: "fixture-password-3080" };
const FILES = "https://releases.example/desktop/1.2.3";
const RELEASE = {
  version: "1.2.3",
  date: "2026-11-16T11:55:30.048Z",
  files: [
    { platform: "linux", arch: "x86_64", format: "appimage", file: "App_1.2.3_amd64.AppImage", size: 86_632_952, sha256: "b".repeat(64), url: `${FILES}/App_1.2.3_amd64.AppImage` },
    { platform: "windows", arch: "x86_64", format: "nsis", file: "App_1.2.3_x64-setup.exe", size: 4_082_645, sha256: "a".repeat(64), url: `${FILES}/App_1.2.3_x64-setup.exe` },
    { platform: "linux", arch: "x86_64", format: "deb", file: "App_1.2.3_amd64.deb", size: 6_310_954, sha256: "c".repeat(64), url: `${FILES}/App_1.2.3_amd64.deb` }
  ]
};

let browser: Browser | null = null;
let cookie = "";

beforeAll(async () => {
  if (!origin || !touchReady()) return;

  const answer = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(MEMBER) });

  expect(answer.ok).toBe(true);
  cookie = answer.headers.get("set-cookie")!.split(";")[0]!;
  browser = await chromium.launch();
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();
}, BROWSER_HOOK_MS);

async function contextFor(width: number, height: number, scheme: "light" | "dark"): Promise<BrowserContext> {
  const context = await browser!.newContext({ viewport: { width, height }, colorScheme: scheme, serviceWorkers: "block", reducedMotion: "reduce" });
  const at = cookie.indexOf("=");

  await context.addCookies([
    { name: "nuxt-color-mode", value: scheme, url: origin! },
    { name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }
  ]);

  return context;
}

// The page's read, answered in turn by each of `answers`, the last standing for every read after it.
async function releaseRead(page: Page, ...answers: ((route: Route) => Promise<void>)[]): Promise<{ reads: number }> {
  const seen = { reads: 0 };

  await page.route(/\/api\/desktop\/release$/, (route) => {
    const answer = answers[Math.min(seen.reads, answers.length - 1)]!;

    seen.reads += 1;

    return answer(route);
  });

  return seen;
}

function json(body: unknown, status = 200): (route: Route) => Promise<void> {
  return (route) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

async function standing(page: Page): Promise<void> {
  await page.waitForFunction(() => window.useNuxtApp?.().isHydrating === false, null, { timeout: 30_000 });
}

// How far the page's widest box stands past the window.
async function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

describe.skipIf(!origin || !touchReady())("the desktop app's download page", () => {
  for (const [width, height] of [[1280, 900], [360, 780]] as const) {
    for (const scheme of ["light", "dark"] as const) {
      test(`a member reads the release with Windows's installer first, at ${width}px in ${scheme}`, async () => {
        const context = await contextFor(width, height, scheme);

        try {
          await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: origin! });

          const page = await context.newPage();

          await releaseRead(page, json({ release: RELEASE }));
          await page.goto(`${origin}/desktop`, { waitUntil: "load" });
          await standing(page);

          await page.locator("[data-desktop-version]").getByText(RELEASE.version, { exact: true }).waitFor({ timeout: 20_000 });

          // Windows first, Linux next with both its installers; the page's one primary download is Windows's.
          const platforms = page.locator("[data-desktop-platform]");

          expect(await platforms.evaluateAll((sections) => sections.map((section) => section.getAttribute("data-desktop-platform")))).toEqual(["windows", "linux"]);
          expect(await platforms.nth(1).locator("[data-desktop-file]").evaluateAll((files) => files.map((file) => file.getAttribute("data-desktop-file")))).toEqual(["appimage", "deb"]);

          const downloads = page.locator("[data-desktop-download]");

          expect(await downloads.count()).toBe(3);
          expect(await downloads.first().getAttribute("href")).toBe(RELEASE.files[1]!.url);
          expect(await downloads.first().getAttribute("download")).not.toBeNull();
          expect(await page.getByRole("link", { name: wording("desktop.action.download"), exact: true }).count()).toBe(3);

          // Each installer carries its size, rounded and in bytes, and its SHA-256 whole.
          const windows = platforms.first();

          expect(await windows.textContent()).toContain(wording("desktop.label.size_value", { size: "3.9MB", bytes: "4,082,645" }));
          expect(await windows.locator("[data-desktop-sha256]").textContent()).toBe(RELEASE.files[1]!.sha256);

          // The copy mark stands inside the window at every width, though the digest beside it runs past a phone's, and
          // copies the digest whole.
          const copy = windows.getByRole("button", { name: wording("common.action.copy"), exact: true });
          const mark = (await copy.boundingBox())!;

          expect(mark.x).toBeGreaterThanOrEqual(0);
          expect(mark.x + mark.width).toBeLessThanOrEqual(width);
          await copy.click();
          await page.waitForFunction((digest) => navigator.clipboard.readText().then((text) => text === digest), RELEASE.files[1]!.sha256, { timeout: 10_000 });

          // The primary download changes its colour from rest under the pointer and under a press.
          if (width >= 1024) {
            const primary = downloads.first();
            const ground = () => primary.evaluate((element) => getComputedStyle(element).backgroundColor);
            const rest = await ground();
            const handle = await primary.elementHandle();
            const changed = (from: string) =>
              page.waitForFunction(([element, colour]) => getComputedStyle(element as Element).backgroundColor !== colour, [handle, from] as const, { timeout: 5_000 });

            await primary.hover();
            await changed(rest);
            await page.mouse.move(0, 0);
            await page.waitForFunction(([element, colour]) => getComputedStyle(element as Element).backgroundColor === colour, [handle, rest] as const, { timeout: 5_000 });

            const box = (await primary.boundingBox())!;

            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
            await page.mouse.down();
            await changed(rest);
            expect(await ground()).not.toBe(rest);
            await page.mouse.move(0, 0);
            await page.mouse.up();
          }

          // Windows may warn before an unsigned installer runs, and only the Windows installer says so.
          expect(await page.locator("[data-desktop-unsigned]").count()).toBe(1);
          expect(await windows.locator("[data-desktop-unsigned]").isVisible()).toBe(true);
          expect(await page.locator("[data-desktop-steps] li").count()).toBe(3);
          expect(await overflow(page)).toBeLessThanOrEqual(0);
        } finally {
          await context.close();
        }
      }, 120_000);
    }

    test(`no release published says so with nothing to download, and a failed read is read again, at ${width}px`, async () => {
      const context = await contextFor(width, height, "dark");

      try {
        const page = await context.newPage();

        await releaseRead(page, json({ release: null }));
        await page.goto(`${origin}/desktop`, { waitUntil: "load" });
        await standing(page);
        await page.getByText(wording("desktop.status.none"), { exact: true }).waitFor({ timeout: 20_000 });
        expect(await page.locator("[data-desktop-download]").count()).toBe(0);
        expect(await page.locator("[data-desktop-steps]").count()).toBe(0);
        expect(await overflow(page)).toBeLessThanOrEqual(0);

        const failing = await context.newPage();
        // The console's fetch asks a GET that answers 502 once more by itself, so the read fails twice before it is read
        // again by hand.
        const broken = json({ message: wording("desktop.error.unreadable") }, 502);
        const seen = await releaseRead(failing, broken, broken, json({ release: RELEASE }));

        await failing.goto(`${origin}/desktop`, { waitUntil: "load" });
        await standing(failing);
        await failing.getByText(wording("desktop.error.unreadable"), { exact: true }).waitFor({ timeout: 20_000 });
        await failing.getByRole("button", { name: wording("common.action.refresh"), exact: true }).click();
        await failing.locator("[data-desktop-version]").waitFor({ timeout: 20_000 });
        expect(seen.reads).toBe(3);
      } finally {
        await context.close();
      }
    }, 120_000);
  }

  test("the user menu leads to the page and its way back returns", async () => {
    const context = await contextFor(1280, 900, "light");

    try {
      const page = await context.newPage();

      await releaseRead(page, json({ release: RELEASE }));
      // The member's home, the first screen their sections open, is where the menu is opened from.
      // The development server builds the home screen the first time it is asked for, which takes longer than a page.
      await page.goto(`${origin}/`, { waitUntil: "load", timeout: 120_000 });
      await standing(page);

      const home = page.url();

      await page.getByRole("button", { name: MEMBER.name, exact: true }).click();
      await page.getByRole("menuitem", { name: wording("desktop.title.page") }).click();
      await page.waitForURL(/\/desktop$/, { timeout: 20_000 });
      await page.locator("[data-desktop-version]").waitFor({ timeout: 20_000 });

      // The way back returns to the screen the page was opened from.
      await page.locator("[data-way-back]").click();
      await page.waitForURL(home, { timeout: 20_000 });
    } finally {
      await context.close();
    }
  }, 240_000);

  test("the pairing page opened with no code leads to the download page", async () => {
    const context = await contextFor(360, 780, "light");

    try {
      const page = await context.newPage();

      await releaseRead(page, json({ release: RELEASE }));
      await page.goto(`${origin}/desktop/pair`, { waitUntil: "load" });
      await standing(page);
      await page.getByText(wording("pairing.message.no_code"), { exact: true }).waitFor({ timeout: 20_000 });
      await page.locator("[data-pairing-download]").click();
      await page.waitForURL(/\/desktop$/, { timeout: 20_000 });
      await page.locator("[data-desktop-version]").waitFor({ timeout: 20_000 });
    } finally {
      await context.close();
    }
  }, 120_000);
});
