import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";

import type { Browser, Locator, Page, Route } from "playwright-core";

// A reader's own Claude sign-in on the supply tab with their own node chosen (docs/web.md, 「Settings」, the supply
// section): adding a login starts the sign-in naming no name, the box's title carries the number the name the agency
// answered gives the login within the reader's own account, and a refusal of the code is said in the box in its own
// sentence; a login of theirs is signed in again by its id,
// and a refusal of that start said in its own sentence. The platform's Claude accounts box on the supply tab opens
// a new login's name empty and starts naming none, its box titled by its number among the platform's own logins.
// Read at a desk's width and a phone's, each press
// landing on the control it names and nothing running off the side. The relay's own sentences are its server test's;
// here the page's calls are answered as the relay answers them.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "supply-signin", password: "fixture-password-4411" };
const SIZES = [[1280, 900, false], [412, 915, true]] as const;
const LOGIN = "sign-in-4411";

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

// The console's own name for the login an account counts as its own nth (docs/web.md, 「System and organisation」, the supply tab).
const numbered = (n: string) => wording("supply.label.login_numbered", { number: n });

// Pressed as the reader's hand presses it, once nothing stands over its centre.
async function press(page: Page, target: Locator, phone: boolean): Promise<void> {
  await target.scrollIntoViewIfNeeded();

  const box = (await target.boundingBox())!;
  const centre = [box.x + box.width / 2, box.y + box.height / 2] as const;

  expect(await target.evaluate((element, [x, y]) => element.contains(document.elementFromPoint(x, y)), centre)).toBe(true);

  if (phone) await target.tap();
  else await target.click();
}

