import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { ownName } from "../../apps/web/shared/languages";
import { wordingIn } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, BrowserContext, Page } from "playwright-core";
import type { ConsoleLanguage } from "../../apps/web/shared/languages";

// The console read in four languages (docs/web.md, 「Wording and the language pack」 and 「Settings」, the account section): an account
// that chose none reads it in its browser's language, and one chosen in the settings' list, each language named in its
// own script, takes the whole page at once — its words, the document's `lang` — is kept against the account, so a
// reload and another browser asking for another language read it still, and the dialog stands inside the screen in
// each. A desktop's width and a phone's. It drives the console tests/support/browser-console.ts stands up; the suite
// stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const CHOOSER = { name: "four-languages", password: "fixture-password-4401" };
const UNCHOSEN = { name: "browser-language", password: "fixture-password-4402" };
const WIDTHS = [
  { width: 1280, height: 900, phone: false },
  { width: 360, height: 780, phone: true }
];
const TAGS: Record<ConsoleLanguage, string> = { ko: "ko-KR", en: "en-US", ja: "ja-JP", "zh-CN": "zh-CN" };

let browser: Browser | null = null;
const cookies = new Map<string, string>();

async function signIn(account: { name: string; password: string }): Promise<string> {
  const login = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(account) });

  expect(login.ok).toBe(true);

  return login.headers.get("set-cookie")!.split(";")[0]!;
}

async function contextFor(account: string, browserLocale: string, { width, height, phone }: (typeof WIDTHS)[number]): Promise<BrowserContext> {
  const context = await browser!.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, locale: browserLocale, serviceWorkers: "block", reducedMotion: "reduce" });
  const cookie = cookies.get(account)!;
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

  return context;
}

// The account section of the settings, where the language is chosen.
async function openLanguageRow(page: Page, language: ConsoleLanguage): Promise<void> {
  await page.goto(`${origin}/siren?settings=account`, { waitUntil: "load" });
  await page.locator("[data-language-choice]").waitFor({ timeout: 30_000 });
  await page.getByText(wordingIn(language)("app.label.language"), { exact: true }).first().waitFor({ timeout: 10_000 });
}

async function standsInside(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

  expect(overflow).toBeLessThanOrEqual(0);
}

beforeAll(async () => {
  if (!origin || !touchReady()) return;

  cookies.set(CHOOSER.name, await signIn(CHOOSER));
  cookies.set(UNCHOSEN.name, await signIn(UNCHOSEN));
  browser = await chromium.launch();
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();
}, BROWSER_HOOK_MS);

describe.skipIf(!origin || !touchReady())("the console's language", () => {
  for (const size of WIDTHS) {
    test(`is the browser's where the account chose none, ${size.width}px wide`, async () => {
      for (const [browserLocale, language] of [["ja-JP", "ja"], ["zh-TW", "zh-CN"], ["fr-FR", "en"]] as const) {
        const context = await contextFor(UNCHOSEN.name, browserLocale, size);

        try {
          const page = await context.newPage();

          await openLanguageRow(page, language);
          expect(await page.locator("html").getAttribute("lang")).toBe(TAGS[language]);
          await expect(page.locator("[data-language-choice]").textContent()).resolves.toContain(ownName(language));
          await standsInside(page);
        } finally {
          await context.close();
        }
      }
    }, 120_000);

    test(`is chosen in the settings, takes the page at once and is kept against the account, ${size.width}px wide`, async () => {
      const put = await fetch(`${origin}/api/account/language`, {
        method: "PUT",
        headers: { cookie: cookies.get(CHOOSER.name)!, "content-type": "application/json" },
        body: JSON.stringify({ language: "ja" })
      });

      expect(put.ok).toBe(true);

      const context = await contextFor(CHOOSER.name, "ko-KR", size);

      try {
        const page = await context.newPage();

        await openLanguageRow(page, "ja");
        expect(await page.locator("html").getAttribute("lang")).toBe("ja-JP");

        await page.locator("[data-language-choice]").click();

        const names = await page.getByRole("option").allTextContents();

        expect(names.map((name) => name.trim())).toEqual(["ko", "en", "ja", "zh-CN"].map((one) => ownName(one as ConsoleLanguage)));

        await page.getByRole("option", { name: ownName("en") }).click();
        await page.getByText(wordingIn("en")("app.label.language"), { exact: true }).first().waitFor({ timeout: 10_000 });
        await page.waitForFunction(() => document.documentElement.lang === "en-US", null, { timeout: 10_000 });
        await standsInside(page);

        // The dialog takes its key off the address as it opens, so the page is read again at the address that opens it.
        await openLanguageRow(page, "en");
        expect(await page.locator("html").getAttribute("lang")).toBe("en-US");
      } finally {
        await context.close();
      }

      // Another browser, asking for Korean and carrying no cookie of the choice, reads the account's.
      const other = await contextFor(CHOOSER.name, "ko-KR", size);

      try {
        const page = await other.newPage();

        await openLanguageRow(page, "en");
        expect(await page.locator("html").getAttribute("lang")).toBe("en-US");

        const answer = await page.evaluate(async (base) => (await fetch(`${base}/api/account/language`)).json(), origin!);

        expect(answer).toEqual({ language: "en" });
      } finally {
        await other.close();
      }
    }, 120_000);
  }
});
