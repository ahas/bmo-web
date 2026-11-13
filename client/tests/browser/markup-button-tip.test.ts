import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, centreOf, openTouch, touchReady } from "./touch";

import type { Browser, Page } from "playwright-core";

// A button the renderer writes as markup named in the shared tooltip (docs/web.md, 「Tooltips」): the console's
// app root stands the shared library's markup button layer on every page, the sign-in page among them, so a
// button carrying its name in `data-tooltip` is named under the pointer, under a keyboard focus and under a held
// finger. The button is laid on the page the way the renderer writes a code block's copy button; what the
// renderer writes is tests/browser/markdown.test.ts's. It drives the console tests/support/browser-console.ts
// stands up; the suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const NAME = "Fixture name";
const BUTTON = "button[data-tooltip]";

let browser: Browser | null = null;

beforeAll(async () => {
  if (!origin || !touchReady()) return;

  browser = await chromium.launch();
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();
}, BROWSER_HOOK_MS);

// The sign-in page, opened in the page given, with the app standing in it and one markup button laid on it.
async function signIn(page: Page): Promise<void> {
  await page.goto(`${origin}/login`, { waitUntil: "load" });
  await page.waitForFunction(() => Reflect.get(document.querySelector("#__nuxt") ?? {}, "__vue_app__") !== undefined, null, { timeout: 30_000 });
  await page.evaluate((name) => {
    const button = document.createElement("button");

    button.type = "button";
    button.setAttribute("aria-label", name);
    button.dataset.tooltip = name;
    button.textContent = "+";
    button.style.cssText = "position: fixed; left: 120px; top: 320px; width: 40px; height: 40px";
    document.body.append(button);
  }, NAME);
}

// The same page at a desk's width, under a pointer and a keyboard.
async function deskPage(): Promise<Page> {
  const context = await browser!.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block", reducedMotion: "reduce" });
  const page = await context.newPage();

  await signIn(page);

  return page;
}

// The shared tooltip standing with the button's name in it.
function tooltip(page: Page): ReturnType<Page["locator"]> {
  return page.locator("[data-reka-popper-content-wrapper]").filter({ hasText: NAME }).first();
}

describe.skipIf(!origin || !touchReady())("a button written as markup", () => {
  test("is named in the shared tooltip under the pointer", async () => {
    const page = await deskPage();

    await page.hover(BUTTON);
    await expect(tooltip(page).waitFor({ timeout: 10_000 })).resolves.toBeUndefined();
    await page.context().close();
  }, BROWSER_HOOK_MS);

  test("is named in the shared tooltip under a keyboard focus", async () => {
    const page = await deskPage();

    // The focus the keyboard brings, since one it did not bring names nothing: back off the button and onto it again.
    await page.focus(BUTTON);
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    await expect(tooltip(page).waitFor({ timeout: 10_000 })).resolves.toBeUndefined();
    await page.context().close();
  }, BROWSER_HOOK_MS);

  test("is named in the shared tooltip under a held finger", async () => {
    const touch = await openTouch({ reducedMotion: "reduce" });

    try {
      await signIn(touch.page);
      await touch.press(await centreOf(touch.page, BUTTON));
      await expect(tooltip(touch.page).waitFor({ timeout: 10_000 })).resolves.toBeUndefined();
    } finally {
      await touch.close();
    }
  }, BROWSER_HOOK_MS);
});
