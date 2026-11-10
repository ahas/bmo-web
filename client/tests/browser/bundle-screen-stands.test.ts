import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, Page } from "playwright-core";

// A screen a unit brings standing at the address its manifest names (docs/web.md, 「Screens a unit brings」): the
// stand-in unit's manifest, words and bundle answer, the reader is signed in, and the address is opened twice over
// — by the browser drawing the page the server answered with its shell, and by a move inside the app. The bundle's
// module reads `process.env` where it stands, as a library inside a unit's build does, so a console owing no
// `process` to it never stands the route at all and the address ends on the console's own absence. Every page is
// started with any `process` its development tooling leaves refused, which is the state a built console's page is
// born in: what the module then reads can only be the one the console stands. It drives the console
// tests/support/browser-console.ts stands up; the suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "screen-stands", password: "fixture-password-2411" };

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

// A page where a `process` naming itself development never stands: the first is swallowed, so only a `process` the
// console itself stands for the bundle it runs is ever read.
async function openPage(): Promise<Page> {
  const context = await browser!.newContext({ viewport: { width: 1280, height: 800 } });
  const at = cookie.indexOf("=");

  await context.addInitScript(() => {
    let stood: { env?: { NODE_ENV?: string } } | undefined;

    Object.defineProperty(globalThis, "process", {
      configurable: true,
      get: () => stood,
      set: (value: { env?: { NODE_ENV?: string } }) => {
        if (value?.env?.NODE_ENV !== "development") stood = value;
      }
    });
  });
  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

  return context.newPage();
}

// What stands at an address: the screen the unit brings, what its module read of its build, and whether the
// console's own absence stands with it.
async function standing(page: Page, screen: string): Promise<{ build: string | null; absent: boolean; errors: string[] }> {
  const errors: string[] = [];

  page.on("pageerror", (error) => errors.push(String(error)));
  await page.locator(`[data-screen="${screen}"]`).waitFor({ timeout: 30_000 });

  const build = await page.locator(`[data-screen="${screen}"]`).getAttribute("data-build");
  const absent = await page.evaluate(() => document.body.innerText.includes("Page not found"));

  return { build, absent, errors };
}

describe.skipIf(!origin || !touchReady())("a screen a unit brings standing at its address", () => {
  test("stands where its manifest says, the first time the address is drawn", async () => {
    const page = await openPage();

    try {
      await page.goto(`${origin}/screen-a`, { waitUntil: "load" });

      expect(await standing(page, "screen-a")).toEqual({ build: "production", absent: false, errors: [] });
    } finally {
      await page.context().close();
    }
  }, 180_000);

  test("stands as the app is moved to it from a screen of the console's own", async () => {
    const page = await openPage();

    try {
      await page.goto(`${origin}/live`, { waitUntil: "load" });
      await page.waitForTimeout(1_000);
      await page.evaluate(`document.querySelector("#__nuxt").__vue_app__.config.globalProperties.$router.push("/screen-b")`);

      expect(await standing(page, "screen-b")).toEqual({ build: "production", absent: false, errors: [] });
      expect(new URL(page.url()).pathname.endsWith("/screen-b")).toBe(true);
    } finally {
      await page.context().close();
    }
  }, 180_000);
});
