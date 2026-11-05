import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, BrowserContext, Page } from "playwright-core";

// The room's situation note, opened from the room menu, carries the memory text's translate action: nothing is asked
// until it is pressed, the reading stands under the note headed by the reader's language, and the note itself stays
// whole (docs/web.md, the room screen's situation entry and the translated texts section). Where the translator answers
// too busy the action stands disabled, saying why.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up, and serves
// the room's note and the translator through the page's own routes.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "brain-translation", password: "fixture-password-2355" };
const CHAT = -9_000_000_000_099;
const NOW = 1_800_000_000_000;
const NOTE = "The round checked the logs at dawn.";
const READING = "The round checked the logs at dawn, as the room's note says.";

const situationAction = wording("room.action.situation");
const moreAction = wording("common.action.more");

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

// A room with one note, and the translator's answer as this case needs it.
async function open(width: number, height: number, translator: "reads" | "busy"): Promise<BrowserContext> {
  const context = await browser!.newContext({ viewport: { width, height }, serviceWorkers: "block", reducedMotion: "reduce" });
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
  await context.route(new RegExp(`/api/rooms/${CHAT}/messages(\\?|$)`), (route) => route.fulfill({ json: { messages: [], judgements: [], hasMore: false } }));
  await context.route(new RegExp(`/api/rooms/${CHAT}/situation(\\?|$)`), (route) => route.fulfill({ json: { text: NOTE, updatedAt: NOW - 60_000 } }));
  await context.route(/\/api\/translations$/, (route) =>
    translator === "reads"
      ? route.fulfill({ json: { readings: [{ text: READING, whole: true }] } })
      : route.fulfill({ status: 503, json: { statusCode: 503, statusMessage: "busy" } })
  );

  return context;
}

async function openSituation(page: Page): Promise<void> {
  await page.goto(`${origin}/rooms/${CHAT}`, { waitUntil: "domcontentloaded" });

  const opener = page.locator(`button[aria-label="${moreAction}"]`).first();
  const item = page.getByRole("menuitem", { name: situationAction });

  await opener.waitFor({ timeout: 30_000 });
  // A press made before the page's handlers land is lost, so the menu is opened once more where it did not come up.
  await opener.click();

  try {
    await item.waitFor({ state: "visible", timeout: 5_000 });
  } catch {
    await opener.click();
    await item.waitFor({ state: "visible", timeout: 10_000 });
  }

  await item.click();
  await page.locator("[data-situation-note]").waitFor({ timeout: 20_000 });
}

describe.skipIf(!origin || !touchReady())("a room's situation note", () => {
  for (const [width, height] of [[1280, 900], [360, 780]] as const) {
    test(`is translated by the action, and the reading stands under the note, at ${width}`, async () => {
      const context = await open(width, height, "reads");
      const page = await context.newPage();

      try {
        await openSituation(page);

        // Nothing was asked before the press.
        expect(await page.locator("[data-situation-read-translation]").count()).toBe(0);

        await page.locator("[data-situation-translate]").click();
        await page.locator("[data-situation-read-translation]").waitFor({ timeout: 20_000 });

        // The note stands whole above its reading.
        expect((await page.locator("[data-situation-note]").innerText()).trim()).toBe(NOTE);
        expect((await page.locator("[data-situation-read-translation]").innerText()).trim()).toBe(READING);
      } finally {
        await context.close();
      }
    }, 120_000);
  }

  test("stands disabled, saying why, where the translator answers too busy", async () => {
    const context = await open(1280, 900, "busy");
    const page = await context.newPage();

    try {
      await openSituation(page);
      await page.locator("[data-situation-translate]").click();
      await page.waitForFunction(() => document.querySelector("[data-situation-translate]")?.hasAttribute("disabled") === true, undefined, { timeout: 30_000 });
      // The reason it cannot ask stands on the wrapper the tooltip hangs from.
      expect(await page.locator("[data-situation-translate-holder]").count()).toBe(1);
    } finally {
      await context.close();
    }
  }, 120_000);
});
