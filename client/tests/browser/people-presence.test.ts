import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { ACCOUNT_PRESENCE_EVENT } from "../../apps/web/shared/types";
import { wording } from "../../apps/web/shared/wording";
import { openRoomInfo } from "./room-info";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, BrowserContext, Page } from "playwright-core";
import type { PersonView } from "../../apps/web/shared/people";
import type { RoomMembersView } from "../../apps/web/shared/types";

// A person's presence outside a shared room (docs/web.md, 「Presence and typing」): the receiver's stand-in of
// tests/support/browser-console.ts tells three people online in a room the reader does not stand in, one of the
// reader's company, one of it who turned their presence off, and one of another company, and the real stream hands the
// reader their presence by account. The person's page, the room's members sheet and the let-in picker draw the first
// alone. The members are served through the page's own route, since the harness's receiver serves none; the people,
// the stream and the presence are the console's own. The suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "people-presence", password: "fixture-password-3293" };
const RECORD_CHAT = -9_000_000_000_099;
const NAMES = { here: "presence-here", hidden: "presence-hidden", other: "presence-other" } as const;

type Who = keyof typeof NAMES;

let browser: Browser | null = null;
let cookie = "";
const ids = {} as Record<Who, string>;

beforeAll(async () => {
  if (!origin || !touchReady()) return;

  const login = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ACCOUNT) });

  expect(login.ok).toBe(true);
  cookie = login.headers.get("set-cookie")!.split(";")[0]!;

  for (const who of Object.keys(NAMES) as Who[]) {
    const found = (await (await fetch(`${origin}/api/people/search?q=${NAMES[who]}`, { headers: { cookie } })).json()) as PersonView[];

    ids[who] = found.find((person) => person.name === NAMES[who])!.user;
  }

  browser = await chromium.launch();
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();
}, BROWSER_HOOK_MS);

async function context(members: RoomMembersView): Promise<BrowserContext> {
  const opened = await browser!.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block", reducedMotion: "reduce" });
  const at = cookie.indexOf("=");

  await opened.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
  await opened.route(`**/api/rooms/${RECORD_CHAT}/members`, (route) => route.fulfill({ json: members }));

  return opened;
}

// The room's members sheet opened from the room's menu.
async function sheet(page: Page): Promise<void> {
  await page.goto(`${origin}/rooms/${RECORD_CHAT}`, { waitUntil: "load" });
  await page.locator("[data-message]").first().waitFor({ timeout: 30_000 });
  await openRoomInfo(page);
}

