import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";

import type { Browser, BrowserContext, Page } from "playwright-core";

// The sidebar holds the rooms that have been added and none that was not, though the owner's words stand in it
// (docs/web.md, 「Sidebar」), on a desk's width and in a phone's drawer alike. Its new chat button offers the
// administrator a menu of the two ways to bring a room in: the room add dialog, which brings such a room in at once,
// and once its registration is removed it leaves, and lists the contacts of the reader's own account; and the room
// open dialog, which opens a console room and goes to it. A member whose rooms section writes has the second way
// alone, and the button opens its dialog with no menu. It drives the console tests/support/browser-console.ts stands
// up, whose receiver lists one such room beside the added ones; the suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "sidebar-rooms", password: "fixture-password-2941" };
const WRITER = { name: "room-writer", password: "fixture-password-2401" };
const RECORD_CHAT = -9_000_000_000_099;
const NUMBERED_CHAT = -9_002_000_000_001;

const WIDE = { width: 1280, height: 800 };
const PHONE = { width: 360, height: 740 };

let browser: Browser | null = null;
let cookie = "";
let writerCookie = "";

async function signedIn(account: { name: string; password: string }): Promise<string> {
  const login = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(account) });

  expect(login.ok).toBe(true);

  return login.headers.get("set-cookie")!.split(";")[0]!;
}

beforeAll(async () => {
  if (!origin || !touchReady()) return;

  cookie = await signedIn(ACCOUNT);
  writerCookie = await signedIn(WRITER);
  browser = await chromium.launch();
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();
}, BROWSER_HOOK_MS);

