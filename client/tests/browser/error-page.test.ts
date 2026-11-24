import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { goInApp } from "./top-layer";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, BrowserContext, Page } from "playwright-core";

// An address no page answers draws bmo-ui's error page, never the framework's own (docs/web.md, 「A page that cannot be
// shown」): its case, its status small, one line and its actions, at a phone's width and a wide screen's, nothing laid
// over another and nothing past the screen's edge; its way to the start opens the console's start, and the way back
// returns to the page the reader came from. It drives the console tests/support/browser-console.ts stands up; the
// suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "error-page", password: "fixture-password-4404" };
const MISSING = "/no-page-answers-this-address";

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

async function signedIn(width: number): Promise<BrowserContext> {
  const phone = width < 640;
  const context = await browser!.newContext({ viewport: { width, height: phone ? 780 : 800 }, isMobile: phone, hasTouch: phone, serviceWorkers: "block", reducedMotion: "reduce" });
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

  return context;
}

type Box = { part: string; left: number; top: number; right: number; bottom: number };

// Every part the page draws, as the browser lays it out, and whether the screen scrolls sideways.
async function laidOut(page: Page): Promise<{ boxes: Box[]; sideways: boolean; width: number }> {
  return await page.evaluate(() => {
    const screen = document.querySelector("[data-error-screen]")!;
    const parts: [string, Element | null][] = [
      ["icon", screen.querySelector(".iconify, [class*='i-material-symbols']")],
      ["status", screen.querySelector("[data-error-status]")],
      ["title", screen.querySelector("h1")],
      ["line", screen.querySelector("h1 + p")],
      ...[...screen.querySelectorAll("[data-error-action]")].map((one): [string, Element] => [`action:${one.getAttribute("data-error-action")}`, one])
    ];
    const boxes = parts
      .filter((one): one is [string, Element] => one[1] !== null)
      .map(([part, element]) => {
        const box = element.getBoundingClientRect();

        return { part, left: box.left, top: box.top, right: box.right, bottom: box.bottom };
      });

    return { boxes, sideways: document.scrollingElement!.scrollWidth > window.innerWidth, width: window.innerWidth };
  });
}

function overlaps(a: Box, b: Box): boolean {
  return a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
}

describe.skipIf(!origin || !touchReady())("an address no page answers", () => {
  for (const width of [360, 1280]) {
    test(`draws the console's own error page, its parts apart and inside the screen, and its start opens the console, at ${width}`, async () => {
      const context = await signedIn(width);

      try {
        const page = await context.newPage();
        const errors: string[] = [];

        page.on("pageerror", (error) => errors.push(String(error)));

        const answer = await page.goto(`${origin}${MISSING}`, { waitUntil: "load" });

        expect(answer?.status()).toBe(404);
        await page.locator('[data-error-screen][data-error-kind="not_found"]').waitFor({ timeout: 30_000 });

        expect(await page.locator("h1").innerText()).toBe(wording("common.title.page_not_found"));
        expect(await page.locator("h1 + p").innerText()).toBe(wording("common.message.page_not_found"));
        expect(await page.locator("[data-error-status]").innerText()).toBe("404");
        expect(await page.title()).toContain(wording("common.title.page_not_found"));
        // Neither the framework's message nor the address it names reaches the reader: they stand only in the fold the
        // development server draws.
        const read = await page.evaluate(() => {
          const shown = document.querySelector("[data-error-screen]")!.cloneNode(true) as Element;

          shown.querySelector("[data-error-details]")?.remove();

          return shown.textContent ?? "";
        });

        expect(read).not.toContain(MISSING);
        // Opened straight, the page has nothing of the console's to go back to.
        expect(await page.locator('[data-error-action="back"]').count()).toBe(0);

        const { boxes, sideways, width: shown } = await laidOut(page);

        expect(sideways).toBe(false);
        expect(boxes.map((one) => one.part)).toEqual(["icon", "status", "title", "line", "action:home"]);

        for (const one of boxes) {
          expect(one.left).toBeGreaterThanOrEqual(16 - 0.5);
          expect(one.right).toBeLessThanOrEqual(shown - 16 + 0.5);
        }

        for (const [at, one] of boxes.entries()) {
          for (const other of boxes.slice(at + 1)) expect(overlaps(one, other), `${one.part} over ${other.part}`).toBe(false);
        }

        // What a press on the start lands on is the button itself, and, once the app has taken the page over, it opens
        // the console's start.
        await page.waitForFunction(() => Reflect.get(document.querySelector("#__nuxt") ?? {}, "__vue_app__") !== undefined, null, { timeout: 30_000 });
        const home = page.locator('[data-error-action="home"]');
        const middle = await home.evaluate((element) => {
          const box = element.getBoundingClientRect();
          const found = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);

          return found !== null && element.contains(found);
        });

        expect(middle).toBe(true);
        await (width < 640 ? home.tap() : home.click());
        await page.locator("[data-error-screen]").waitFor({ state: "detached", timeout: 30_000 });
        await page.waitForURL((url) => url.pathname === new URL(`${origin}/`).pathname, { timeout: 30_000 });
        expect(errors).toEqual([]);
      } finally {
        await context.close();
      }
    }, 180_000);
  }

  test("reached from a page of the console, goes back to it", async () => {
    const context = await signedIn(1280);

    try {
      const page = await context.newPage();

      await page.goto(`${origin}/siren`, { waitUntil: "load" });
      await page.waitForFunction(() => Reflect.get(document.querySelector("#__nuxt") ?? {}, "__vue_app__") !== undefined, null, { timeout: 30_000 });
      await goInApp(page, MISSING);
      await page.locator('[data-error-screen][data-error-kind="not_found"]').waitFor({ timeout: 30_000 });

      const back = page.locator('[data-error-action="back"]');

      expect(await back.innerText()).toBe(wording("common.action.go_back"));

      const { boxes } = await laidOut(page);
      const parts = boxes.map((one) => one.part);

      // The way back first, the way to the start last.
      expect(parts.indexOf("action:back")).toBeLessThan(parts.indexOf("action:home"));

      await back.click();
      await page.locator("[data-error-screen]").waitFor({ state: "detached", timeout: 30_000 });
      await page.waitForURL((url) => url.pathname.endsWith("/siren"), { timeout: 30_000 });
    } finally {
      await context.close();
    }
  }, 180_000);
});
