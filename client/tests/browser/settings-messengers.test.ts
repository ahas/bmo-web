import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, Page } from "playwright-core";

// The settings' messengers section as a hand works it (docs/web.md, 「Settings」, the messengers section): each chat
// service the receiver lists stands as a row, the reader chooses their own sign-in on one with its name and saves it,
// the row reads it back after a reload, and the account is taken away again. It drives the console
// tests/support/browser-console.ts stands up, whose receiver lists three chat services; the suite stands up no
// console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
// An account with a user of the account service, whose messenger accounts are its own.
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

// Whether nothing stands over the middle of what a finger presses.
async function reached(page: Page, selector: string): Promise<boolean> {
  return page.locator(selector).first().evaluate((element) => {
    const box = element.getBoundingClientRect();
    const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);

    return top !== null && (top === element || element.contains(top));
  });
}

describe.skipIf(!origin || !touchReady())("the settings' messengers section", () => {
  for (const [width, height, phone] of [[1280, 900, false], [360, 780, true]] as const) {
    test(`sets one's own sign-in on a chat service, reads it back and takes it away, ${width}px wide`, async () => {
      const context = await browser!.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, serviceWorkers: "block", reducedMotion: "reduce" });
      const at = cookie.indexOf("=");

      await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/siren?settings=messengers`, { waitUntil: "load" });

        const row = page.locator("[data-messenger='chat-a']");

        await row.waitFor({ timeout: 30_000 });
        expect(await page.locator("[data-messenger]").count()).toBe(3);

        await row.locator("[data-messenger-mode]").scrollIntoViewIfNeeded();
        expect(await reached(page, "[data-messenger='chat-a'] [data-messenger-mode]")).toBe(true);
        await row.locator("[data-messenger-mode]").click();
        await page.getByRole("option").nth(1).click();
        await row.locator("[data-messenger-handle]").fill(`tester-${width}`);
        expect(await reached(page, "[data-messenger='chat-a'] [data-messenger-save]")).toBe(true);
        await row.locator("[data-messenger-save]").click();
        await row.locator("[data-messenger-clear]").waitFor({ timeout: 15_000 });

        // Read back on a fresh open, as it stands on the account service; the dialog takes its address's section
        // once, so the page is opened at it again rather than reloaded.
        await page.goto(`${origin}/siren?settings=messengers`, { waitUntil: "load" });
        await row.locator("[data-messenger-handle]").waitFor({ timeout: 30_000 });
        expect(await row.locator("[data-messenger-handle]").inputValue()).toBe(`tester-${width}`);

        await row.locator("[data-messenger-clear]").click();
        await row.locator("[data-messenger-clear]").waitFor({ state: "detached", timeout: 15_000 });
        expect(await row.locator("[data-messenger-handle]").count()).toBe(0);
      } finally {
        await context.close();
      }
    }, 120_000);
  }
});
