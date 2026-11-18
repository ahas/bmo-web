import { afterAll, beforeAll, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";

import type { Browser } from "playwright-core";

// An input menu's open button is named by the console's word for it, on a unit's screen as on the console's own
// (docs/web.md, 「Wording and the language pack」): the screen a stand-in unit brings draws one from the console's copy
// of Nuxt UI, imported by the path a bundle imports it by, and its button is read off the accessibility tree. It drives
// the console tests/support/browser-console.ts stands up; the suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "input-menu-name", password: "fixture-password-3562" };

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

test.skipIf(!origin || !touchReady())("an input menu on a unit's screen names its open button in the console's words", async () => {
  const context = await browser!.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block", reducedMotion: "reduce" });
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

  try {
    const page = await context.newPage();

    await page.goto(`${origin}/screen-a?menu=on`, { waitUntil: "load" });

    const menu = page.locator('[data-screen-menu="screen-a"]');

    await menu.getByRole("combobox").waitFor({ timeout: 30_000 });

    expect(await menu.ariaSnapshot()).toContain(`button "${wording("common.aria.open_list")}"`);
  } finally {
    await context.close();
  }
}, 60_000);
