import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser } from "playwright-core";

// A bubble holding a lone picture stands beside its run's photo as a bubble of words does (docs/web.md, 「Every
// message is a bubble」 and 「One photo to a run」): its photo-side edge one photo-to-bubble step from the photo, on
// the owner's side and the other's alike, and the bubble as wide as the picture it holds, with nothing bare beside
// it. A square picture larger than a bubble may be, under a caption, from person-b and from the owner, on a phone held
// upright and on a desktop. It drives the console tests/support/browser-console.ts stands up; the suite stands up no
// console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "pictures", password: "fixture-password-2262" };
const MEDIA_CHAT = 44;
// The lone square pictures of the media room: person-b's, then the owner's.
const THEIRS = "m16";
const MINE = "m17";

let browser: Browser | null = null;
let cookie = "";

beforeAll(async () => {
  if (!origin || !touchReady()) return;

  const login = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ACCOUNT) });

  expect(login.ok).toBe(true);
  cookie = login.headers.get("set-cookie")!.split(";")[0]!;
  browser = await chromium.launch({ args: ["--use-angle=swiftshader"] });
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();
}, BROWSER_HOOK_MS);

describe.skipIf(!origin || !touchReady())("a picture's bubble", () => {
  for (const look of [
    { name: "a phone", viewport: { width: 360, height: 780 }, phone: true },
    { name: "a desktop", viewport: { width: 1280, height: 1000 }, phone: false }
  ] as const) {
    test(`stands beside its photo as a bubble of words does, on ${look.name}`, async () => {
      const context = await browser!.newContext({ viewport: look.viewport, isMobile: look.phone, hasTouch: look.phone, serviceWorkers: "block" });
      const at = cookie.indexOf("=");

      await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/rooms/${MEDIA_CHAT}`, { waitUntil: "load" });
        for (const id of [THEIRS, MINE]) {
          await page.locator(`[data-message="${id}"] img`).waitFor({ timeout: 30_000 });
          await page.locator(`[data-message="${id}"] img`).evaluate((image: HTMLImageElement) => image.decode());
        }

        const read = await page.evaluate(([theirs, mine]) => {
          const placed = (id: string) => {
            const row = document.querySelector(`[data-message="${id}"]`)!;
            const run = row.closest("[data-run]")!;
            // The run's photo column, drawn over the run's own side.
            const face = [...run.children].find((child) => getComputedStyle(child).position === "absolute")!.getBoundingClientRect();
            const bubble = row.querySelector("[data-bubble]")!.getBoundingClientRect();
            const picture = row.querySelector("[data-bubble] button")!.getBoundingClientRect();
            const mine = row.hasAttribute("data-mine");

            return {
              step: Math.round(mine ? face.left - bubble.right : bubble.left - face.right),
              bare: Math.round(bubble.width - picture.width),
              width: Math.round(bubble.width)
            };
          };

          return { theirs: placed(theirs), mine: placed(mine) };
        }, [THEIRS, MINE] as const);

        // The photo-to-bubble step is the conversation's 8px measure on either side.
        expect(read.theirs.step).toBe(8);
        expect(read.mine.step).toBe(8);

        for (const one of [read.theirs, read.mine]) {
          expect(one.bare).toBe(0);
          expect(one.width).toBeLessThanOrEqual(320);
        }
      } finally {
        await context.close();
      }
    }, 120_000);
  }
});
