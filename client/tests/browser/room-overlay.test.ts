import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, Page } from "playwright-core";

// Where the room's menu carries the entry for the reader's own BMO beside it (docs/web.md, the room screen's overlay): the room the console carries by itself, on the record alone and nobody's private room,
// carries it; a room a chat service carries, another account's private room and the reader's own room with their BMO
// hold it away from the menu altogether, with nothing standing in its place and no line saying why, while the rest of
// the menu — the find row, which no room holds away — stands as it does. The room's standing is the console's
// server's answer, read as the room opens, so each room's own read is waited for before its menu is opened.
// It drives the console tests/support/browser-console.ts stands up; the suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "room-overlay", password: "fixture-password-5317" };
// The room on the record alone, a chat service's own room, another account's private room, and the reader's own
// room with their BMO.
const LONE_CHAT = 46;
const PAST_CHAT = -9_002_000_000_002;
const PRIVATE_CHAT = -9_003_000_000_001;
const OWN_CHAT = -9_003_000_000_002;

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

describe.skipIf(!origin || !touchReady())("the entry for the reader's own BMO, room by room", () => {
  // The room opened, its own answer of whether it carries the entry heard, and its menu opened.
  async function openedMenu(page: Page, chat: number): Promise<void> {
    const answered = page.waitForResponse((said) => said.url().includes(`/rooms/${chat}/overlay`), { timeout: 30_000 });

    await page.goto(`${origin}/rooms/${chat}`, { waitUntil: "load" });
    await page.locator("[data-room-menu]").first().waitFor({ timeout: 30_000 });
    await answered;

    await page.getByRole("button", { name: wording("common.action.more") }).first().click();
    // The menu stands open only when an entry every room carries has come up in it.
    await page.getByRole("menuitem", { name: wording("room.action.find") }).waitFor({ timeout: 30_000 });
  }

  for (const [width, height, phone] of [[1280, 900, false], [360, 780, true]] as const) {
    for (const [said, chat, carries] of [
      ["stands in the room the console carries itself", LONE_CHAT, true],
      ["is away from a chat service's room", PAST_CHAT, false],
      ["is away from another account's private room", PRIVATE_CHAT, false],
      ["is away from the reader's own room with their BMO", OWN_CHAT, false]
    ] as const) {
      test(`${said}, ${width}px wide`, async () => {
        const context = await browser!.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, locale: "ko-KR", serviceWorkers: "block", reducedMotion: "reduce" });
        const at = cookie.indexOf("=");

        await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

        try {
          const page = await context.newPage();

          await openedMenu(page, chat);

          const entry = page.getByRole("menuitem", { name: wording("room.action.overlay") });

          if (carries) await entry.waitFor({ timeout: 30_000 });
          else expect(await entry.count()).toBe(0);
        } finally {
          await context.close();
        }
      }, 90_000);
    }
  }
});