describe.skipIf(!origin || !touchReady())("a reader's own Claude sign-in", () => {
  for (const [width, height, phone] of SIZES) {
    test(`starts naming no name, titles the box by the agency's name, and says a lost sign-in as expired, at ${width}px`, async () => {
      const context = await browser!.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, locale: "ko-KR", serviceWorkers: "block", reducedMotion: "reduce" });
      const at = cookie.indexOf("=");

      await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

      try {
        const page = await context.newPage();
        const started: unknown[] = [];
        const codes: unknown[] = [];

        await page.route(/\/api\/supply\/logins$/, (route) =>
          json(route, {
            active: { provider: "claude-code", account: null, accountName: "", accounts: 1, session: null, week: null },
            accounts: [{ id: "acct-2", name: "claude-02", place: 1, enabled: true, credentialKind: "directory", credentialPath: "/srv/node/data/env/claude-02", login: "standing", loginEndsAt: null, chosen: false, restUntil: null, userId: 7 }]
          })
        );
        await page.route(/\/api\/supply\/signin$/, (route) => {
          started.push(route.request().postDataJSON());

          return json(route, { login: LOGIN, url: "https://example.invalid/authorize", name: "claude-03" }, 201);
        });
        await page.route(new RegExp(`/api/supply/signin/${LOGIN}/code$`), (route) => {
          codes.push(route.request().postDataJSON());

          return json(route, { statusCode: 404, statusMessage: "Not Found", message: wording("agents.error.login_gone") }, 404);
        });
        await page.route(new RegExp(`/api/supply/signin/${LOGIN}$`), (route) => route.fulfill({ status: 204 }));
        await page.goto(`${origin}/organization?company=me&tab=supply`, { waitUntil: "load" });

        const add = page.getByRole("button", { name: wording("supply.action.login_add"), exact: true });

        await add.waitFor({ timeout: 30_000 });
        await press(page, add, phone);

        // The platform's third number is the reader's own second: their first login stands below it.
        const dialog = page.getByRole("dialog").filter({ hasText: wording("agents.title.sign_in", { name: numbered("02") }) });

        await dialog.waitFor({ timeout: 10_000 });
        expect(started).toEqual([{}]);

        const code = dialog.locator("[data-sign-in-code]");

        await code.fill("abc#state");
        await press(page, dialog.getByRole("button", { name: wording("agents.action.sign_in_finish"), exact: true }), phone);
        await dialog.getByRole("alert").filter({ hasText: wording("agents.error.login_gone") }).waitFor({ timeout: 10_000 });
        expect(codes).toEqual([{ code: "abc#state" }]);
        expect(await dialog.getByText(wording("agents.error.field_refused"), { exact: true }).count()).toBe(0);

        // Nothing runs off the side of the box.
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      } finally {
        await context.close();
      }
    }, 120_000);
  }

  for (const [width, height, phone] of SIZES) {
    test(`signs the reader's own login in again by its id and says a login on another machine as such, at ${width}px`, async () => {
      const context = await browser!.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, locale: "ko-KR", serviceWorkers: "block", reducedMotion: "reduce" });
      const at = cookie.indexOf("=");

      await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

      try {
        const page = await context.newPage();
        const started: unknown[] = [];
        const login = { id: "acct-7", name: "claude-07", place: 1, enabled: true, credentialKind: "directory", credentialPath: "/home/tester/node/data/env/claude-07", login: "gone", loginEndsAt: null, chosen: false, restUntil: null, userId: 7 };

        await page.route(/\/api\/supply\/logins$/, (route) => json(route, { active: { provider: "claude-code", account: null, accountName: "", accounts: 1, session: null, week: null }, accounts: [login] }));
        await page.route(/\/api\/supply\/signin$/, (route) => {
          started.push(route.request().postDataJSON());

          return json(route, { statusCode: 409, statusMessage: "Conflict", message: wording("agents.error.login_elsewhere") }, 409);
        });
        await page.goto(`${origin}/organization?company=me&tab=supply`, { waitUntil: "load" });

        const menu = page.getByRole("button", { name: wording("common.aria.menu_of", { name: numbered("01") }), exact: true });

        await menu.waitFor({ timeout: 30_000 });
        await press(page, menu, phone);

        const again = page.getByRole("menuitem", { name: wording("supply.action.login_again"), exact: true });

        await again.waitFor({ timeout: 10_000 });
        await press(page, again, phone);

        const dialog = page.getByRole("dialog").filter({ hasText: wording("agents.title.sign_in", { name: numbered("01") }) });

        await dialog.getByRole("alert").filter({ hasText: wording("agents.error.login_elsewhere") }).waitFor({ timeout: 10_000 });
        expect(started).toEqual([{ account: "acct-7" }]);
        expect(await dialog.getByText(wording("supply.error.signin_failed"), { exact: true }).count()).toBe(0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      } finally {
        await context.close();
      }
    }, 120_000);

    test(`opens the platform's new login with its name empty and starts it naming none, at ${width}px`, async () => {
      const context = await browser!.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, locale: "ko-KR", serviceWorkers: "block", reducedMotion: "reduce" });
      const at = cookie.indexOf("=");

      await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

      try {
        const page = await context.newPage();
        const started: unknown[] = [];

        await page.route(/\/api\/fallback$/, (route) =>
          json(route, {
            active: { provider: "claude-code", account: null, accountName: "", accounts: 2, session: null, week: null },
            accounts: [
              { id: "acct-a", name: "claude-01", place: 1, enabled: true, credentialKind: "directory", credentialPath: "/srv/node/data/env/claude-01", login: "standing", loginEndsAt: null, chosen: false, restUntil: null, userId: null },
              { id: "acct-d", name: "claude-04", place: 2, enabled: true, credentialKind: "directory", credentialPath: "/srv/node/data/env/claude-04", login: "standing", loginEndsAt: null, chosen: false, restUntil: null, userId: null }
            ]
          })
        );
        await page.route(/\/api\/claude-logins$/, (route) => {
          started.push(route.request().postDataJSON());

          return json(route, { login: LOGIN, url: "https://example.invalid/authorize", name: "claude-09" }, 201);
        });
        await page.route(new RegExp(`/api/claude-logins/${LOGIN}$`), (route) => route.fulfill({ status: 204 }));
        await page.goto(`${origin}/organization?company=platform&tab=supply`, { waitUntil: "load" });

        const add = page.locator("[data-account-add]");

        await add.waitFor({ timeout: 30_000 });
        await press(page, add, phone);

        const name = page.getByRole("textbox", { name: wording("common.label.name"), exact: true });

        await name.waitFor({ timeout: 10_000 });
        expect(await name.inputValue()).toBe("");
        expect(await name.getAttribute("placeholder")).toBe(wording("agents.placeholder.account_name_auto"));
        await press(page, page.getByRole("button", { name: wording("common.action.add"), exact: true }), phone);

        // The platform's own third, counted against the platform's own logins alone.
        const dialog = page.getByRole("dialog").filter({ hasText: wording("agents.title.sign_in", { name: numbered("03") }) });

        await dialog.waitFor({ timeout: 10_000 });
        expect(started).toEqual([{}]);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      } finally {
        await context.close();
      }
    }, 120_000);
  }
});
