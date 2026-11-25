import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { carryByMouse, centre } from "./row-carry";
import { BROWSER_HOOK_MS, fingerOn, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";

import type { Browser, Locator, Page, Route } from "playwright-core";

// What a reader is told their Claude logins are called (docs/web.md, 「System and organisation」, the supply tab). The agency numbers
// every login it names one past every login the platform holds, so a person's first login can carry a third number;
// the screen numbers the logins of one account against each other from 01 and names them in the console's own words.
// A reader's own list is read at their node, the platform's at the platform node, and a new sign-in's box is titled by the
// number the name the agency answered gives the login among the reader's own. The identifiers the agency answers with
// are what the rows are keyed by and what every write carries, unchanged. Read at a desk's width and a phone's.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "supply-numbers", password: "fixture-password-4412" };
const SIZES = [[1280, 900, false], [412, 915, true]] as const;
const LOGIN = "sign-in-4412";

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

const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

// The console's own name for the login an account counts as its own nth.
const numbered = (n: string) => wording("supply.label.login_numbered", { number: n });

// A login of the reader's own, as the agency answers it: named by the platform's number, held in its own directory.
function login(id: string, name: string, place: number, over: Record<string, unknown> = {}) {
  return {
    id,
    name,
    place,
    enabled: true,
    credentialKind: "directory",
    credentialPath: `/srv/node/data/env/${name}`,
    login: "standing",
    loginEndsAt: null,
    chosen: false,
    restUntil: null,
    userId: 7,
    ...over
  };
}

// The reader's three logins, walked in one order and numbered by another: their runs go out on claude-03 first,
// then claude-07, then claude-05, so the numbers the screen counts are 01, 03 and 02.
const OWN_LOGINS = [login("acct-3", "claude-03", 1), login("acct-7", "claude-07", 2), login("acct-5", "claude-05", 3)];

async function open(page: Page, path: string): Promise<void> {
  const at = cookie.indexOf("=");

  await page.context().addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
  await page.goto(`${origin}${path}`, { waitUntil: "load" });
}

// Pressed as the reader's hand presses it, once nothing stands over its centre.
async function press(page: Page, target: Locator, phone: boolean): Promise<void> {
  await target.scrollIntoViewIfNeeded();

  const box = (await target.boundingBox())!;
  const centre = [box.x + box.width / 2, box.y + box.height / 2] as const;

  expect(await target.evaluate((element, [x, y]) => element.contains(document.elementFromPoint(x, y)), centre)).toBe(true);

  if (phone) await target.tap();
  else await target.click();
}

// Nothing runs off the side of the screen, however the names are written.
async function fitsTheScreen(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
}

describe.skipIf(!origin || !touchReady())("a reader's own Claude logins, numbered within their own account", () => {
  for (const [width, height, phone] of SIZES) {
    test(`names each of theirs by its own number and never the platform's, at ${width}px`, async () => {
      const context = await browser!.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, locale: "ko-KR", serviceWorkers: "block", reducedMotion: "reduce" });

      try {
        const page = await context.newPage();

        await page.route(/\/api\/supply\/logins$/, (route) => json(route, { active: { provider: "claude-code", account: null, accountName: "", accounts: 3, session: null, week: null }, accounts: OWN_LOGINS }));
        await open(page, "/organization?company=me&tab=supply");

        // The row carries the identifier it is addressed by, and the words it is read by are the console's own.
        for (const [id, number] of [["acct-3", "01"], ["acct-7", "03"], ["acct-5", "02"]] as const) {
          const row = page.locator(`[data-supply-login="${id}"]`);

          await row.waitFor({ timeout: 30_000 });
          expect(await row.innerText()).toContain(numbered(number));
          expect(await row.innerText()).not.toContain("claude-");
          await expect(row.getByRole("button", { name: wording("common.aria.menu_of", { name: numbered(number) }), exact: true }).count()).resolves.toBe(1);
        }

        // The question asked before one is taken away names it the same way, and throwing it away answers nothing.
        await press(page, page.locator('[data-supply-login="acct-3"]').getByRole("button", { name: wording("common.aria.menu_of", { name: numbered("01") }), exact: true }), phone);
        await press(page, page.getByRole("menuitem", { name: wording("common.action.delete"), exact: true }), phone);

        const asked = page.getByRole("dialog").filter({ hasText: wording("supply.message.login_delete", { name: numbered("01") }) });

        await asked.waitFor({ timeout: 10_000 });
        expect(await asked.innerText()).not.toContain("claude-");
        await press(page, asked.getByRole("button", { name: wording("common.action.cancel"), exact: true }), phone);

        await fitsTheScreen(page);
      } finally {
        await context.close();
      }
    }, 120_000);

    test(`titles a new login's box by the number its name gives it among the reader's own, at ${width}px`, async () => {
      const context = await browser!.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, locale: "ko-KR", serviceWorkers: "block", reducedMotion: "reduce" });

      try {
        const page = await context.newPage();
        const started: unknown[] = [];

        await page.route(/\/api\/supply\/logins$/, (route) => json(route, { active: { provider: "claude-code", account: null, accountName: "", accounts: 3, session: null, week: null }, accounts: OWN_LOGINS }));
        await page.route(/\/api\/supply\/signin$/, (route) => {
          started.push(route.request().postDataJSON());

          return json(route, { login: LOGIN, url: "https://example.invalid/authorize", name: "claude-09" }, 201);
        });
        await page.route(new RegExp(`/api/supply/signin/${LOGIN}$`), (route) => route.fulfill({ status: 204 }));
        await open(page, "/organization?company=me&tab=supply");

        const add = page.getByRole("button", { name: wording("supply.action.login_add"), exact: true });

        await add.waitFor({ timeout: 30_000 });
        await press(page, add, phone);

        // The platform's fourth number is the reader's own fourth: their three stand below it.
        const dialog = page.getByRole("dialog").filter({ hasText: wording("agents.title.sign_in", { name: numbered("04") }) });

        await dialog.waitFor({ timeout: 10_000 });
        expect(started).toEqual([{}]);
        expect(await dialog.innerText()).not.toContain("claude-");

        // The box's own close, in its foot beside the corner mark of the same name.
        await press(page, dialog.getByRole("button", { name: wording("common.action.close"), exact: true }).last(), phone);
        await fitsTheScreen(page);
      } finally {
        await context.close();
      }
    }, 120_000);

    test(`numbers the platform's own logins apart from another account's on one list, at ${width}px`, async () => {
      const context = await browser!.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, locale: "ko-KR", serviceWorkers: "block", reducedMotion: "reduce" });

      try {
        const page = await context.newPage();

        // The platform's own three and one person's one, with the platform's second switched off: it is counted all
        // the same, and each account's own count begins at 01.
        await page.route(/\/api\/fallback$/, (route) =>
          json(route, {
            active: { provider: "claude-code", account: null, accountName: "", accounts: 4, session: null, week: null },
            accounts: [
              login("acct-a", "claude-01", 1, { userId: null }),
              login("acct-b", "claude-02", 2, { userId: 4 }),
              login("acct-c", "claude-03", 3, { userId: null, enabled: false }),
              login("acct-d", "claude-04", 4, { userId: null })
            ]
          })
        );
        await open(page, "/organization?company=platform&tab=supply#accounts");

        for (const [id, number] of [["acct-a", "01"], ["acct-c", "02"], ["acct-d", "03"], ["acct-b", "01"]] as const) {
          const row = page.locator(`[data-account="${id}"]`);

          await row.waitFor({ timeout: 30_000 });
          expect(await row.innerText()).toContain(numbered(number));
        }

        await fitsTheScreen(page);
      } finally {
        await context.close();
      }
    }, 120_000);
  }
});

