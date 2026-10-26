import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser } from "playwright-core";

// A room's unread count in the sidebar (docs/web.md, 「Unread messages」, 「The sidebar」), read through the console's own
// rooms route against the harness's receiver: a room the account meets while its line is still growing stands two
// behind, so its badge carries the count. The room list names a room's last message by its second and the marks keep
// the receiver's milliseconds; read in one unit for the other, every room would count nothing. It drives the console
// tests/support/browser-console.ts stands up; the suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "room-unread", password: "fixture-password-2252" };

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

describe.skipIf(!origin || !touchReady())("a room's unread count", () => {
  test("the rooms route counts what stands past the mark, and the sidebar's badge carries it", async () => {
    const context = await browser!.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block", reducedMotion: "reduce" });
    const at = cookie.indexOf("=");

    await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

    try {
      const page = await context.newPage();

      await page.goto(`${origin}/live`, { waitUntil: "load" });

      const rooms = (await (await page.request.get(`${origin}/api/rooms`)).json()) as { chatId: number; unread: number; firstUnread: number | null }[];

      expect(rooms.find((one) => one.chatId === 43)).toMatchObject({ unread: 2, firstUnread: 2 });

      const link = page.getByRole("link", { name: /unread-room/ }).first();

      await link.waitFor({ timeout: 20_000 });
      await page.waitForTimeout(1_000);
      expect((await link.innerText()).replace(/\s+/g, " ")).toContain("2");
    } finally {
      await context.close();
    }
  }, 90_000);
});
