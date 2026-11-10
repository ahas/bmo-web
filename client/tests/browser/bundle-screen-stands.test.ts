import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, Page } from "playwright-core";

// A screen a unit brings standing at the address its manifest names (docs/web.md, 「Screens a unit brings」): the
// stand-in unit's manifest, words and bundle answer, the reader is signed in, and the address is opened twice over
// — by the browser drawing the page the server answered with its shell, and by a move inside the app. The bundle's
// module reads `process.env` where it stands, as a library inside a unit's build does, so a console owing no
// `process` to it never stands the route at all and the address ends on the console's own absence: the second road
// therefore takes that global off the page first, which is the state a built console's page is born in and a
// development one is not. It drives the console tests/support/browser-console.ts stands up; the suite stands up no
// console, so there it skips.

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

async function openPage(): Promise<Page> {
  const context = await browser!.newContext({ viewport: { width: 1280, height: 800 } });
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

  return context.newPage();
}

/** What stands at an address once it has been opened: the screen the unit brings, the build its module read, whether
 * the console's own absence stands with it, and what the page faulted over on the way. */
async function standing(page: Page, screen: string): Promise<{ build: string | null; absent: boolean; errors: string[] }> {
  const errors: string[] = [];

  page.on("pageerror", (error) => errors.push(String(error)));
  await page.locator(`[data-screen="${screen}"]`).waitFor({ timeout: 30_000 });

  const build = await page.locator(`[data-screen="${screen}"]`).getAttribute("data-build");
  const absent = await page.evaluate(() => document.body.innerText.includes("Page not found"));

  return { build, absent, errors };
}

// A move inside the app, the way the sidebar makes one.
async function go(page: Page, path: string): Promise<void> {
  await page.evaluate(`document.querySelector("#__nuxt").__vue_app__.config.globalProperties.$router.push(${JSON.stringify(path)})`);
}

describe.skipIf(!origin || !touchReady())("a screen a unit brings standing at its address", () => {
  test("stands the first time the address is drawn, on the shell the server answered", async () => {
    const page = await openPage();

    try {
      await page.goto(`${origin}/screen-a`, { waitUntil: "load" });
      expect(await standing(page, "screen-a")).toMatchObject({ absent: false, errors: [] });
      expect(page.url()).toBe(`${origin}/screen-a`);
    } finally {
      await page.context().close();
    }
  }, 180_000);

  test("stands its route on a page carrying no process of its own, reading the build the console stands", async () => {
    const page = await openPage();

    try {
      await page.goto(`${origin}/live`, { waitUntil: "load" });
      await page.waitForTimeout(1_000);
      // A built console's page never carries one; a development console's tooling stood this before the app booted.
      await page.evaluate("delete globalThis.process");
      await go(page, "/screen-a");

      expect(await standing(page, "screen-a")).toEqual({ build: "production", absent: false, errors: [] });
      expect(new URL(page.url()).pathname.endsWith("/screen-a")).toBe(true);
    } finally {
      await page.context().close();
    }
  }, 180_000);
});
