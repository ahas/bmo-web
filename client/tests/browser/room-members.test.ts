import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { openRoomInfo, roomInfo } from "./room-info";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, Locator, Page } from "playwright-core";
import type { RoomGrants, RoomMembersView } from "../../apps/web/shared/types";

// A room's members (docs/web.md, the room screen's members entry), in the room the console made on the record road
// that the harness's receiver stands. The members are served through the page's own route, since the harness's
// receiver serves none: the menu opens the sheet, a member known as an account carries the console user's mark and
// leads to their page, one who is not stands alone, a long name is cut inside its row, Back closes the sheet, a room
// with no members at all says so with why its chat service gave none, and a refused read stands in the sheet's error
// band with no list. Beside them stand a member's rights in the room: their switch under the member's row for a reader
// the receiver would take a writing from, nowhere for one it would not, the write going as it is pressed, the row
// standing afterwards as what was kept, and a refusal putting the switch back with the pack's sentence under the list.
// It drives the console tests/support/browser-console.ts
// stands up; the suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "room-members", password: "fixture-password-2995" };
const RECORD_CHAT = -9_000_000_000_099;
const LONG = "member-c-with-a-name-far-longer-than-any-row-of-the-room-information-is-wide-at-any-width-it-opens-at-on-any-screen-at-all";

// As the console's members route answers: the members, none let in in the console, and a reader who may let nobody in,
// so no row carries more than the line it names.
const MEMBERS = {
  members: [
    { person: 9_000_000_000_101, name: "member-a", status: "status-a", account: "7", inConsole: false, grants: null },
    { person: 9_000_000_000_102, name: "member-b", status: null, account: null, inConsole: false, grants: null },
    { person: null, name: LONG, status: "status-c", account: null, inConsole: false, grants: null }
  ],
  chatMembers: "listed",
  entry: { letIn: false, takeOut: false },
  mayGrant: false
} satisfies RoomMembersView;

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

// The room open at a width, its members answered as `served` says, and the room information opened from the room's
// name on its members tab.
// A signed-in browser at one size, its page clean of any earlier run's stand-ins.
async function opened(width: number, height: number, phone: boolean): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser!.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, serviceWorkers: "block", reducedMotion: "reduce" });
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

  return { page: await context.newPage(), close: () => context.close() };
}

// Where `served` names a hold, the answer waits for it, so what stands while the read runs can be measured.
async function sheetOpen(width: number, height: number, phone: boolean, served: { status: number; body: unknown; held?: Promise<void> }): Promise<{ page: Page; close: () => Promise<void> }> {
  const { page, close } = await opened(width, height, phone);

  await page.route(`**/api/rooms/${RECORD_CHAT}/members`, async (route) => {
    await served.held;
    await route.fulfill({ status: served.status, contentType: "application/json", body: JSON.stringify(served.body) });
  });
  await page.goto(`${origin}/rooms/${RECORD_CHAT}`, { waitUntil: "load" });
  await page.locator("[data-message]").first().waitFor({ timeout: 30_000 });
  await openRoomInfo(page);

  return { page, close };
}

// What the rows the receiver keeps are stood in by: the members read answers from this, and every write the page makes
// changes it, so what a row goes on showing is what was kept.
interface KeptMember {
  account: string;
  name: string;
  grants: RoomGrants;
}

const keptMembers = (): KeptMember[] => [
  { account: "7", name: "member-a", grants: { letIn: false, takeOut: true } },
  { account: "12", name: "member-b", grants: { letIn: false, takeOut: false } }
];

// The members tab open for a reader the receiver would take a writing from, its routes stood in for the receiver's
// rows: the members read answers from `kept`, and a write puts one member's right down or up. Where `refused` stands,
// the console's route refuses the way a refusal from the receiver is said, keeping what it kept.
async function rightsSheet(width: number, height: number, phone: boolean, kept: KeptMember[], refused = false): Promise<{ page: Page; close: () => Promise<void>; writes: string[] }> {
  const { page, close } = await opened(width, height, phone);
  const writes: string[] = [];

  await page.route(`**/api/rooms/${RECORD_CHAT}/members`, (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        members: kept.map((one) => ({ person: null, name: one.name, status: null, account: one.account, inConsole: true, grants: one.grants })),
        chatMembers: "listed",
        entry: { letIn: true, takeOut: true },
        mayGrant: true
      } satisfies RoomMembersView)
    });
  });
  await page.route(`**/api/rooms/${RECORD_CHAT}/accounts/*/grants*`, (route) => {
    const request = route.request();
    const account = request.url().match(/\/accounts\/(\d+)\/grants/)?.[1] ?? "";
    const held = kept.find((one) => one.account === account);
    const right = request.method() === "PUT" ? String((JSON.parse(request.postData() ?? "{}") as { right?: unknown }).right ?? "") : new URL(request.url()).searchParams.get("right") ?? "";
    const on = request.method() === "PUT";

    writes.push(`${request.method()} ${account} ${right}`);

    if (refused || held === undefined || (right !== "let-in" && right !== "take-out")) {
      route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ statusCode: 403, message: wording("members.error.grant_forbidden") }) });
      return;
    }

    if (right === "let-in") held.grants = { ...held.grants, letIn: on };
    else held.grants = { ...held.grants, takeOut: on };

    route.fulfill(on ? { status: 200, contentType: "application/json", body: JSON.stringify(held.grants) } : { status: 204 });
  });

  await page.goto(`${origin}/rooms/${RECORD_CHAT}`, { waitUntil: "load" });
  await page.locator("[data-message]").first().waitFor({ timeout: 30_000 });
  await openRoomInfo(page);

  return { page, close, writes };
}

