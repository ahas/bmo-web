import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { openRoomInfo } from "./room-info";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, Page } from "playwright-core";
import type { AgentFace, AvatarRef, RoomMembersView } from "../../apps/web/shared/types";

// An agent's private room stands as its agent (docs/web.md, 「An agent's private room stands as its agent」): a person's
// own BMO's private room, which the receiver titles by the person and whose BMO the agency labels with the person's
// name, stands for that person in the sidebar, the room's bar and the room information's head under the name the BMO's
// profile stands with, its letter that name's where a member's sidebar draws every room as its letter, and never wears
// the room's own picture; the person stands among its members alone. The owner's own private chat stands as the chat agent with its face in the bar, the sidebar and
// the room information's head, and neither room carries the room picture's button. Each is read at a desk's width and
// a phone's. The faces are served through the page's own routes, since the harness's receiver keeps no pictures; it
// drives the console tests/support/browser-console.ts stands up, and the suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ADMINISTRATOR = { name: "agent-room", password: "fixture-password-3961" };
const PERSON = { name: "agent-room-person", password: "fixture-password-3962" };
// The owner's private chat, answered by the chat agent `agent-a`, and the person's own BMO's private room, which the
// receiver titles by the person, the agency labels `agent-room-person Dear` and the BMO's profile names `Dear`.
const OWNER_CHAT = 42;
const OWN_BMO_CHAT = -9_006_000_000_001;
const OWN_BMO_NAME = "Dear";

const AGENT_A_NUMBER = 9_005_000_000_001;
const OWN_BMO_NUMBER = 9_005_000_000_002;
const FACES: AgentFace[] = [
  { name: "agent-a", personId: AGENT_A_NUMBER, rooms: [] },
  { name: "agent-room-bmo", personId: OWN_BMO_NUMBER, rooms: [] }
];
// Each agent's picture under its number, and each room's own picture, which neither room may wear.
const AVATARS: AvatarRef[] = [
  { kind: "person", id: AGENT_A_NUMBER, url: "/api/images/agent-a-face.png" },
  { kind: "person", id: OWN_BMO_NUMBER, url: "/api/images/own-bmo-face.png" },
  { kind: "room", id: OWNER_CHAT, url: "/api/images/owner-room-face.png" },
  { kind: "room", id: OWN_BMO_CHAT, url: "/api/images/own-room-face.png" }
];
const MEMBERS = { members: [{ person: null, name: PERSON.name, status: null, account: null, inConsole: true, grants: null }], chatMembers: "listed", entry: { letIn: false, takeOut: false, messenger: false, leaves: true }, mayGrant: false } satisfies RoomMembersView;

const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const WIDTHS = [
  { width: 1280, height: 900, phone: false },
  { width: 360, height: 780, phone: true }
] as const;

let browser: Browser | null = null;
let administrator = "";
let person = "";

async function signedIn(account: { name: string; password: string }): Promise<string> {
  const login = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(account) });

  expect(login.ok).toBe(true);

  return login.headers.get("set-cookie")!.split(";")[0]!;
}

beforeAll(async () => {
  if (!origin || !touchReady()) return;

  administrator = await signedIn(ADMINISTRATOR);
  person = await signedIn(PERSON);
  browser = await chromium.launch();
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();
}, BROWSER_HOOK_MS);

// A room open at a width for the one a cookie signs in, the faces and the room's people answered here.
async function roomOpen(cookie: string, chat: number, viewport: (typeof WIDTHS)[number]): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser!.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.phone,
    hasTouch: viewport.phone,
    serviceWorkers: "block",
    reducedMotion: "reduce",
    locale: "ko-KR"
  });
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

  const page = await context.newPage();

  await page.route("**/api/agent-faces", (route) => route.fulfill({ json: FACES }));
  await page.route("**/api/avatars", (route) => route.fulfill({ json: AVATARS }));
  await page.route("**/api/images/**", (route) => route.fulfill({ contentType: "image/png", body: PIXEL }));
  await page.route(`**/api/rooms/${OWN_BMO_CHAT}/members`, (route) => route.fulfill({ json: MEMBERS }));
  await page.goto(`${origin}/rooms/${chat}`, { waitUntil: "load" });

  return { page, close: () => context.close() };
}

