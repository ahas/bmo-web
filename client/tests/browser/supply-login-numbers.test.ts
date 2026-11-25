import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";
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