// One member's right as the tab stands it: its switch, named for that member, and whether it is on.
function rightSwitch(line: Locator, key: "let-in" | "take-out", name: string): Locator {
  const label = key === "let-in" ? "members.aria.right_let_in" : "members.aria.right_take_out";

  return line.getByRole("switch", { name: wording(label, { name }) });
}

async function checked(line: Locator, key: "let-in" | "take-out", name: string): Promise<boolean> {
  return (await rightSwitch(line, key, name).getAttribute("aria-checked")) === "true";
}

describe.skipIf(!origin || !touchReady())("a room's members", () => {
  for (const [width, height, phone] of [[1280, 900, false], [360, 780, true]] as const) {
    test(`stand with the console user's mark on a known account alone, ${width}px wide`, async () => {
      const { page, close } = await sheetOpen(width, height, phone, { status: 200, body: MEMBERS });

      try {
        const rows = page.locator("[data-room-members] > li");

        await rows.first().waitFor({ timeout: 10_000 });
        expect(await rows.count()).toBe(3);

        // The known account carries the mark and leads to their page; the others carry neither.
        const marked = page.locator("[data-console-user]");

        expect(await marked.count()).toBe(1);
        expect(await marked.getAttribute("href")).toEndWith("/people/7");
        expect((await marked.innerText()).replace(/\s+/g, " ")).toContain(wording("members.label.console_user"));
        expect(await page.getByText(wording("members.label.console_user"), { exact: true }).count()).toBe(1);
        // A reader the receiver would take no writing from sees the list with no rights at all.
        expect(await page.locator("[data-member-rights]").count()).toBe(0);
        expect(await page.locator("[data-room-members] a").count()).toBe(1);
        expect(await page.locator("[data-member-status]").allInnerTexts()).toEqual(["status-a", "status-c"]);

        // A long name is cut inside its row, and no row runs past the sheet.
        const cut = await page.getByText(LONG, { exact: true }).evaluate((line) => ({ cut: line.scrollWidth > line.clientWidth, right: line.getBoundingClientRect().right }));
        const sheet = await roomInfo(page).boundingBox();

        expect(cut.cut).toBe(true);
        expect(cut.right).toBeLessThanOrEqual(sheet!.x + sheet!.width);

        // A side sheet against the right edge on a wide screen, a drawer up from the bottom edge on a narrow one.
        if (phone) {
          // The drawer slides in whatever motion the reader asked for, so it is measured once it has come to rest.
          await page.waitForFunction(() => {
            const drawer = document.querySelector("[role=dialog]")?.getBoundingClientRect();

            return drawer !== undefined && Math.round(drawer.bottom) === window.innerHeight && drawer.top > 0;
          }, undefined, { timeout: 10_000 });
        } else {
          expect(Math.round(sheet!.x + sheet!.width)).toBe(width);
          expect(sheet!.x).toBeGreaterThan(0);
        }

        if (!phone) {
          // The marked row answers a pointer with a background its rest does not have.
          const resting = await marked.evaluate((row) => getComputedStyle(row).backgroundColor);

          await marked.hover();
          await page.waitForFunction((rest) => getComputedStyle(document.querySelector("[data-console-user]")!).backgroundColor !== rest, resting, { timeout: 5_000 });
        }

        // Back closes the sheet and leaves the room where it stood.
        await page.goBack();
        await roomInfo(page).waitFor({ state: "detached", timeout: 10_000 });
        expect(new URL(page.url()).pathname).toEndWith(`/rooms/${RECORD_CHAT}`);
      } finally {
        await close();
      }
    }, 90_000);
  }

  test("while the first read runs, stand one row's place, the members landing in its stead", async () => {
    let release = () => {};
    const held = new Promise<void>((done) => { release = done; });
    const { page, close } = await sheetOpen(1280, 900, false, { status: 200, body: MEMBERS, held });

    try {
      const sheet = roomInfo(page);
      const waiting = sheet.getByRole("status", { name: wording("members.status.loading") });

      await waiting.waitFor({ timeout: 10_000 });
      expect(await waiting.evaluate((status) => status.querySelector(":scope > div:last-child")!.children.length)).toBe(1);

      release();
      await page.locator("[data-room-members] > li").first().waitFor({ timeout: 10_000 });
      expect(await waiting.count()).toBe(0);
    } finally {
      release();
      await close();
    }
  }, 90_000);

  test("with no members of a room no chat service carries, say there are none and why, and stand no list", async () => {
    const none = { members: [], chatMembers: "no-service", entry: { letIn: false, takeOut: false }, mayGrant: false } satisfies RoomMembersView;
    const { page, close } = await sheetOpen(360, 780, true, { status: 200, body: none });

    try {
      const empty = page.locator("[data-room-members-none]");

      await empty.waitFor({ timeout: 10_000 });
      expect(await empty.locator("p").allInnerTexts()).toEqual([wording("members.label.none"), wording("members.label.no_service")]);
      expect(await page.locator("[data-room-members]").count()).toBe(0);
      expect(await page.getByRole("alert").count()).toBe(0);
    } finally {
      await close();
    }
  }, 90_000);

  test("refused, say the refusal in the sheet's error band and stand no list", async () => {
    const said = wording("members.error.unheld");
    const { page, close } = await sheetOpen(1280, 900, false, { status: 409, body: { statusCode: 409, message: said } });

    try {
      await page.getByRole("alert").filter({ hasText: said }).waitFor({ timeout: 10_000 });
      expect(await page.locator("[data-room-members]").count()).toBe(0);
      expect(await page.getByRole("button", { name: wording("common.action.refresh") }).count()).toBeGreaterThan(0);
    } finally {
      await close();
    }
  }, 90_000);

  for (const [width, height, phone] of [[1280, 900, false], [360, 780, true]] as const) {
    test(`stand each member's rights under their row for a reader who may hand them out, and stand again as they were written, ${width}px wide`, async () => {
      const kept = keptMembers();
      const { page, close, writes } = await rightsSheet(width, height, phone, kept);

      try {
        const lines = page.locator("[data-member-rights]");

        await lines.first().waitFor({ timeout: 10_000 });
        // One line under each member the console knows as an account, on the member's own column, naming the rights it
        // holds and the word for them.
        expect(await lines.count()).toBe(2);
        expect(await lines.first().innerText()).toContain(wording("members.label.rights"));
        expect(await lines.nth(1).getByRole("switch").count()).toBe(2);

        // The line stands under the member's own words: its first word begins where their name begins, and its last
        // control stays inside the sheet.
        const name = await page.getByText("member-a", { exact: true }).boundingBox();
        const words = lines.first().locator("> span");
        const first = await words.first().boundingBox();
        const last = await words.last().boundingBox();
        const sheet = await roomInfo(page).boundingBox();

        expect(Math.round(first!.x)).toBe(Math.round(name!.x));
        expect(Math.round(last!.x + last!.width)).toBeLessThanOrEqual(Math.round(sheet!.x + sheet!.width));

        const member = lines.first();

        expect(await checked(member, "let-in", "member-a")).toBe(false);
        expect(await checked(member, "take-out", "member-a")).toBe(true);

        // Letting people in handed to the member: the write names the right, and the switch stands on.
        await rightSwitch(member, "let-in", "member-a").click();
        await page.waitForFunction(() => document.querySelectorAll("[data-member-right='let-in'] [role=switch]")[0]?.getAttribute("aria-checked") === "true", undefined, { timeout: 10_000 });
        expect(writes).toEqual(["PUT 7 let-in"]);
        expect(kept[0]!.grants).toEqual({ letIn: true, takeOut: true });

        // And taken back again: the member's row goes on standing with the other right it held.
        await rightSwitch(member, "take-out", "member-a").click();
        await page.waitForFunction(() => document.querySelectorAll("[data-member-right='take-out'] [role=switch]")[0]?.getAttribute("aria-checked") === "false", undefined, { timeout: 10_000 });
        expect(writes).toEqual(["PUT 7 let-in", "DELETE 7 take-out"]);
        expect(kept[0]!.grants).toEqual({ letIn: true, takeOut: false });

        // The sheet read again: the member holds what was written, and the other member holds what they held.
        await page.goBack();
        await roomInfo(page).waitFor({ state: "detached", timeout: 10_000 });
        await openRoomInfo(page);
        const again = page.locator("[data-member-rights]");

        await again.first().waitFor({ timeout: 10_000 });
        expect(await checked(again.first(), "let-in", "member-a")).toBe(true);
        expect(await checked(again.first(), "take-out", "member-a")).toBe(false);
        expect(await checked(again.nth(1), "let-in", "member-b")).toBe(false);
        expect(await checked(again.nth(1), "take-out", "member-b")).toBe(false);
      } finally {
        await close();
      }
    }, 90_000);
  }

  test("write refused, put the switch back, say the refusal under the list and keep the member's rights as they stood", async () => {
    const kept = keptMembers();
    const { page, close } = await rightsSheet(1280, 900, false, kept, true);

    try {
      const member = page.locator("[data-member-rights]").first();

      await member.waitFor({ timeout: 10_000 });
      await rightSwitch(member, "let-in", "member-a").click();

      const said = wording("members.error.grant_forbidden");

      await page.getByRole("alert").filter({ hasText: said }).first().waitFor({ timeout: 10_000 });
      expect(await checked(member, "let-in", "member-a")).toBe(false);
      expect(kept[0]!.grants).toEqual({ letIn: false, takeOut: true });
    } finally {
      await close();
    }
  }, 90_000);
});
