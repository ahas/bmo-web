import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { openRoomInfo, roomInfo } from "./room-info";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, Page } from "playwright-core";
import type { ArchivedMessage, RoomHolding, RoomHoldingPage, RoomMembersView } from "../../apps/web/shared/types";

// The room information the room's name opens (docs/web.md, the room screen's room information), in the room the
// console made on the record road that the harness's receiver stands: its tabs stand on one row at every width, the
// room's menu no longer carries what it holds, each kind of what the messages carried stands newest first across its
// pages with what it says when it holds none, a line's show-in-message closes it onto the message, and closing it with
// the callers' switch turned off asks first while a switch turned back asks nothing, as the room's picture does with a
// picture picked and not saved. What each tab reads is served
// through the page's own routes, since the harness's receiver keeps no such messages. It drives the console
// tests/support/browser-console.ts stands up; the suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "room-info", password: "fixture-password-3755" };
const RECORD_CHAT = -9_000_000_000_099;

const MEMBERS = { members: [{ person: 9_000_000_000_101, name: "member-a", status: null, account: null, inConsole: false }], chatMembers: "listed", mayLetIn: false } satisfies RoomMembersView;

// A one-pixel picture, for the media tab's square.
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

function message(messageId: string, sentAt: number, over: Partial<ArchivedMessage>): ArchivedMessage {
  return { chatId: RECORD_CHAT, messageId, senderId: 11, senderName: "person-a", sentAt, text: "", imagePath: null, replyToMessageId: null, ...over };
}

const file = (id: number, kind: "audio" | "document", name: string) => ({ id, kind, name, bytes: 2048, type: kind === "audio" ? "audio/ogg" : "application/pdf", available: true });

// What each tab is answered, page by page: the files over two pages, a page each for the rest, and no music at all.
// `shown` is the number of a message the room's line holds, so a line's show-in-message has a message to land on.
function pages(shown: string): Record<RoomHolding, RoomHoldingPage[]> {
  return {
    media: [{ messages: [message("901", 1_790_000_100, { imagePath: "/kept/901.png" })], hasMore: false }],
    file: [
      { messages: [message(shown, 1_790_000_300, { attachments: [file(31, "document", "newer.pdf")] })], hasMore: true },
      { messages: [message("902", 1_790_000_200, { attachments: [file(21, "document", "older.pdf")] })], hasMore: false }
    ],
    link: [{ messages: [message("903", 1_790_000_100, { text: "read https://example.com/page now" })], hasMore: false }],
    music: [{ messages: [], hasMore: false }],
    voice: [{ messages: [message("904", 1_790_000_100, { attachments: [file(41, "audio", "voice.ogg")], voiceSeconds: 7, transcript: "words heard" })], hasMore: false }]
  };
}

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

// The room open at a width, every tab's read answered here, and the number of the room's newest message.
async function roomOpen(width: number, height: number, phone: boolean): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser!.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, serviceWorkers: "block", reducedMotion: "reduce" });
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

  const page = await context.newPage();
  let answered: Record<RoomHolding, RoomHoldingPage[]> | null = null;

  await page.route(`**/api/rooms/${RECORD_CHAT}/members`, (route) => route.fulfill({ json: MEMBERS }));
  await page.route(`**/api/rooms/${RECORD_CHAT}/callers`, (route) => route.fulfill({ json: { room: RECORD_CHAT, callers: [], mayChange: true } }));
  await page.route("**/api/images/**", (route) => route.fulfill({ contentType: "image/png", body: PIXEL }));
  await page.route(`**/api/rooms/${RECORD_CHAT}/holding?*`, async (route) => {
    const query = new URL(route.request().url()).searchParams;
    const kind = query.get("kind") as RoomHolding;
    const served = answered![kind];

    await route.fulfill({ json: query.has("before") ? served[1] : served[0] });
  });
  await page.goto(`${origin}/rooms/${RECORD_CHAT}`, { waitUntil: "load" });

  const newest = page.locator("[data-message-id]").last();

  await newest.waitFor({ timeout: 30_000 });
  answered = pages((await newest.getAttribute("data-message-id"))!);

  return { page, close: () => context.close() };
}

const TABS = ["members", "media", "files", "links", "music", "voice", "situation", "callers", "session", "providers"] as const;

