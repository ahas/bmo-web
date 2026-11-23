import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wordingIn } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, fingerOn, touchReady } from "./touch";

import type { Browser, Page } from "playwright-core";

// A member whose login is an email address signs in (docs/accounts.md, 「Users and senders」; docs/web.md,
// 「Access」): the login screen's fields are filled as a hand fills them, its sign-in button pressed — tapped on a phone —
// and the screen leaves for the console signed in as that login. The button stands under nothing where it is
// pressed, and the screen stands inside its width. A desktop's width and a phone's. It drives the console
// tests/support/browser-console.ts stands up; the suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const MEMBER = { name: "email-member@example.com", password: "fixture-password-4501" };
const WIDTHS = [
  { width: 1280, height: 900, phone: false },
  { width: 360, height: 780, phone: true }
];

let browser: Browser | null = null;

// Whether the topmost element at a point is the element itself or inside it, so a press there reaches it.
async function reached(page: Page, selector: string): Promise<{ x: number; y: number }> {
  const box = (await page.locator(selector).first().boundingBox())!;
  const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const free = await page.evaluate(
    ({ selector, x, y }) => {
      const target = document.querySelector(selector);
      const top = document.elementFromPoint(x, y);

      return target !== null && top !== null && (target === top || target.contains(top));
    },
    { selector, ...at }
  );

  expect(free).toBe(true);

  return at;
}

beforeAll(async () => {
  if (!origin || !touchReady()) return;

  browser = await chromium.launch();
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();
}, BROWSER_HOOK_MS);

describe.skipIf(!origin || !touchReady())("an email login", () => {
  for (const size of WIDTHS) {
    test(`signs in from the login screen, ${size.width}px wide`, async () => {
      const context = await browser!.newContext({
        viewport: { width: size.width, height: size.height },
        isMobile: size.phone,
        hasTouch: size.phone,
        locale: "ko-KR",
        serviceWorkers: "block",
        reducedMotion: "reduce"
      });

      try {
        const page = await context.newPage();
        const finger = size.phone ? await fingerOn(page) : null;

        await page.goto(`${origin}/login`, { waitUntil: "load" });

        const name = page.locator('#login-form input[autocomplete="username"]');
        const password = page.locator('#login-form input[type="password"]');

        await name.waitFor({ timeout: 30_000 });
        await page.waitForFunction(
          () => {
            const root: (Element & { __vue_app__?: { $nuxt?: { isHydrating?: boolean } } }) | null = document.querySelector("#__nuxt");

            return root?.__vue_app__?.$nuxt?.isHydrating === false;
          },
          null,
          { timeout: 30_000 }
        );

        for (const [field, value] of [[name, MEMBER.name], [password, MEMBER.password]] as const) {
          const at = await reached(page, field === name ? '#login-form input[autocomplete="username"]' : '#login-form input[type="password"]');

          if (finger) await finger.tap(at);
          else await page.mouse.click(at.x, at.y);

          await page.keyboard.type(value);
        }

        expect(await name.inputValue()).toBe(MEMBER.name);

        const button = 'button[type="submit"][form="login-form"]';

        await page.locator(button).scrollIntoViewIfNeeded();

        const at = await reached(page, button);

        if (finger) await finger.tap(at);
        else await page.mouse.click(at.x, at.y);

        await page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 30_000 });

        // No failure line stands, and the session the screen left with is the email login's.
        expect(await page.getByText(wordingIn("ko")("app.error.wrong_credentials")).count()).toBe(0);

        const session = await page.evaluate(async (base) => (await fetch(`${base}/api/_auth/session`)).json(), origin!);

        expect(session?.user?.name).toBe(MEMBER.name);

        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

        expect(overflow).toBeLessThanOrEqual(0);
      } finally {
        await context.close();
      }
    }, 120_000);
  }
});