// The room's name in its bar, once the room list has named it.
async function barName(page: Page, name: string): Promise<string> {
  const bar = page.locator("[data-room-name]");

  await bar.filter({ hasText: name }).waitFor({ timeout: 20_000 });

  return (await bar.innerText()).trim();
}

// The picture the bar's face is drawn from, once the faces have arrived.
async function barFace(page: Page, name: string): Promise<string> {
  const face = page.getByRole("button", { name: wording("room.aria.avatar_enlarge", { name }), exact: true }).locator("img").first();

  await face.waitFor({ timeout: 20_000 });

  return (await face.getAttribute("src")) ?? "";
}

// The picture a room's row in the sidebar wears, once the faces have arrived.
async function rowFace(page: Page, chat: number, name: string): Promise<string> {
  const face = page.locator(`a[href$="/rooms/${chat}"]`).filter({ hasText: name }).first().locator("img").first();

  await face.waitFor({ timeout: 20_000 });

  return (await face.getAttribute("src")) ?? "";
}

// The letter a room's row in the sidebar wears where it stands with no picture.
async function rowLetter(page: Page, chat: number, name: string): Promise<string> {
  const face = page.locator(`a[href$="/rooms/${chat}"]`).filter({ hasText: name }).first().locator('[data-slot="linkLeadingAvatar"]');

  await face.waitFor({ timeout: 20_000 });

  return (await face.innerText()).trim();
}

describe.skipIf(!origin || !touchReady())("an agent's private room", () => {
  for (const viewport of WIDTHS) {
    test(`stands as its agent for its person, the person among its members alone, ${viewport.width}px wide`, async () => {
      const { page, close } = await roomOpen(person, OWN_BMO_CHAT, viewport);

      try {
        expect(await barName(page, OWN_BMO_NAME)).toBe(OWN_BMO_NAME);
        // A member's sidebar draws every room as its letter: here the agent's own name's, never the person's.
        if (!viewport.phone) expect(await rowLetter(page, OWN_BMO_CHAT, OWN_BMO_NAME)).toBe("D");
        expect(await page.locator('img[src*="own-room-face"]').count()).toBe(0);

        const sheet = await openRoomInfo(page);

        await sheet.getByRole("heading").filter({ hasText: OWN_BMO_NAME }).waitFor({ timeout: 10_000 });
        expect(await sheet.getByRole("heading").first().innerText()).not.toContain(PERSON.name);
        expect(await sheet.locator("[data-room-info-set-picture]").count()).toBe(0);
        expect(await sheet.getByRole("tab", { selected: true }).innerText()).toBe(wording("room_info.label.members"));
        await sheet.getByText(PERSON.name, { exact: true }).waitFor({ timeout: 10_000 });
      } finally {
        await close();
      }
    }, 90_000);

    test(`the owner's own stands as the chat agent with its face, and carries no room picture button, ${viewport.width}px wide`, async () => {
      const { page, close } = await roomOpen(administrator, OWNER_CHAT, viewport);

      try {
        expect(await barName(page, "Agent A")).toBe("Agent A");
        expect(await barFace(page, "Agent A")).toContain("/api/images/agent-a-face.png");
        if (!viewport.phone) expect(await rowFace(page, OWNER_CHAT, "Agent A")).toContain("/api/images/agent-a-face.png");
        expect(await page.locator('img[src*="owner-room-face"]').count()).toBe(0);

        const sheet = await openRoomInfo(page);

        await sheet.getByRole("heading").filter({ hasText: "Agent A" }).waitFor({ timeout: 10_000 });
        expect(await sheet.locator("[data-room-info-set-picture]").count()).toBe(0);
      } finally {
        await close();
      }
    }, 90_000);
  }
});
