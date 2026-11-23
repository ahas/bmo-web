import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { roomInfo } from "./room-info";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, BrowserContext, Page } from "playwright-core";

// The room's situation note, opened from the room menu, opens as written with the show-translation line above it: nothing is asked until
// it is pressed, the reading then takes the note's place and the show-original press puts it back (docs/web.md, the room screen's
// situation entry and 「The original, and its translation in its place」). Where the translator answers too busy the
// line says so.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up, and serves
// the room's note and the translator through the page's own routes.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "brain-translation", password: "fixture-password-2355" };
const CHAT = -9_000_000_000_099;
const NOW = 1_800_000_000_000;
const NOTE = "The round checked the logs at dawn.";
const READING = "The round checked the logs at dawn, as the room's note says.";

const situationTab = wording("room_info.label.situation");

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

  // These tests drive the press, so the browser's auto translation is off (docs/web.md, 「The original, and its translation
  // in its place」).
  await context.addCookies([
    { name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! },
    { name: "console_auto_translate", value: "false", url: origin! }
  ]);
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

  const opener = page.locator("[data-room-name]");
  const sheet = roomInfo(page);

  await opener.waitFor({ timeout: 30_000 });
  // The server's page draws the room's name before the app's handlers land on it, and a press made before then is
  // lost, so the press waits for the app to stand.
  await page.waitForFunction(() => {
    const root: (Element & { __vue_app__?: { $nuxt?: { isHydrating?: boolean } } }) | null = document.querySelector("#__nuxt");

    return root?.__vue_app__?.$nuxt?.isHydrating === false;
  }, undefined, { timeout: 60_000 });
  await opener.click();
  await sheet.waitFor({ state: "visible", timeout: 10_000 });
  await sheet.getByRole("tab", { name: situationTab, exact: true }).click();
  await page.locator("[data-situation-note]").waitFor({ timeout: 20_000 });
}

describe.skipIf(!origin || !touchReady())("a room's situation note", () => {
  for (const [width, height] of [[1280, 900], [360, 780]] as const) {
    test(`is translated by the action, and the reading stands under the note, at ${width}`, async () => {
      const context = await open(width, height, "reads");
      const page = await context.newPage();

      try {
        await openSituation(page);

        // It opens on the note as written, the line above it asking nothing until it is pressed.
        expect((await page.locator("[data-situation-note]").innerText()).trim()).toBe(NOTE);

        // Pressed, the reading takes the note's place, and the show-original press puts it back.
        await page.locator("[data-reading-translate]").click();
        await page.locator("[data-reading-original]").waitFor({ timeout: 20_000 });
        expect((await page.locator("[data-situation-note]").innerText()).trim()).toBe(READING);
        await page.locator("[data-reading-original]").click();
        expect((await page.locator("[data-situation-note]").innerText()).trim()).toBe(NOTE);
      } finally {
        await context.close();
      }
    }, 120_000);
  }

  test("says on the line that the translator is too busy, the note standing", async () => {
    const context = await open(1280, 900, "busy");
    const page = await context.newPage();

    try {
      await openSituation(page);
      await page.locator("[data-reading-translate]").click();
      // The line says the translator is too busy, with a retry, and the note stands as written.
      await page.locator("[data-reading] [role=alert]").waitFor({ timeout: 30_000 });
      expect(await page.locator("[data-reading] [role=alert]").innerText()).toContain(wording("common.status.translation_busy"));
      expect((await page.locator("[data-situation-note]").innerText()).trim()).toBe(NOTE);
    } finally {
      await context.close();
    }
  }, 120_000);
});
