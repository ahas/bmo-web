import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, Page } from "playwright-core";

// The console's title bar stands, named for a screen a unit brings, before that screen does, on every road to it
// (docs/web.md, 「The title bar」): the first load, from a screen of the console's own, and from another bundle's
// screen. The bar names the screen alone and holds no place for it, so the screen's action stands in its own row under
// the bar. The two screens the harness's stand-in units bring (tests/support/browser-console.ts) note whether they
// found the console's offer and the bar named for them as they mounted. It drives the console
// tests/support/browser-console.ts stands up; the suite stands up no console, so there it skips.

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

type Mount = { screen: string; offered: boolean; bar: boolean };

async function mounts(page: Page): Promise<Mount[]> {
  return (await page.evaluate("globalThis.__screenMounts ?? []")) as Mount[];
}

// How a screen stood its mount.
const MOUNTED = (screen: string): Mount => ({ screen, offered: true, bar: true });

// The screen standing with its action in its own row, and what the title bar holds besides its name and the set at
// its right end: nothing.
async function standing(page: Page, screen: string): Promise<void> {
  await page.locator(`[data-screen="${screen}"] [data-screen-row] [data-screen-action="${screen}"]`).waitFor({ timeout: 30_000 });

  const laid = await page.evaluate(() =>
    [...document.querySelectorAll("[data-title-bar]")].flatMap((bar) => {
      const after: string[] = [];

      for (let next = bar.querySelector(":scope > [data-slot=left] > [data-slot=title]")?.nextElementSibling; next; next = next.nextElementSibling) after.push(next.outerHTML.slice(0, 80));

      const right = [...bar.querySelectorAll(":scope > [data-slot=right] :is(button, a)")].filter((part) => part.closest("[data-title-bar-actions]") === null);

      return [...after, ...right.map((part) => part.outerHTML.slice(0, 80))];
    })
  );

  expect(laid).toEqual([]);
}

describe.skipIf(!origin || !touchReady())("a screen a unit brings, under the console's title bar", () => {
  test("finds the bar named for it as it mounts on the first load, its action in its own row, at 360", async () => {
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
      expect(await mounts(page)).toEqual([MOUNTED("screen-a")]);
    } finally {
      await context.close();
    }
  }, 180_000);

  test("finds the bar as it mounts on every move inside the app — from a screen of the console's own, from another bundle's, and back — at 360", async () => {
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
      expect(await mounts(page)).toEqual([MOUNTED("screen-a"), MOUNTED("screen-b"), MOUNTED("screen-a")]);
    } finally {
      await context.close();
    }
  }, 180_000);
});
