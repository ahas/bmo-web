import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { INVITE_ACCOUNTS, INVITE_ROOM, OPENING_WORDS } from "../support/invite-room";
import { openRoomInfo, roomInfo } from "./room-info";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, BrowserContext, Locator, Page } from "playwright-core";

// A person let into a room from the room's own screen (docs/web.md, the room screen's section on opening a room and
// letting people in), in the invite room the harness's receiver keeps (tests/support/invite-room.ts), with the account
// service judging who may: a member who writes there and did not open it finds the let-in entry in the room's menu, which
// opens the dialog over the room's people, lets a guest in, and takes nobody out; the guest, whose console stands open
// on another page, is told at once and finds the room in their sidebar without reading the page again, and reads it
// from its first line on; and a member whose rooms section only reads is offered nothing and refused the route. It
// drives the console tests/support/browser-console.ts stands up; the suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const TELL_MS = 30_000;

let browser: Browser | null = null;

beforeAll(async () => {
  if (!origin || !touchReady()) return;

  browser = await chromium.launch();
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();
}, BROWSER_HOOK_MS);

async function cookieOf(account: { name: string; password: string }): Promise<string> {
  const login = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(account) });

  expect(login.ok).toBe(true);

  return login.headers.get("set-cookie")!.split(";")[0]!;
}

// A browser standing in an account's login at a width.
async function signedIn(account: { name: string; password: string }, width: number, height: number, phone: boolean): Promise<BrowserContext> {
  const cookie = await cookieOf(account);
  const at = cookie.indexOf("=");
  const context = await browser!.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, serviceWorkers: "block", reducedMotion: "reduce" });

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

  return context;
}

// A control pressed the way the width's reader presses it: a finger on a phone, a pointer elsewhere.
async function press(target: Locator, phone: boolean): Promise<void> {
  if (phone) await target.tap();
  else await target.click();
}

async function roomOpen(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();

  await page.goto(`${origin}/rooms/${INVITE_ROOM}`, { waitUntil: "load" });
  await page.getByText(OPENING_WORDS).first().waitFor({ timeout: 60_000 });

  return page;
}

describe.skipIf(!origin || !touchReady())("a person let into a room from its screen", () => {
  for (const [width, height, phone, guest] of [[1280, 900, false, INVITE_ACCOUNTS.guests[0]], [360, 780, true, INVITE_ACCOUNTS.guests[1]]] as const) {
    test(`by a member who writes there, the guest told at once and reading it, ${width}px wide`, async () => {
      const guestContext = await signedIn(guest, 1280, 900, false);
      const writerContext = await signedIn(INVITE_ACCOUNTS.writer, width, height, phone);

      try {
        // The guest's console stands open elsewhere, its stream open and its rooms read, the invite room not among them.
        const guestPage = await guestContext.newPage();
        const streamOpen = guestPage.waitForRequest(/\/api\/events(\?|$)/, { timeout: 60_000 });
        const roomsRead = guestPage.waitForResponse((answer) => /\/api\/rooms$/.test(new URL(answer.url()).pathname), { timeout: 60_000 });

        await guestPage.goto(`${origin}/`, { waitUntil: "load" });
        await Promise.all([streamOpen, roomsRead]);

        const sidebarRoom = guestPage.locator(`a[href$="/rooms/${INVITE_ROOM}"]`);

        expect(await sidebarRoom.count()).toBe(0);

        // The writer finds the let-in entry in the room's menu; it opens the dialog over the room's people.
        const page = await roomOpen(writerContext);

        await press(page.locator("[data-title-bar] [data-room-menu]"), phone);
        await press(page.getByRole("menuitem", { name: wording("members.action.let_in") }), phone);

        const dialog = page.getByRole("dialog", { name: wording("members.title.let_in") });

        await dialog.waitFor({ timeout: 10_000 });
        expect(await roomInfo(page).count()).toBe(1);

        // A pointer's press puts the focus in the list's search field at once; a finger presses the field itself.
        await press(dialog.getByLabel(wording("members.label.choice")).first(), phone);
        if (phone) await press(page.locator("[data-reka-popper-content-wrapper] input").first(), phone);
        await page.keyboard.type(guest.name);
        await press(page.getByRole("option").filter({ hasText: guest.name }).first(), phone);
        await page.keyboard.press("Escape");
        await dialog.locator("[data-let-in-chosen]").filter({ hasText: guest.name }).waitFor({ timeout: 10_000 });
        await press(dialog.getByRole("button", { name: wording("common.action.add"), exact: true }), phone);
        await dialog.waitFor({ state: "hidden", timeout: 30_000 });

        // The guest stands among the room's people, and the writer, who did not open the room, takes nobody out.
        const people = roomInfo(page).locator("[data-room-members]");

        await people.getByText(guest.name).first().waitFor({ timeout: 30_000 });
        expect(await people.locator("[data-room-take-out]").count()).toBe(0);
        expect(await people.locator("[data-room-leave]").count()).toBe(1);

        // The guest is told with no reading of the page again, and reads the room from its first line on, the line
        // naming who let them in standing last.
        await sidebarRoom.first().waitFor({ timeout: TELL_MS });
        await sidebarRoom.first().click();
        await guestPage.getByText(OPENING_WORDS).first().waitFor({ timeout: 60_000 });

        const told = guestPage.locator("[data-message]").last();

        expect(await told.textContent()).toContain(INVITE_ACCOUNTS.writer.name);
        expect(await told.textContent()).toContain(guest.name);
      } finally {
        await writerContext.close();
        await guestContext.close();
      }
    }, BROWSER_HOOK_MS * 3);
  }

  test("is offered to nobody whose rooms section only reads, and the route refuses them", async () => {
    const context = await signedIn(INVITE_ACCOUNTS.reader, 1280, 900, false);

    try {
      const page = await roomOpen(context);

      await page.locator("[data-title-bar] [data-room-menu]").click();
      await page.getByRole("menuitem", { name: wording("room.action.choose_messages") }).waitFor({ timeout: 10_000 });
      expect(await page.getByRole("menuitem", { name: wording("members.action.let_in") }).count()).toBe(0);
      await page.keyboard.press("Escape");

      const sheet = await openRoomInfo(page);

      await sheet.locator("[data-room-members]").waitFor({ timeout: 30_000 });
      expect(await sheet.locator("[data-room-let-in]").count()).toBe(0);

      const refused = await fetch(`${origin}/api/rooms/${INVITE_ROOM}/accounts`, {
        method: "POST",
        headers: { cookie: await cookieOf(INVITE_ACCOUNTS.reader), "content-type": "application/json" },
        body: JSON.stringify({ accounts: ["1"] })
      });

      expect(refused.ok).toBe(false);
    } finally {
      await context.close();
    }
  }, BROWSER_HOOK_MS * 2);
});