describe.skipIf(!origin || !touchReady())("the room information", () => {
  for (const [width, height, phone] of [[1280, 900, false], [360, 780, true]] as const) {
    test(`opens from the room's name with its tabs on one row, and the room's menu holds none of them, ${width}px wide`, async () => {
      const { page, close } = await roomOpen(width, height, phone);

      try {
        await page.locator("[data-room-menu]").click();
        await page.getByRole("menu").waitFor({ timeout: 10_000 });

        const entries = await page.getByRole("menuitem").allInnerTexts();

        for (const name of ["members", "situation", "callers", "session", "providers"] as const) {
          expect(entries.map((entry) => entry.trim())).not.toContain(wording(`room_info.label.${name}`));
        }
        await page.keyboard.press("Escape");
        await page.getByRole("menu").waitFor({ state: "detached", timeout: 10_000 });

        const sheet = await openRoomInfo(page);
        const tabs = sheet.getByRole("tab");

        expect(await tabs.allInnerTexts()).toEqual(TABS.map((name) => wording(`room_info.label.${name}`)));

        // One row no taller than a tab row, every tab on it, scrolling sideways where it is narrower than they are.
        const row = await sheet.locator("[data-room-info-tabs] [role=tablist]").evaluate((list) => ({
          height: list.getBoundingClientRect().height,
          tops: [...list.querySelectorAll("[role=tab]")].map((tab) => Math.round(tab.getBoundingClientRect().top)),
          scrolls: list.scrollWidth > list.clientWidth
        }));

        expect(row.height).toBeLessThanOrEqual(40);
        expect(new Set(row.tops).size).toBe(1);
        expect(row.scrolls).toBe(width < 600);
      } finally {
        await close();
      }
    }, 90_000);

    test(`stands each kind newest first across its pages, says when it holds none, and lands a line on its message, ${width}px wide`, async () => {
      const { page, close } = await roomOpen(width, height, phone);

      try {
        const sheet = await openRoomInfo(page, wording("room_info.label.media"));

        await sheet.locator("[data-room-holding=media] [data-held=picture]").waitFor({ timeout: 10_000 });
        expect(await sheet.locator("[data-room-holding=media] [data-held]").count()).toBe(1);
        // The tab first shown stands hidden once another stands.
        expect(await sheet.locator("[data-room-members]").isVisible()).toBe(false);

        await sheet.getByRole("tab", { name: wording("room_info.label.files"), exact: true }).click();

        const files = sheet.locator("[data-room-holding=file] [data-held=file]");

        await files.nth(1).waitFor({ timeout: 10_000 });
        expect((await files.allInnerTexts()).map((line) => line.split("\n")[0])).toEqual(["newer.pdf", "older.pdf"]);

        await sheet.getByRole("tab", { name: wording("room_info.label.links"), exact: true }).click();

        const link = sheet.locator("[data-room-holding=link] [data-held=link] a");

        await link.waitFor({ timeout: 10_000 });
        expect(await link.getAttribute("href")).toBe("https://example.com/page");
        expect(await link.getAttribute("target")).toBe("_blank");

        await sheet.getByRole("tab", { name: wording("room_info.label.music"), exact: true }).click();
        await sheet.getByText(wording("room_info.label.music_none"), { exact: true }).waitFor({ timeout: 10_000 });

        await sheet.getByRole("tab", { name: wording("room_info.label.voice"), exact: true }).click();
        await sheet.getByText("words heard", { exact: true }).waitFor({ timeout: 10_000 });

        // The newer file came in a message the room's line holds: its show-in-message closes the view onto it.
        await sheet.getByRole("tab", { name: wording("room_info.label.files"), exact: true }).click();
        await files.first().locator("[data-held-show]").click();
        await roomInfo(page).waitFor({ state: "detached", timeout: 10_000 });
        expect(new URL(page.url()).pathname).toEndWith(`/rooms/${RECORD_CHAT}`);
      } finally {
        await close();
      }
    }, 90_000);

    test(`asks before closing while the callers' switch stands turned off or a picked picture waits, and not once the switch is turned back, ${width}px wide`, async () => {
      const { page, close } = await roomOpen(width, height, phone);

      try {
        const sheet = await openRoomInfo(page, wording("room_info.label.callers"));
        const allow = sheet.getByRole("switch", { name: wording("callers.label.allow") });

        await allow.waitFor({ timeout: 10_000 });
        await allow.click();
        await page.keyboard.press("Escape");

        const question = page.getByRole("alertdialog").or(page.getByRole("dialog", { name: wording("common.title.discard_changes") }));

        await question.waitFor({ timeout: 10_000 });

        // Back answers the question as staying: the view stands with the switch as it was left.
        await page.goBack();
        await question.waitFor({ state: "detached", timeout: 10_000 });
        expect(await roomInfo(page).isVisible()).toBe(true);
        expect(await allow.getAttribute("aria-checked")).toBe("false");

        // Turned back, the view holds nothing, and closing asks nothing.
        await allow.click();
        await page.keyboard.press("Escape");
        await roomInfo(page).waitFor({ state: "detached", timeout: 10_000 });

        // The room's picture, opened from the head, asks before it closes while a picked picture waits unsaved.
        await (await openRoomInfo(page)).locator("[data-room-info-set-picture]").click();

        const setting = page.locator("[data-picture-setting='room']");

        await setting.locator("input[type=file]").setInputFiles({ name: "room.png", mimeType: "image/png", buffer: PIXEL });
        await page.keyboard.press("Escape");
        await question.waitFor({ timeout: 10_000 });
        await page.goBack();
        await question.waitFor({ state: "detached", timeout: 10_000 });
        expect(await setting.isVisible()).toBe(true);
      } finally {
        await close();
      }
    }, 90_000);
  }
});
