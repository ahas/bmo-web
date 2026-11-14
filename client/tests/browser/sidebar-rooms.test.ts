import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";

import type { Browser, BrowserContext, Page } from "playwright-core";

// The sidebar holds the rooms that have been added and none that was not, though the owner's words stand in it
// (docs/web.md, 「Sidebar」), on a desk's width and in a phone's drawer alike; the room add dialog brings such a room in
// at once, and once its registration is removed it leaves, and lists the contacts of the reader's own account. It drives the console tests/support/browser-console.ts
// stands up, whose receiver lists one such room beside the added ones; the suite stands up no console, so there it
// skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "sidebar-rooms", password: "fixture-password-2941" };
const NUMBERED_CHAT = -9_002_000_000_001;

const WIDE = { width: 1280, height: 800 };
const PHONE = { width: 360, height: 740 };

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

async function contextFor(size: { width: number; height: number }): Promise<BrowserContext> {
  const phone = size.width < 640;
  const context = await browser!.newContext({ viewport: size, hasTouch: phone, isMobile: phone, serviceWorkers: "block", reducedMotion: "reduce" });
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

  return context;
}

// The rooms the sidebar shows, by name, once the added rooms stand in it; a phone's drawer is opened first.
async function shownRooms(page: Page, phone: boolean): Promise<string[]> {
  await page.goto(`${origin}/siren`, { waitUntil: "load" });

  const rooms = page.getByRole("navigation", { name: wording("common.label.room") });
  const used = rooms.getByRole("link", { name: /unread-room/ });

  // The title bar's toggle answers only once the page has hydrated, so a tap that opened nothing is made again.
  for (let tap = 0; phone && tap < 10 && !(await used.isVisible()); tap += 1) {
    await page.locator("[data-title-bar] [data-slot='toggle']").tap();
    await used.waitFor({ timeout: 2_000 }).catch(() => undefined);
  }
  await used.waitFor({ timeout: 20_000 });

  return (await rooms.getByRole("link").allInnerTexts()).map((text) => text.replace(/\s+/g, " ").trim());
}

describe.skipIf(!origin || !touchReady())("the sidebar's rooms", () => {
  for (const [width, size] of [["a desk's width", WIDE], ["a phone", PHONE]] as const) {
    test(`hold the added rooms and leave out the one the owner speaks in but never added, on ${width}`, async () => {
      const context = await contextFor(size);

      try {
        const shown = await shownRooms(await context.newPage(), size === PHONE);

        expect(shown.some((name) => name.includes("unread-room"))).toBe(true);
        expect(shown.some((name) => name.includes("record-room"))).toBe(true);
        expect(shown.some((name) => name.includes("numbered-room"))).toBe(false);
      } finally {
        await context.close();
      }
    }, 90_000);
  }

  test("the room added from the room add dialog stands at once, and leaves once its registration is removed", async () => {
    const context = await contextFor(WIDE);

    try {
      const page = await context.newPage();

      expect((await shownRooms(page, false)).some((name) => name.includes("numbered-room"))).toBe(false);

      await page.locator("[data-room-add]:visible").click();

      const dialog = page.getByRole("dialog", { name: wording("room.title.room_add") });

      await dialog.getByRole("combobox", { name: wording("room.label.room_add_service") }).click();
      await page.getByRole("option", { name: "Chat A" }).click();
      await dialog.getByRole("option", { name: /numbered-room/ }).locator("button").click();
      await dialog.getByRole("button", { name: wording("common.action.add") }).click();
      await dialog.waitFor({ state: "hidden", timeout: 20_000 });

      const rooms = page.getByRole("navigation", { name: wording("common.label.room") });

      await rooms.getByRole("link", { name: /numbered-room/ }).waitFor({ timeout: 20_000 });

      expect((await page.request.post(`${origin}/api/rooms/${NUMBERED_CHAT}/remove`)).ok()).toBe(true);
      expect((await shownRooms(page, false)).some((name) => name.includes("numbered-room"))).toBe(false);
    } finally {
      await context.close();
    }
  }, 120_000);

  test("the room add dialog lists the contacts of the signed-in person's own account, and says so", async () => {
    const context = await contextFor(WIDE);

    try {
      const page = await context.newPage();

      await shownRooms(page, false);
      await page.locator("[data-room-add]:visible").click();

      const dialog = page.getByRole("dialog", { name: wording("room.title.room_add") });

      await dialog.getByRole("combobox", { name: wording("room.label.room_add_service") }).click();
      await page.getByRole("option", { name: "Chat A" }).click();
      await dialog.getByRole("tab", { name: wording("room.label.room_add_tab_contacts") }).click();

      const contacts = dialog.getByRole("listbox", { name: wording("room.label.room_add_tab_contacts") });

      await contacts.getByRole("option").first().waitFor({ timeout: 20_000 });

      expect(await contacts.getByRole("option").allInnerTexts()).toEqual([expect.stringMatching(/^contact-of-account-\d+\b/)]);
      await dialog.getByText(wording("room.message.room_add_contacts_mine"), { exact: true }).waitFor({ timeout: 5_000 });
    } finally {
      await context.close();
    }
  }, 120_000);
});