describe.skipIf(!origin || !touchReady())("a person's presence outside a shared room", () => {
  test("the stream hands the reader's company's person by account, the hidden one as unknown, and nobody of another company", async () => {
    const aborted = new AbortController();
    const reply = await fetch(`${origin}/api/events`, { headers: { cookie }, signal: aborted.signal });
    const reader = reply.body!.getReader();
    const decoder = new TextDecoder();
    const handed: { account: number; state: string | null; lastSeenAt: number | null }[] = [];
    let held = "";

    // The fixture's own person is told last, so once their presence is handed the others' have been too.
    while (!handed.some((one) => one.account === Number(ids.here))) {
      const { value, done } = await reader.read();

      if (done) break;

      held += decoder.decode(value, { stream: true });

      for (let end = held.indexOf("\n\n"); end !== -1; end = held.indexOf("\n\n")) {
        const frame = held.slice(0, end);

        held = held.slice(end + 2);

        if (frame.includes(`event: ${ACCOUNT_PRESENCE_EVENT}`)) handed.push(JSON.parse(/^data: (.*)$/m.exec(frame)![1]!) as (typeof handed)[number]);
      }
    }

    aborted.abort();

    expect(handed.find((one) => one.account === Number(ids.here))?.state).toBe("online");
    expect(handed.find((one) => one.account === Number(ids.hidden))).toEqual({ account: Number(ids.hidden), state: null, lastSeenAt: null });
    expect(handed.some((one) => one.account === Number(ids.other))).toBe(false);
  }, BROWSER_HOOK_MS);

  test("a person's page carries the presence of the reader's company's person alone", async () => {
    const opened = await context({ members: [], chatMembers: "listed", entry: { letIn: false, takeOut: false, messenger: false, leaves: true }, mayGrant: false });

    try {
      const page = await opened.newPage();
      const badge = page.locator("[data-person-presence]");

      await page.goto(`${origin}/people/${ids.here}`, { waitUntil: "load" });
      await badge.waitFor({ timeout: 30_000 });
      expect((await badge.textContent())?.trim()).toBe(wording("room.label.presence_online"));

      // Moved to within the same tab, so the stream that handed the first person's presence stands.
      for (const who of ["hidden", "other"] as const) {
        await page.evaluate((to) => {
          const root: (Element & { __vue_app__?: { config: { globalProperties: { $router: { push: (to: string) => Promise<unknown> } } } } }) | null = document.querySelector("#__nuxt");

          void root!.__vue_app__!.config.globalProperties.$router.push(to);
        }, `/people/${ids[who]}`);
        await page.getByText(NAMES[who], { exact: true }).first().waitFor();
        expect(await badge.count()).toBe(0);
      }
    } finally {
      await opened.close();
    }
  }, BROWSER_HOOK_MS);

  test("the members sheet draws the dot and the words on the reader's company's person alone", async () => {
    const member = (who: Who) => ({ person: null, name: NAMES[who], status: null, account: ids[who], inConsole: true, grants: null });
    const opened = await context({ members: [member("here"), member("hidden"), member("other")], chatMembers: "listed", entry: { letIn: false, takeOut: false, messenger: false, leaves: true }, mayGrant: false });

    try {
      const page = await opened.newPage();
      const row = (who: Who) => page.locator(`[data-console-user="${ids[who]}"]`);

      await sheet(page);
      await row("here").locator("[data-member-presence]").waitFor({ timeout: 30_000 });
      expect((await row("here").locator("[data-member-presence]").textContent())?.trim()).toBe(wording("room.label.presence_online"));
      expect(await row("here").locator(".bg-success").count()).toBe(1);

      for (const who of ["hidden", "other"] as const) {
        expect(await row(who).locator("[data-member-presence]").count()).toBe(0);
        expect(await row(who).locator(".bg-success, .bg-warning").count()).toBe(0);
      }
    } finally {
      await opened.close();
    }
  }, BROWSER_HOOK_MS);

  test("the let-in picker draws the dot and the words on the reader's company's person alone", async () => {
    const opened = await context({ members: [], chatMembers: "listed", entry: { letIn: true, takeOut: false, messenger: false, leaves: true }, mayGrant: false });

    try {
      const page = await opened.newPage();
      const option = (who: Who) => page.getByRole("option").filter({ hasText: NAMES[who] });

      await sheet(page);
      await page.locator("[data-room-let-in]").click();
      // The field is typed in once the dialog stands, as its opening moves the focus into it.
      await page.getByRole("dialog", { name: wording("members.title.let_in") }).waitFor({ timeout: 10_000 });
      await page.getByLabel(wording("members.label.choice")).first().click();
      await page.keyboard.type("presence-");
      await option("other").waitFor({ timeout: 30_000 });
      await option("here").filter({ hasText: wording("room.label.presence_online") }).waitFor({ timeout: 30_000 });

      expect(await option("here").locator(".bg-success").count()).toBe(1);

      for (const who of ["hidden", "other"] as const) {
        expect(await option(who).textContent()).not.toContain(wording("room.label.presence_online"));
        expect(await option(who).locator(".bg-success, .bg-warning").count()).toBe(0);
      }
    } finally {
      await opened.close();
    }
  }, BROWSER_HOOK_MS);
});
