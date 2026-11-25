import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser } from "playwright-core";

// The settings' account and theme sections as they are arranged (docs/web.md, 「Settings」, the account and theme sections): one's own
// picture heads the account section, the language stands in the account's group beside the login and the profile, a
// profile saved is said under that group, and the theme section holds no language. What each control does is its own file's: languages and picture-setting. It
// drives the console tests/support/browser-console.ts stands up; the suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
// An account with a sender linked to it, so its own picture is shown.
const ACCOUNT = { name: "pictures", password: "fixture-password-2262" };

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

describe.skipIf(!origin || !touchReady())("the settings' arrangement", () => {
  for (const [width, height, phone] of [[1280, 900, false], [360, 780, true]] as const) {
    test(`heads the account with its picture, holds the language in the account's group and none in the theme, ${width}px wide`, async () => {
      const context = await browser!.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, serviceWorkers: "block", reducedMotion: "reduce" });
      const at = cookie.indexOf("=");

      await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/siren?settings=account`, { waitUntil: "load" });

        const picture = page.locator("[data-own-picture]");

        await picture.waitFor({ timeout: 30_000 });
        expect(await picture.evaluate((group) => group.parentElement?.firstElementChild === group)).toBe(true);
        expect(await picture.locator("[data-picture-setting='person']").count()).toBe(1);

        const group = page.locator("[data-account-group]");

        expect(await group.evaluate((one) => one.previousElementSibling?.hasAttribute("data-own-picture") ?? false)).toBe(true);
        expect(await group.locator("[data-language-row] [data-language-choice]").count()).toBe(1);
        expect(await group.locator("[data-profile-row]").count()).toBe(1);

        // A profile saved is said directly under the group its form was opened from.
        await group.locator("[data-profile-row] button:not([disabled])").click();
        await page.locator("input[autocomplete='organization-title']").fill(`tester ${width}`);
        await page.locator("button[type=submit][form='profile-form']").click();

        const saved = page.locator("[data-account-saved]");

        await saved.waitFor({ timeout: 15_000 });
        expect(await saved.evaluate((one) => one.previousElementSibling?.hasAttribute("data-account-group") ?? false)).toBe(true);

        await page.goto(`${origin}/siren?settings=theme`, { waitUntil: "load" });
        await page.locator("[data-auto-translate]").waitFor({ timeout: 30_000 });
        expect(await page.locator("[data-language-choice]").count()).toBe(0);
      } finally {
        await context.close();
      }
    }, 120_000);
  }
});