// --- The order the Claude Code provider walks the platform's accounts in ---

// The handle at a row's left is what changes it, by the pointer or a finger, and its arrow keys once the handle
// holds the focus (docs/web.md, 「Changing an order」). The whole new order is what the write carries, and the read
// that follows answers it back.

const PLATFORM_LOGINS = [login("acct-a", "claude-01", 1, { userId: null }), login("acct-b", "claude-02", 2, { userId: null }), login("acct-c", "claude-03", 3, { userId: null })];

// The agency's list, kept in the order the console last wrote it, so the read that follows a carry answers the
// order that carry left, and every order the console sends is held for the test to read.
async function walking(page: Page): Promise<{ writes: string[][] }> {
  let order = PLATFORM_LOGINS.map((one) => one.id);
  const writes: string[][] = [];

  await page.route(/\/api\/fallback$/, (route: Route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as { action?: string; order?: { id: string }[] };

      if (body.action === "set-account-order" && Array.isArray(body.order)) {
        const written = body.order.map((one) => one.id);

        order = written;
        writes.push(written);
      }
    }

    const accounts = order.map((id) => PLATFORM_LOGINS.find((one) => one.id === id)!);

    return json(route, { active: { provider: "claude-code", account: null, accountName: "", accounts: accounts.length, session: null, week: null }, accounts });
  });

  return { writes };
}