async function contextFor(size: { width: number; height: number }, signedCookie = cookie): Promise<BrowserContext> {
  const phone = size.width < 640;
  const context = await browser!.newContext({ viewport: size, hasTouch: phone, isMobile: phone, serviceWorkers: "block", reducedMotion: "reduce" });
  const at = signedCookie.indexOf("=");

  await context.addCookies([{ name: signedCookie.slice(0, at), value: signedCookie.slice(at + 1), url: origin! }]);

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

// The new chat button's menu, opened, with its items' names; a test then chooses one of them.
async function newChatMenu(page: Page): Promise<string[]> {
  await page.locator("[data-new-chat]:visible").click();

  const items = page.getByRole("menuitem");

  await items.first().waitFor({ timeout: 20_000 });

  return (await items.allInnerTexts()).map((text) => text.trim());
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

  test("the room added from the room add dialog stands at once, says the mode it was added in, and leaves once its registration is removed", async () => {
    const context = await contextFor(WIDE);

    try {
      const page = await context.newPage();

      expect((await shownRooms(page, false)).some((name) => name.includes("numbered-room"))).toBe(false);

      await newChatMenu(page);
      await page.getByRole("menuitem", { name: wording("room.action.new_chat_add") }).click();

      const dialog = page.getByRole("dialog", { name: wording("room.title.room_add") });

      await dialog.getByRole("button", { name: wording("room.label.room_add_service") }).click();
      await page.getByRole("option", { name: wording("room.label.road_other", { key: "chat-a" }) }).click();
      await dialog.getByRole("option", { name: /numbered-room/ }).locator("button").click();
      await dialog.getByRole("button", { name: wording("common.action.add") }).click();
      await dialog.waitFor({ state: "hidden", timeout: 20_000 });

      const rooms = page.getByRole("navigation", { name: wording("common.label.room") });

      await rooms.getByRole("link", { name: /numbered-room/ }).waitFor({ timeout: 20_000 });

      // Opened again, the dialog says which mode the room stands in, by that mode's own sentence.
      await newChatMenu(page);
      await page.getByRole("menuitem", { name: wording("room.action.new_chat_add") }).click();
      await dialog.getByRole("button", { name: wording("room.label.room_add_service") }).click();
      await page.getByRole("option", { name: wording("room.label.road_other", { key: "chat-a" }) }).click();

      const held = [wording("room.label.room_add_held_avatar"), wording("room.label.room_add_held_record_only")];
      const line = dialog.getByRole("option", { name: /numbered-room/ });

      await line.getByText(new RegExp(held.join("|"))).waitFor({ timeout: 20_000 });
      // Closed by its corner close; where the service chosen counts as a change, leaving asks first and is discarded.
      await dialog.getByRole("button", { name: wording("common.action.close"), exact: true }).first().click();

      const discard = page.getByRole("button", { name: wording("common.action.discard"), exact: true });

      await Promise.race([discard.waitFor({ timeout: 20_000 }).then(() => discard.click()), dialog.waitFor({ state: "hidden", timeout: 20_000 })]);
      await dialog.waitFor({ state: "hidden", timeout: 20_000 });

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
      await newChatMenu(page);
      await page.getByRole("menuitem", { name: wording("room.action.new_chat_add") }).click();

      const dialog = page.getByRole("dialog", { name: wording("room.title.room_add") });

      await dialog.getByRole("button", { name: wording("room.label.room_add_service") }).click();
      await page.getByRole("option", { name: wording("room.label.road_other", { key: "chat-a" }) }).click();
      await dialog.getByRole("tab", { name: wording("room.label.room_add_tab_contacts") }).click();

      const contacts = dialog.getByRole("listbox", { name: wording("room.label.room_add_tab_contacts") });

      await contacts.getByRole("option").first().waitFor({ timeout: 20_000 });

      expect(await contacts.getByRole("option").allInnerTexts()).toEqual([expect.stringMatching(/^contact-of-account-\d+\b/)]);
      await dialog.getByText(wording("room.message.room_add_contacts_mine"), { exact: true }).waitFor({ timeout: 5_000 });
    } finally {
      await context.close();
    }
  }, 120_000);

  test("the administrator's new chat menu holds both ways, and its console room opens the room open dialog that goes to the room made", async () => {
    const context = await contextFor(WIDE);
    const asked: unknown[] = [];

    // The receiver's stand-in adds chat service rooms alone, so the room the dialog makes is answered here as the
    // record room the fixture lists.
    await context.route(/\/api\/rooms$/, async (route) => {
      if (route.request().method() !== "POST") return route.fallback();

      asked.push(route.request().postDataJSON());

      return route.fulfill({ json: { chatId: RECORD_CHAT, title: "made-room" } });
    });

    try {
      const page = await context.newPage();

      await shownRooms(page, false);
      expect(await newChatMenu(page)).toEqual([wording("room.action.new_chat_add"), wording("room.action.new_chat_open")]);
      await page.getByRole("menuitem", { name: wording("room.action.new_chat_open") }).click();

      const dialog = page.getByRole("dialog", { name: wording("room.title.room_open") });

      await dialog.getByRole("textbox", { name: wording("room.label.room_open_title") }).fill("made-room");
      await dialog.getByRole("button", { name: wording("room.action.room_open") }).click();
      await dialog.waitFor({ state: "hidden", timeout: 20_000 });
      await page.waitForURL(`**/rooms/${RECORD_CHAT}`, { timeout: 20_000 });

      expect(asked).toEqual([{ title: "made-room" }]);
    } finally {
      await context.close();
    }
  }, 120_000);

  test("a member whose rooms section writes has no menu: the new chat button opens the room open dialog at once", async () => {
    const context = await contextFor(WIDE, writerCookie);

    try {
      const page = await context.newPage();

      await page.goto(`${origin}/`, { waitUntil: "load" });

      const button = page.locator("[data-new-chat]:visible");

      const dialog = page.getByRole("dialog", { name: wording("room.title.room_open") });

      await button.waitFor({ timeout: 20_000 });
      expect(await button.getAttribute("aria-label")).toBe(wording("room.title.new_chat"));
      // The button answers only once the page has hydrated, so a press that opened nothing is made again.
      for (let press = 0; press < 10 && !(await dialog.isVisible()); press += 1) {
        await button.click();
        await dialog.waitFor({ timeout: 2_000 }).catch(() => undefined);
      }
      await dialog.waitFor({ timeout: 5_000 });

      expect(await page.getByRole("menuitem").count()).toBe(0);
    } finally {
      await context.close();
    }
  }, 120_000);
});
