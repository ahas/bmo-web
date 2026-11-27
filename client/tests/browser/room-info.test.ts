import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { openRoomInfo, roomInfo } from "./room-info";
import { goInApp, holdsFocus, standsOnTop } from "./top-layer";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, Page } from "playwright-core";
import type { ArchivedMessage, RoomHolding, RoomHoldingPage, RoomMembersView, RoomPicturePage, RoomProvidersView, RoomSupervisorStanding } from "../../apps/web/shared/types";

// The room information the room's name opens (docs/web.md, the room screen's room information), in the room the
// console made on the record road that the harness's receiver stands: its tabs stand on one row at every width, the
// room's menu no longer carries what it holds, each kind of what the messages carried stands newest first across its
// pages with what it says when it holds none, a line's show-in-message closes it onto the message, it carries no
// callers' tab and closes at once since nothing in it waits, while the room's picture asks first with a picture picked
// and not saved, the chat services carrying the room stand as labels in its head for the owner with no tab of their
// own, and the supervisors that answer the room stand at the head of the members tab, each with the account it answers in and
// its switch, a named one taken out and another named there. What opens over the view (a picture or a video of the media tab, the room's picture,
// its picture setting and the search the shortcut opens) stands over it, after a return to the room and across the
// narrow width too, and back or Esc closes it alone. What each tab reads is served
// through the page's own routes, since the harness's receiver keeps no such messages. It drives the console
// tests/support/browser-console.ts stands up; the suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "room-info", password: "fixture-password-3755" };
const RECORD_CHAT = -9_000_000_000_099;

const MEMBERS = { members: [{ person: 9_000_000_000_101, name: "member-a", status: null, account: null, inConsole: false, grants: null }], chatMembers: "listed", entry: { letIn: false, takeOut: false, messenger: false, leaves: true }, mayGrant: false } satisfies RoomMembersView;

// A one-pixel picture, for the media tab's square.
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

// What `read` answers once it holds, read again until it does or the time is up.
async function until<T>(read: () => Promise<T>, holds: (value: T) => boolean, ms = 10_000): Promise<T> {
  const end = Date.now() + ms;
  let value = await read();

  while (!holds(value) && Date.now() < end) {
    await new Promise((done) => setTimeout(done, 50));
    value = await read();
  }

  return value;
}

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

// The media tab holding a video as well as the picture, for what each opens over the view.
const WITH_VIDEO: RoomHoldingPage[] = [
  {
    messages: [
      message("905", 1_790_000_200, { attachments: [{ id: 51, kind: "video", name: "clip.mp4", bytes: 2048, type: "video/mp4", available: true }] }),
      message("901", 1_790_000_100, { imagePath: "/kept/901.png" })
    ],
    hasMore: false
  }
];

// The room's pictures as its viewer walks them: the one picture the media tab holds.
const PICTURES: RoomPicturePage = {
  pictures: [{ messageId: "901", album: null, senderName: "person-a", sentAt: 1_790_000_100, text: "", file: { name: "901.png", bytes: 68, type: "image/png" } }],
  hasMore: false,
  before: 0,
  total: 1
};

interface RoomSetUp {
  // Whether the room wears a picture of its own, which the room information's head opens whole.
  pictured?: boolean;
  // What the media tab is answered in place of its usual page.
  media?: RoomHoldingPage[];
  // What the room's chat services and supervisors are answered: the providers, the room's names as they now stand, the
  // supervisors standing by their own accounts, the ones it may still name, the whole lists each write of the names
  // was asked with and each switch turned.
  services?: {
    providers: RoomProvidersView;
    supervisors?: string[];
    byAccount?: RoomSupervisorStanding[];
    labels?: Record<string, string>;
    candidates?: { name: string; label: string }[];
    writes?: string[][];
    turned?: { name: string; on: boolean }[];
    off?: string[];
  };
}