// Which accounts the list stands, in the order it stands them.
async function walked(page: Page): Promise<string[]> {
  return await page.locator("[data-account]").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-account")!));
}

// The list once it has come to rest in this order: a carry and a key stand the rows in the new order at once.
async function walkedTo(page: Page, want: readonly string[]): Promise<void> {
  await page.waitForFunction((names: string) => [...document.querySelectorAll("[data-account]")].map((one) => one.getAttribute("data-account")).join(",") === names, want.join(","), { timeout: 20_000 });
}

// The order write at rest. While one is on its way every row's switch stands disabled, which is the very gate the
// carry and the arrow keys read, so a key pressed before it opens again is answered by nothing.
async function settled(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const held = [...document.querySelectorAll("[data-account] [role='switch']")];

    return held.length > 0 && held.every((one) => one.getAttribute("aria-disabled") !== "true" && !one.hasAttribute("data-disabled"));
  }, null, { timeout: 30_000 });
}

// The order write the screen sends, waited for by the response that answers it.
function orderWrite(page: Page): Promise<unknown> {
  return page.waitForResponse((one) => one.url().endsWith("/api/fallback") && one.request().method() === "POST", { timeout: 30_000 });
}

// The reader's own logins and gateway keys are carried on the console's one handle too (docs/web.md,
// 「Changing an order」): the handle's arrow keys move its row one place and write the whole order as it lands,
// the focus coming to rest on the row it lands so the keys go on answering from there. A key stands among its
// provider's keys alone, so a press that would land one on another provider's row moves nothing and writes
// nothing. The rows are read back in the order the answer puts them, the logins by their walk order and the
// keys grouped by provider.
describe.skipIf(!origin || !touchReady())("the reader's own supply rows carried by their handle", () => {
  const KEYS = [
    { id: "key-codex-1", road: "codex", secret: "codex-a", place: 1, enabled: true, refusedAt: null, addedAt: 1_700_000_000 },
    { id: "key-codex-2", road: "codex", secret: "codex-b", place: 2, enabled: true, refusedAt: null, addedAt: 1_700_000_001 },
    { id: "key-deep-1", road: "deepseek", secret: "deepseek-a", place: 1, enabled: true, refusedAt: null, addedAt: 1_700_000_002 },
  ];

  test("moves a login and a key on the arrow keys their handles answer, and holds a key inside its provider", async () => {
    const context = await browser!.newContext({ viewport: { width: 1280, height: 900 }, locale: "ko-KR", serviceWorkers: "block", reducedMotion: "reduce" });

    try {
      const page = await context.newPage();

      let logins = OWN_LOGINS.map((one) => ({ ...one }));
      const orderWrites: string[][] = [];

      await page.route(/\/api\/supply\/logins$/, async (route) => {
        if (route.request().method() === "POST") {
          const body = route.request().postDataJSON() as { action?: string; order?: { id: string; enabled: boolean }[] };

          if (body.action === "set-account-order" && Array.isArray(body.order)) {
            orderWrites.push(body.order.map((one) => one.id));
            logins = body.order.map((one, at) => ({ ...OWN_LOGINS.find((two) => two.id === one.id)!, place: at + 1 }));
          }

          await json(route, { ok: true });
          return;
        }

        await json(route, { active: { provider: "claude-code", account: null, accountName: "", accounts: logins.length, session: null, week: null }, accounts: logins });
      });

      const keys = KEYS.map((one) => ({ ...one }));
      const keyWrites: { id: string; place: number }[] = [];

      await page.route(/\/api\/supply\/personal(\/.*)?$/, async (route) => {
        if (route.request().method() === "PATCH") {
          const body = route.request().postDataJSON() as { place?: number };
          const id = decodeURIComponent(route.request().url().split("/").pop()!);
          const moved = keys.find((one) => one.id === id)!;
          const road = keys.filter((one) => one.road === moved.road);
          const rest = road.filter((one) => one.id !== id);

          rest.splice(Math.min((body.place ?? 1) - 1, rest.length), 0, moved);
          rest.forEach((one, at) => (one.place = at + 1));
          keyWrites.push({ id, place: body.place ?? 1 });
          await json(route, moved);
          return;
        }

        await json(route, keys);
      });

      await open(page, "/organization?company=me&tab=supply");
      await page.locator("[data-supply-login]").first().waitFor({ timeout: 30_000 });
      await page.locator("[data-supply-key]").first().waitFor({ timeout: 30_000 });

      const handle = (name: string) => page.getByRole("button", { name: wording("common.aria.reorder_named", { name }), exact: true });
      const rowsStood = (selector: string, attr: string, want: string) => page.waitForFunction(([selector, attr, want]: [string, string, string]) => [...document.querySelectorAll(selector)].map((one) => one.getAttribute(attr)).join(",") === want, [selector, attr, want] as [string, string, string], { timeout: 20_000 });

      // Down one place: the whole walk order lands where the row was set down, and the focus rides with it, so
      // the next key answers from there and carries it back up.
      const loginRead = page.waitForResponse((one) => one.url().endsWith("/api/supply/logins") && one.request().method() === "GET");

      await handle(numbered("01")).press("ArrowDown");
      await loginRead;
      await rowsStood("[data-supply-login]", "data-supply-login", "acct-7,acct-3,acct-5");
      expect(orderWrites).toEqual([["acct-7", "acct-3", "acct-5"]]);
      expect(await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "")).toBe(wording("common.aria.reorder_named", { name: numbered("01") }));

      const backRead = page.waitForResponse((one) => one.url().endsWith("/api/supply/logins") && one.request().method() === "GET");

      await page.keyboard.press("ArrowUp");
      await backRead;
      await rowsStood("[data-supply-login]", "data-supply-login", "acct-3,acct-7,acct-5");
      expect(orderWrites.length).toBe(2);

      // The deepseek key stands first among its own and last among the rows: pressed up it would land on a codex
      // row, which is no move — nothing shifts and nothing is written.
      await handle("deepseek-a").press("ArrowUp");
      expect(await page.locator("[data-supply-key]").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-supply-key")!))).toEqual(["codex-a", "codex-b", "deepseek-a"]);
      expect(keyWrites).toEqual([]);

      // Within its provider the same key moves like every other row: down onto its fellow's place, the provider's
      // whole order rewritten by the answer.
      const keyRead = page.waitForResponse((one) => one.url().endsWith("/api/supply/personal") && one.request().method() === "GET");

      await handle("codex-a").press("ArrowDown");
      await keyRead;
      await rowsStood("[data-supply-key]", "data-supply-key", "codex-b,codex-a,deepseek-a");
      expect(keyWrites).toEqual([{ id: "key-codex-1", place: 2 }]);

      await fitsTheScreen(page);
    } finally {
      await context.close();
    }
  }, 120_000);
});

