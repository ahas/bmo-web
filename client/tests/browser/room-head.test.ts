import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, BrowserContext, Page } from "playwright-core";

// The room's head: the menu button's own box stands 8px from the end of the room's name, the gap every heading row
// keeps between its title and its button (docs/web.md, the room screen's measures, 「Picture, name and menu」), and the
// note a call waiting in the room was set with stands in its original with its translation in its place (docs/web.md,
// the room screen's list of what waits and 「The original, and its translation in its place」). Each is read at a
// desk's width and a phone's, in the light theme and the dark.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up, and serves
// the room's waiting calls and the translator through the page's own routes.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "room-head", password: "fixture-password-3051" };
const CHAT = 42;
const NOTE = "Check the nightly build and report what failed.";
const READING = "Nightly build checked, failures reported.";
const WIDTHS = [
  { width: 1280, height: 900, phone: false },
  { width: 360, height: 780, phone: true }
] as const;
const SCHEMES = ["light", "dark"] as const;

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

// The room with one reminder waiting, its note in English, and a translator that reads it. The press is what is
// driven, so the browser's own translation on opening is off.
async function open(viewport: (typeof WIDTHS)[number], scheme: (typeof SCHEMES)[number]): Promise<BrowserContext> {
  const context = await browser!.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.phone,
    hasTouch: viewport.phone,
    colorScheme: scheme,
    serviceWorkers: "block",
    reducedMotion: "reduce"
  });
  const at = cookie.indexOf("=");

  await context.addCookies([
    { name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! },
    { name: "console_auto_translate", value: "false", url: origin! },
    { name: "nuxt-color-mode", value: scheme, url: origin! }
  ]);
  await context.route(new RegExp(`/api/rooms/${CHAT}/background$`), (route) =>
    route.fulfill({
      json: {
        calls: [
          { id: "call-a", kind: "reminder", tool: "bmo/remind", note: NOTE, everySeconds: null, until: Date.now() + 3_600_000, agent: "agent-a", startedAt: Date.now() - 60_000 }
        ]
      }
    })
  );
  await context.route(/\/api\/translations$/, (route) => route.fulfill({ json: { readings: [{ text: READING, whole: true }] } }));

  return context;
}

// The gap between the end of the room's name, where its words end or where a name too long for the bar is cut, and
// the menu button's own box.
async function nameToMenu(page: Page): Promise<number> {
  return await page.evaluate(() => {
    const bar = document.querySelector("[data-title-bar]")!;
    const title = bar.querySelector("[data-slot=title]")!;
    const range = document.createRange();

    range.selectNodeContents(title);

    const end = Math.min(range.getBoundingClientRect().right, title.getBoundingClientRect().right);

    return bar.querySelector("[data-room-menu]")!.getBoundingClientRect().left - end;
  });
}

describe.skipIf(!origin || !touchReady())("the room's head", () => {
  for (const viewport of WIDTHS) {
    for (const scheme of SCHEMES) {
      test(`keeps 8px between the name and the menu, and reads a waiting call's note in place, ${viewport.width}px wide, ${scheme}`, async () => {
        const context = await open(viewport, scheme);
        const page = await context.newPage();

        try {
          await page.goto(`${origin}/rooms/${CHAT}`, { waitUntil: "load" });
          await page.locator("[data-title-bar] [data-room-menu]").waitFor({ timeout: 30_000 });
          expect(Math.round(await nameToMenu(page))).toBe(8);

          // The waiting call's note opens as the agent wrote it, under its line, and the press stands its reading in its
          // place; the show-original press puts the note back.
          const opener = page.locator("[data-room-background]");

          await opener.waitFor({ timeout: 30_000 });
          await opener.click();

          const note = page.locator("[data-room-background-list] [data-background-note]");

          try {
            await note.waitFor({ timeout: 5_000 });
          } catch {
            // A press made before the page's handlers land is lost, so the list is opened once more.
            await opener.click();
            await note.waitFor({ timeout: 10_000 });
          }

          expect((await note.innerText()).trim()).toBe(NOTE);
          // Every line of the entry, the reading's own among them, is drawn at the caption size, 14px.
          expect(await page.locator("[data-room-background-list] li").first().evaluate((entry) => [...entry.querySelectorAll("[data-reading], [data-background-note], li > span")].map((line) => getComputedStyle(line).fontSize))).toEqual(["14px", "14px", "14px", "14px"]);
          await page.locator("[data-room-background-list] [data-reading-translate]").click();
          await page.locator("[data-room-background-list] [data-reading-original]").waitFor({ timeout: 20_000 });
          expect((await note.innerText()).trim()).toBe(READING);
          await page.locator("[data-room-background-list] [data-reading-original]").click();
          expect((await note.innerText()).trim()).toBe(NOTE);
        } finally {
          await context.close();
        }
      }, 120_000);
    }
  }
});
