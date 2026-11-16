import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, Page } from "playwright-core";
import type { RoomMembersView } from "../../apps/web/shared/types";

// A room's members (docs/web.md, the room screen's members entry), in the room the console made on the record road
// that the harness's receiver stands. The members are served through the page's own route, since the harness's
// receiver serves none: the menu opens the sheet, a member known as an account carries the console user's mark and
// leads to their page, one who is not stands alone, a long name is cut inside its row, Back closes the sheet, and a
// refused read stands in the sheet's error band with no list. It drives the console tests/support/browser-console.ts
// stands up; the suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "room-members", password: "fixture-password-2995" };
const RECORD_CHAT = -9_000_000_000_099;
const LONG = "member-c-with-a-name-far-longer-than-any-row-of-the-sheet-is-wide-at-any-width";

// As the console's members route answers: the members, none let in in the console, and a reader who may let nobody in,
// so no row carries more than the line it names.
const MEMBERS = {
  members: [
    { person: 9_000_000_000_101, name: "member-a", status: "status-a", account: "7", inConsole: false },
    { person: 9_000_000_000_102, name: "member-b", status: null, account: null, inConsole: false },
    { person: null, name: LONG, status: "status-c", account: null, inConsole: false }
  ],
  mayLetIn: false
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

// The room open at a width, its members answered as `served` says, and the sheet opened from the room's menu.
// Where `served` names a hold, the answer waits for it, so what stands while the read runs can be measured.
async function sheetOpen(width: number, height: number, phone: boolean, served: { status: number; body: unknown; held?: Promise<void> }): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser!.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, serviceWorkers: "block", reducedMotion: "reduce" });
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

  const page = await context.newPage();

  await page.route(`**/api/rooms/${RECORD_CHAT}/members`, async (route) => {
    await served.held;
    await route.fulfill({ status: served.status, contentType: "application/json", body: JSON.stringify(served.body) });
  });
  await page.goto(`${origin}/rooms/${RECORD_CHAT}`, { waitUntil: "load" });
  await page.locator("[data-message]").first().waitFor({ timeout: 30_000 });
  await page.getByRole("button", { name: wording("common.action.more") }).first().click();
  await page.getByRole("menuitem", { name: wording("room.action.members") }).click();
  await page.getByRole("dialog", { name: wording("members.title.sheet") }).waitFor({ timeout: 10_000 });

  return { page, close: () => context.close() };
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
        expect(await page.locator("[data-room-members] a").count()).toBe(1);
        expect(await page.locator("[data-member-status]").allInnerTexts()).toEqual(["status-a", "status-c"]);

        // A long name is cut inside its row, and no row runs past the sheet.
        const cut = await page.getByText(LONG, { exact: true }).evaluate((line) => ({ cut: line.scrollWidth > line.clientWidth, right: line.getBoundingClientRect().right }));
        const sheet = await page.getByRole("dialog", { name: wording("members.title.sheet") }).boundingBox();

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
        await page.getByRole("dialog", { name: wording("members.title.sheet") }).waitFor({ state: "detached", timeout: 10_000 });
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
      const sheet = page.getByRole("dialog", { name: wording("members.title.sheet") });
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

  test("refused, say the refusal in the sheet's error band and stand no list", async () => {
    const said = wording("members.error.not_served");
    const { page, close } = await sheetOpen(1280, 900, false, { status: 404, body: { statusCode: 404, message: said } });

    try {
      await page.getByRole("alert").filter({ hasText: said }).waitFor({ timeout: 10_000 });
      expect(await page.locator("[data-room-members]").count()).toBe(0);
      expect(await page.getByRole("button", { name: wording("common.action.refresh") }).count()).toBeGreaterThan(0);
    } finally {
      await close();
    }
  }, 90_000);
});
