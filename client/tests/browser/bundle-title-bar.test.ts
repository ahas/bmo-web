import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, Page } from "playwright-core";

// The console's title bar and the place in it a screen a unit brings lays its actions stand before that screen does,
// on every road to it (docs/web.md, 「The title bar」): the first load, from a screen of the console's own, and from
// another bundle's screen. The two screens the harness's stand-in units bring (tests/support/browser-console.ts)
// note whether the place stood as they mounted and redraw what they lay in it, so a place standing late shows as an
// error on the page. It drives the console tests/support/browser-console.ts stands up; the suite stands up no
// console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "bundle-bar", password: "fixture-password-2258" };

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

// The app stood in the page the server drew: until the mount carries it, there is no router to make a move with.
async function hydrated(page: Page): Promise<void> {
  await page.waitForFunction(() => Reflect.get(document.querySelector("#__nuxt") ?? {}, "__vue_app__") !== undefined, null, { timeout: 30_000 });
}

// A move inside the app, the way the sidebar makes one: the router asked for the path, the page left standing. What
// the move brings is waited on by what the page shows, never by the router's own promise.
async function go(page: Page, path: string): Promise<void> {
  await page.evaluate(`void document.querySelector("#__nuxt").__vue_app__.config.globalProperties.$router.push(${JSON.stringify(path)})`);
}

async function mounts(page: Page): Promise<{ screen: string; slot: boolean }[]> {
  return (await page.evaluate("globalThis.__screenMounts ?? []")) as { screen: string; slot: boolean }[];
}

// The screen standing, its action laid in the bar's place, and some redraws past it.
async function standing(page: Page, screen: string): Promise<void> {
  await page.locator(`[data-screen="${screen}"]`).waitFor({ timeout: 30_000 });
  await page.locator(`[data-title-bar-screen-actions] [data-screen-action="${screen}"]`).waitFor({ timeout: 5_000 });
  await page.waitForTimeout(600);
}

describe.skipIf(!origin || !touchReady())("a screen a unit brings, under the console's title bar", () => {
  test("finds the bar's place for its actions as it mounts on the first load, at 360", async () => {
    const context = await browser!.newContext({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true, serviceWorkers: "block", reducedMotion: "reduce" });
    const at = cookie.indexOf("=");

    await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

    try {
      const page = await context.newPage();
      const errors: string[] = [];

      page.on("pageerror", (error) => errors.push(String(error)));

      // The first load of a bundle's screen.
      await page.goto(`${origin}/screen-a`, { waitUntil: "load" });
      await standing(page, "screen-a");

      expect(errors).toEqual([]);
      expect(await mounts(page)).toEqual([{ screen: "screen-a", slot: true }]);
      expect(await page.locator("[data-title-bar-screen-actions]").count()).toBe(1);
    } finally {
      await context.close();
    }
  }, 180_000);

  test("finds it as it mounts on every move inside the app — from a screen of the console's own, from another bundle's, and back — at 360", async () => {
    const context = await browser!.newContext({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true, serviceWorkers: "block", reducedMotion: "reduce" });
    const at = cookie.indexOf("=");

    await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

    try {
      const page = await context.newPage();
      const errors: string[] = [];

      page.on("pageerror", (error) => errors.push(String(error)));
      await page.goto(`${origin}/live`, { waitUntil: "load" });
      await hydrated(page);
      await go(page, "/screen-a");
      await standing(page, "screen-a");
      await go(page, "/screen-b");
      await standing(page, "screen-b");
      await go(page, "/live");
      await page.locator("[data-screen]").waitFor({ state: "detached", timeout: 30_000 });
      await go(page, "/screen-a");
      await standing(page, "screen-a");

      expect(errors).toEqual([]);
      expect(await mounts(page)).toEqual([
        { screen: "screen-a", slot: true },
        { screen: "screen-b", slot: true },
        { screen: "screen-a", slot: true }
      ]);
    } finally {
      await context.close();
    }
  }, 180_000);
});