describe.skipIf(!origin || !touchReady())("the platform's Claude accounts carried by their handle", () => {
  for (const [width, height, phone] of SIZES) {
    test(`stands one handle to each account, carries a row to another's place and sends the whole order, at ${width}px`, async () => {
      const context = await browser!.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, locale: "ko-KR", serviceWorkers: "block", reducedMotion: "reduce" });

      try {
        const page = await context.newPage();
        const { writes } = await walking(page);

        await open(page, "/organization?company=platform&tab=supply#accounts");
        await page.locator('[data-account="acct-a"]').waitFor({ timeout: 30_000 });
        expect(await walked(page)).toEqual(["acct-a", "acct-b", "acct-c"]);

        // One handle at each row's left, named for the login it carries, one measure and one column down the list.
        const handle = (number: string) => page.getByRole("button", { name: wording("common.aria.reorder_named", { name: numbered(number) }), exact: true });

        for (const number of ["01", "02", "03"]) expect(await handle(number).count()).toBe(1);

        const boxes = await Promise.all(["01", "02", "03"].map(async (number) => (await handle(number).boundingBox())!));
        const at = Math.round(boxes[0]!.x);

        expect(boxes.map((one) => Math.round(one.x))).toEqual([at, at, at]);
        expect(boxes.map((one) => Math.round(one.width))).toEqual([36, 36, 36]);

        await page.locator('[data-account="acct-c"]').scrollIntoViewIfNeeded();

        const wrote = orderWrite(page);

        if (phone) {
          const finger = await fingerOn(page);

          await finger.swipe(await centre(handle("03")), await centre(page.locator('[data-account="acct-a"]')), { steps: 12 });
        } else {
          await carryByMouse(page, await centre(handle("03")), await centre(page.locator('[data-account="acct-a"]')), async () => null);
        }

        await walkedTo(page, ["acct-c", "acct-a", "acct-b"]);
        await wrote;
        expect(writes).toEqual([["acct-c", "acct-a", "acct-b"]]);
        await settled(page);

        // A press on a handle that lets go where it went down moves nothing and sends nothing.
        if (!phone) {
          const still = await centre(handle("01"));

          await carryByMouse(page, still, still, async () => null);
          await page.waitForTimeout(1_000);
          expect(await walked(page)).toEqual(["acct-c", "acct-a", "acct-b"]);
          expect(writes.length).toBe(1);
        }

        await fitsTheScreen(page);
      } finally {
        await context.close();
      }
    }, 120_000);

    test(`moves a login one place on the arrow keys its handle answers, at ${width}px`, async () => {
      const context = await browser!.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, locale: "ko-KR", serviceWorkers: "block", reducedMotion: "reduce" });

      try {
        const page = await context.newPage();
        const { writes } = await walking(page);
        const handle = (number: string) => page.getByRole("button", { name: wording("common.aria.reorder_named", { name: numbered(number) }), exact: true });

        await open(page, "/organization?company=platform&tab=supply#accounts");
        await page.locator('[data-account="acct-a"]').waitFor({ timeout: 30_000 });

        // Each key writes the order, and the next key waits until that write is at rest: while it is on its way the
        // rows hold the gate the keys read, and a key pressed under it answers nothing.
        const one = orderWrite(page);

        await handle("01").press("ArrowDown");
        await walkedTo(page, ["acct-b", "acct-a", "acct-c"]);
        await one;
        await settled(page);

        // The row keeps the focus where it lands, so the keys go on answering from there.
        expect(await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "")).toBe(wording("common.aria.reorder_named", { name: numbered("01") }));

        const two = orderWrite(page);

        await page.keyboard.press("ArrowDown");
        await walkedTo(page, ["acct-b", "acct-c", "acct-a"]);
        await two;
        await settled(page);

        // And back up it goes the same way, the focus riding with the row it landed on.
        const three = orderWrite(page);

        await page.keyboard.press("ArrowUp");
        await walkedTo(page, ["acct-b", "acct-a", "acct-c"]);
        await three;
        await settled(page);

        const four = orderWrite(page);

        await page.keyboard.press("ArrowUp");
        await walkedTo(page, ["acct-a", "acct-b", "acct-c"]);
        await four;
        await settled(page);

        // The first place holds it: the row standing there has nowhere to go up to, and no order is written.
        await page.keyboard.press("ArrowUp");
        await page.waitForTimeout(1_000);
        expect(await walked(page)).toEqual(["acct-a", "acct-b", "acct-c"]);
        expect(writes).toEqual([["acct-b", "acct-a", "acct-c"], ["acct-b", "acct-c", "acct-a"], ["acct-b", "acct-a", "acct-c"], ["acct-a", "acct-b", "acct-c"]]);

        await fitsTheScreen(page);
      } finally {
        await context.close();
      }
    }, 120_000);
  }
});