// The room open at a width, every tab's read answered here, and the number of the room's newest message.
async function roomOpen(width: number, height: number, phone: boolean, setUp: RoomSetUp = {}): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser!.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, serviceWorkers: "block", reducedMotion: "reduce", locale: "ko-KR" });
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

  const page = await context.newPage();
  let answered: Record<RoomHolding, RoomHoldingPage[]> | null = null;

  await page.route(`**/api/rooms/${RECORD_CHAT}/members`, (route) => route.fulfill({ json: MEMBERS }));
  if (setUp.services) {
    const services = setUp.services;

    services.supervisors ??= [];
    services.byAccount ??= [];
    services.labels ??= {};
    services.candidates ??= SUPERVISOR_CANDIDATES;
    services.writes ??= [];
    services.turned ??= [];
    services.off ??= [];

    // The supervisors standing in the room as the receiver would answer them: the named ones in the owner's account,
    // then the ones by their own accounts, each on unless turned off.
    const standing = (): RoomSupervisorStanding[] => [
      ...services.supervisors!.map((name) => ({
        name,
        label: services.labels![name] ?? name,
        named: true,
        byAccount: false,
        on: !services.off!.includes(name),
        voice: "owner-account" as const
      })),
      ...services.byAccount!.map((one) => ({ ...one, on: !services.off!.includes(one.name) }))
    ];

    await page.route(`**/api/rooms/${RECORD_CHAT}/providers`, (route) => route.fulfill({ json: services.providers }));
    await page.route(`**/api/rooms/${RECORD_CHAT}/supervisors`, async (route) => {
      if (route.request().method() === "PUT") {
        const names = (route.request().postDataJSON() as { supervisors: string[] }).supervisors;

        services.writes!.push(names);
        services.supervisors = [...names].sort();
      }

      const held = standing();
      const candidates = services.candidates!.filter((one) => !held.some((stood) => stood.name === one.name));

      await route.fulfill({ json: { supervisors: services.supervisors, candidates, standing: held } });
    });
    await page.route(`**/api/rooms/${RECORD_CHAT}/supervisors/*/answering`, async (route) => {
      const name = decodeURIComponent(new URL(route.request().url()).pathname.split("/").at(-2) ?? "");
      const on = (route.request().postDataJSON() as { on: boolean }).on;

      services.turned!.push({ name, on });
      services.off = on ? services.off!.filter((one) => one !== name) : [...services.off!, name];
      await route.fulfill({ json: { name, on } });
    });
  }
  await page.route("**/api/images/**", (route) => route.fulfill({ contentType: "image/png", body: PIXEL }));
  await page.route(`**/api/rooms/${RECORD_CHAT}/pictures?*`, (route) => route.fulfill({ json: PICTURES }));
  if (setUp.pictured) {
    await page.route("**/api/avatars", (route) => route.fulfill({ json: [{ kind: "room", id: RECORD_CHAT, url: "/api/images/room-face.png" }] }));
  }
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
  if (setUp.media) answered.media = setUp.media;

  return { page, close: () => context.close() };
}

const TABS = ["members", "media", "files", "links", "music", "voice", "situation", "session"] as const;

// A provider the pack holds no name for, called by the pack's word for a messenger with its key.
const PROVIDER_A = { key: "provider-a", label: wording("room.label.road_other", { key: "provider-a" }) };
const RECORD = { key: "record", label: wording("room.label.road_record") };

// The supervisors the room may be told to call: every one the deployment registers less the agents already standing
// in it. A name the room carries outside them, `person-b`, stands among the choices by its own name alone.
const SUPERVISOR_CANDIDATES = [
  { name: "agent-a", label: "Agent A" },
  { name: "agent-b", label: "Agent B" }
];

