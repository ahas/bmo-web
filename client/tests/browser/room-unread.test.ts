import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";
import { UNREAD_LINE, UNREAD_ROOM } from "../support/unread-room";

import type { Browser, BrowserContext, Page } from "playwright-core";

// A room's unread count in the sidebar (docs/web.md, 「Unread messages」, 「The sidebar」), read through the console's own
// rooms route against the harness's receiver: a room the account meets while its line is still growing stands two
// behind, so its badge carries the count, and reading it to its end clears the count without a reload, in every tab
// of the account and after a reload too. The room's ids run past 2^53 (tests/support/unread-room.ts), so a mark or a
// count that rounded one would leave the room counting. The room list names a room's last message by its second and
// the marks keep the receiver's milliseconds; read in one unit for the other, every room would count nothing. It
// drives the console tests/support/browser-console.ts stands up; the suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;

const WIDE = { width: 1280, height: 900 };
const PHONE = { width: 360, height: 740 };

let browser: Browser | null = null;

async function signIn(name: string, password: string): Promise<string> {
  const login = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, password }) });

  expect(login.ok).toBe(true);

  return login.headers.get("set-cookie")!.split(";")[0]!;
}

async function contextFor(cookie: string, size: { width: number; height: number }): Promise<BrowserContext> {
  const phone = size.width < 640;
  const context = await browser!.newContext({ viewport: size, hasTouch: phone, isMobile: phone, serviceWorkers: "block", reducedMotion: "reduce" });
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

  return context;
}

// The room's line in the sidebar as it reads, a phone's drawer opened first.
async function roomLine(page: Page, phone: boolean): Promise<string> {
  const link = page.getByRole("navigation", { name: wording("common.label.room") }).getByRole("link", { name: /unread-room/ });

  // The title bar's toggle answers only once the page has hydrated, so a tap that opened nothing is made again.
  for (let tap = 0; phone && tap < 10 && !(await link.isVisible()); tap += 1) {
    await page.locator("[data-title-bar] [data-slot='toggle']").tap();
    await link.waitFor({ timeout: 2_000 }).catch(() => undefined);
  }
  await link.waitFor({ timeout: 20_000 });

  return (await link.innerText()).replace(/\s+/g, " ").trim();
}

// The room's line once it does or does not carry a pattern, as wanted, or as it last read once the bound runs out.
async function roomLineWhen(page: Page, phone: boolean, pattern: RegExp, carried: boolean): Promise<string> {
  let line = await roomLine(page, phone);

  for (const end = Date.now() + 10_000; pattern.test(line) !== carried && Date.now() < end; line = await roomLine(page, phone)) {
    await page.waitForTimeout(100);
  }

  return line;
}

// Two unread; and any count at all, the room's name holding no digit.
const TWO = /\b2\b/;
const COUNT = /\d/;

beforeAll(async () => {
  if (!origin || !touchReady()) return;

  browser = await chromium.launch();
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();
}, BROWSER_HOOK_MS);

describe.skipIf(!origin || !touchReady())("a room's unread count", () => {
  test("the rooms route counts what stands past the mark, and the sidebar's badge carries it", async () => {
    const context = await contextFor(await signIn("room-unread", "fixture-password-2252"), WIDE);

    try {
      const page = await context.newPage();

      await page.goto(`${origin}/siren`, { waitUntil: "load" });

      const rooms = (await (await page.request.get(`${origin}/api/rooms`)).json()) as { chatId: number; unread: number; firstUnread: string | null }[];

      expect(rooms.find((one) => one.chatId === UNREAD_ROOM)).toMatchObject({ unread: 2, firstUnread: UNREAD_LINE[1] });
      expect(await roomLineWhen(page, false, TWO, true)).toMatch(TWO);
    } finally {
      await context.close();
    }
  }, 90_000);

  // A mark made in one tab reaches every other tab of the account over the console's stream (docs/web.md, 「Unread
  // messages」), so the other's badge goes without a reload.
  test("a room read in one tab stops counting in another of the same account", async () => {
    const context = await contextFor(await signIn("room-unread-tabs", "fixture-password-2253"), WIDE);

    try {
      const first = await context.newPage();
      const second = await context.newPage();

      await first.goto(`${origin}/siren`, { waitUntil: "load" });
      await second.goto(`${origin}/siren`, { waitUntil: "load" });
      expect(await roomLineWhen(second, false, TWO, true)).toMatch(TWO);

      // The first tab reads the room to its end, naming its last message by its exact id.
      const read = await first.request.post(`${origin}/api/rooms/${UNREAD_ROOM}/read`, { data: { messageId: UNREAD_LINE.at(-1) } });

      expect(read.ok()).toBe(true);
      expect(await roomLineWhen(second, false, COUNT, false)).not.toMatch(COUNT);
    } finally {
      await context.close();
    }
  }, 90_000);

  // The room opened from the sidebar marks what stands in its view, here the whole of it; the count goes on the way
  // back without a reload, and a reload reads it gone from the server.
  for (const [width, size, account] of [
    ["a desk's width", WIDE, ["room-read-desk", "fixture-password-2953"]],
    ["a phone", PHONE, ["room-read-phone", "fixture-password-2954"]]
  ] as const) {
    test(`a room read to its end clears its count without a reload, and stays clear after one, on ${width}`, async () => {
      const phone = size === PHONE;
      const context = await contextFor(await signIn(account[0], account[1]), size);

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/siren`, { waitUntil: "load" });
        expect(await roomLineWhen(page, phone, TWO, true)).toMatch(TWO);

        const marked = page.waitForResponse((answer) => answer.url().endsWith(`/api/rooms/${UNREAD_ROOM}/read`) && answer.request().method() === "POST", { timeout: 20_000 });

        await page.getByRole("navigation", { name: wording("common.label.room") }).getByRole("link", { name: /unread-room/ }).click();

        const mark = await marked;

        expect(mark.request().postDataJSON()).toEqual({ messageId: UNREAD_LINE.at(-1) });
        expect(await mark.json()).toMatchObject({ unread: 0, firstUnread: null });

        const rooms = (await (await page.request.get(`${origin}/api/rooms`)).json()) as { chatId: number; unread: number }[];

        expect(rooms.find((one) => one.chatId === UNREAD_ROOM)?.unread).toBe(0);

        await page.goBack({ waitUntil: "load" });
        expect(await roomLineWhen(page, phone, COUNT, false)).not.toMatch(COUNT);

        await page.reload({ waitUntil: "load" });
        expect(await roomLineWhen(page, phone, COUNT, false)).not.toMatch(COUNT);
      } finally {
        await context.close();
      }
    }, 90_000);
  }
});