describe.skipIf(!origin || !touchReady())("the room information", () => {
  for (const [width, height, phone] of [[1280, 900, false], [360, 780, true]] as const) {
    test(`opens from the room's name with its tabs on one row, and the room's menu holds none of them, ${width}px wide`, async () => {
      const { page, close } = await roomOpen(width, height, phone);

      try {
        await page.locator("[data-room-menu]").click();
        await page.getByRole("menu").waitFor({ timeout: 10_000 });

        const entries = await page.getByRole("menuitem").allInnerTexts();

        for (const name of ["members", "situation", "session"] as const) {
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

    test(`closes at once, and asks before closing only while a picked room picture waits, ${width}px wide`, async () => {
      const { page, close } = await roomOpen(width, height, phone);

      try {
        await openRoomInfo(page, wording("room_info.label.media"));
        await page.keyboard.press("Escape");
        await roomInfo(page).waitFor({ state: "detached", timeout: 10_000 });

        const question = page.getByRole("alertdialog").or(page.getByRole("dialog", { name: wording("common.title.discard_changes") }));

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

    test(`stands the room's chat services as labels in its head and keeps no tab of them, ${width}px wide`, async () => {
      const { page, close } = await roomOpen(width, height, phone, { services: { providers: { on: [PROVIDER_A, RECORD], avatarOffered: false } } });

      try {
        const sheet = await openRoomInfo(page, wording("room_info.label.members"));
        const labels = sheet.locator("[data-room-road-label]");

        await until(async () => await labels.count(), (count) => count === 2);
        expect(await labels.allInnerTexts()).toEqual([PROVIDER_A.label, RECORD.label]);
        expect(await sheet.getByRole("tab", { name: PROVIDER_A.label }).count()).toBe(0);
        expect(await sheet.locator("[data-room-providers], [data-room-mode]").count()).toBe(0);
      } finally {
        await close();
      }
    }, 90_000);

    test(`lists the room's supervisors at the head of the members tab, turns one off, takes a named one out and names another, ${width}px wide`, async () => {
      const services: NonNullable<RoomSetUp["services"]> = {
        providers: { on: [PROVIDER_A], avatarOffered: false },
        supervisors: ["agent-a"],
        labels: { "agent-a": "Agent A", "agent-b": "Agent B" },
        byAccount: [{ name: "agent-c", label: "Agent C", named: false, byAccount: true, on: true, voice: "own-account" }]
      };
      const { page, close } = await roomOpen(width, height, phone, { services });

      try {
        const sheet = await openRoomInfo(page, wording("room_info.label.members"));
        const section = sheet.locator("[data-room-supervisors]");
        const named = section.locator('[data-room-supervisor="agent-a"]');
        const byAccount = section.locator('[data-room-supervisor="agent-c"]');

        await named.waitFor({ timeout: 10_000 });

        // Each row says the account it answers in, and the one its own account called in says how it leaves.
        expect(await named.locator("[data-room-supervisor-voice]").innerText()).toBe(wording("room.label.answers_by_owner"));
        expect(await byAccount.locator("[data-room-supervisor-voice]").innerText()).toBe(wording("room.label.answers_by_bot"));
        await byAccount.getByText(wording("room.message.supervisor_by_account"), { exact: true }).waitFor({ timeout: 10_000 });
        expect(await byAccount.locator("[data-room-supervisor-remove]").count()).toBe(0);
        await section.getByText(wording("room.message.supervisors_room_rule"), { exact: true }).waitFor({ timeout: 10_000 });

        // Its switch turns the supervisor off where it stands, as the receiver answers.
        const switching = byAccount.getByRole("switch", { name: wording("room.aria.supervisor_answering", { name: "Agent C" }) });

        expect(await standsOnTop(switching)).toBe(true);
        await switching.click();
        await until(async () => await switching.getAttribute("aria-checked"), (checked) => checked === "false");
        expect(services.turned).toEqual([{ name: "agent-c", on: false }]);

        // The remove button writes the names without it; the add select writes them with the one chosen.
        await named.locator("[data-room-supervisor-remove]").click();
        await named.waitFor({ state: "detached", timeout: 10_000 });
        expect(services.writes).toEqual([[]]);

        await section.locator("[data-room-supervisor-add]").click();
        await page.getByRole("option").filter({ hasText: "Agent B" }).click();
        await section.locator('[data-room-supervisor="agent-b"]').waitFor({ timeout: 10_000 });
        expect(services.writes!.at(-1)).toEqual(["agent-b"]);
      } finally {
        await close();
      }
    }, 90_000);

    // What opens over the view stands over it, and back or Esc closes it alone (docs/web.md, 「Floating things」).
    test(`stands a picture and a video opened from the media tab over the view, back and Esc closing them alone, ${width}px wide`, async () => {
      const { page, close } = await roomOpen(width, height, phone, { media: WITH_VIDEO });

      try {
        const sheet = await openRoomInfo(page, wording("room_info.label.media"));
        const picture = sheet.locator("[data-room-holding=media] [data-held=picture] button");
        const viewer = page.getByRole("dialog").filter({ has: page.locator("[data-image-stage]") });

        await picture.waitFor({ timeout: 10_000 });

        for (const leave of ["back", "Escape"] as const) {
          await picture.click();
          await viewer.waitFor({ timeout: 10_000 });
          expect({ leave, top: await standsOnTop(viewer) }).toEqual({ leave, top: true });

          if (leave === "back") await page.goBack();
          else await page.keyboard.press("Escape");
          await viewer.waitFor({ state: "detached", timeout: 10_000 });
          expect({ leave, sheet: await standsOnTop(sheet), focus: await holdsFocus(picture) }).toEqual({ leave, sheet: true, focus: true });
        }

        const player = page.getByRole("dialog", { name: "clip.mp4" });
        const address = page.url();

        await sheet.locator("[data-room-holding=media] [data-held=video] [data-video-still]").click();
        await player.waitFor({ timeout: 10_000 });
        expect(await standsOnTop(player)).toBe(true);
        await page.goBack();
        await player.waitFor({ state: "detached", timeout: 10_000 });
        expect(await standsOnTop(sheet)).toBe(true);

        // What opened and closed left the history as it was: the next back closes the view, and the room stays.
        await page.goBack();
        await roomInfo(page).waitFor({ state: "detached", timeout: 10_000 });
        expect(page.url()).toBe(address);
      } finally {
        await close();
      }
    }, 90_000);

    test(`stands the room's picture and its setting over the view, after a return to the room and across the narrow width, ${width}px wide`, async () => {
      const { page, close } = await roomOpen(width, height, phone, { pictured: true });

      try {
        // Back in the room from another screen, the room's screen is set up again after the console's own.
        await page.locator("[data-room-name]").waitFor({ timeout: 10_000 });
        await goInApp(page, "/");
        await page.locator("[data-room-name]").waitFor({ state: "detached", timeout: 10_000 });
        await goInApp(page, `/rooms/${RECORD_CHAT}`);
        await page.locator("[data-message-id]").last().waitFor({ timeout: 30_000 });

        const sheet = await openRoomInfo(page);
        const face = page.getByRole("dialog").filter({ has: page.locator("[data-image-stage]") });

        await sheet.locator("[data-room-info-picture]").click();
        await face.waitFor({ timeout: 10_000 });
        expect(await standsOnTop(face)).toBe(true);
        await page.goBack();
        await face.waitFor({ state: "detached", timeout: 10_000 });
        expect(await standsOnTop(sheet)).toBe(true);

        // Across the narrow width the view is set up again, as the other of a side sheet and a drawer.
        await page.setViewportSize(width < 600 ? { width: 1280, height: 900 } : { width: 360, height: 780 });
        await sheet.locator("[data-room-info-set-picture]").click();

        const setting = page.getByRole("dialog").filter({ has: page.locator("[data-picture-setting='room']") });

        await setting.waitFor({ timeout: 10_000 });
        expect(await standsOnTop(setting)).toBe(true);
        await page.keyboard.press("Escape");
        await setting.waitFor({ state: "detached", timeout: 10_000 });
        expect(await standsOnTop(sheet)).toBe(true);
        expect(await holdsFocus(page.locator("[data-room-info-set-picture]"))).toBe(true);
      } finally {
        await close();
      }
    }, 90_000);

    test(`stands the search its shortcut opens over the view, opened before and after a return to the room, ${width}px wide`, async () => {
      const { page, close } = await roomOpen(width, height, phone);

      try {
        const search = page.getByRole("dialog", { name: wording("screens.label.search") });

        // The search draws its dialog once it is first opened, and keeps it set up from then on.
        await page.locator("[data-room-name]").waitFor({ timeout: 10_000 });
        await page.keyboard.press("ControlOrMeta+k");
        await search.waitFor({ timeout: 10_000 });
        await page.keyboard.press("Escape");
        await search.waitFor({ state: "detached", timeout: 10_000 });
        await goInApp(page, "/");
        await page.locator("[data-room-name]").waitFor({ state: "detached", timeout: 10_000 });
        await goInApp(page, `/rooms/${RECORD_CHAT}`);
        await page.locator("[data-message-id]").last().waitFor({ timeout: 30_000 });

        const sheet = await openRoomInfo(page);

        // The focus goes back to what held it before the shortcut.
        await page.evaluate(() => document.activeElement?.setAttribute("data-held-focus", ""));
        await page.keyboard.press("ControlOrMeta+k");
        await search.waitFor({ timeout: 10_000 });
        expect(await standsOnTop(search)).toBe(true);
        await page.goBack();
        await search.waitFor({ state: "detached", timeout: 10_000 });
        expect(await standsOnTop(sheet)).toBe(true);
        expect(await holdsFocus(page.locator("[data-held-focus]"))).toBe(true);
      } finally {
        await close();
      }
    }, 90_000);
  }
});
