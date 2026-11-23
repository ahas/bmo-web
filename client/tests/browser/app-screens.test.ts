import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { HARNESS_SCREEN_UNITS } from "../support/harness-screens";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, BrowserContext, Locator, Page } from "playwright-core";
import KO from "../fixtures/browser/sidebar-sections.test.ko.json";

// A screen that is an app stands nowhere for a reader it is turned off for (docs/web.md, 「Screens a unit brings」,
// 「Organisation」's apps tab): a member whose company the platform does not offer the app finds it in no sidebar,
// its address leads them home and every call through the relay is refused `app-off`; and once it is offered again, a
// head of the company turning it off on the organisation screen's apps tab takes it away from the member the same way.
// Each is read at a phone's width and a desk's.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up, whose second
// stand-in screen is an app offered and on wherever nobody says otherwise.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ADMINISTRATOR = { name: "app-screens", password: "fixture-password-3901" };
const MEMBER = { name: "app-member", password: "fixture-password-3902" };
const HEAD = { name: "app-head", password: "fixture-password-3903" };
const RUN = Date.now().toString(36);

// The app turned off, and a screen beside it that is no app.
const APP = HARNESS_SCREEN_UNITS[1];
const OTHER = HARNESS_SCREEN_UNITS[0];

const APPLICATION = wording("screens.label.section_application");

const WIDTHS = [
  { width: 360, height: 740, phone: true },
  { width: 1280, height: 800, phone: false }
] as const;

let browser: Browser | null = null;
const cookies = new Map<string, string>();
let company = 0;

async function login(account: { name: string; password: string }): Promise<string> {
  const answer = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(account) });

  expect(answer.ok).toBe(true);

  return answer.headers.get("set-cookie")!.split(";")[0]!;
}

// A call of the console's own API as one of the file's accounts.
async function call(account: string, path: string, method: string, body?: unknown): Promise<Response> {
  return await fetch(`${origin}${path}`, {
    method,
    headers: { cookie: cookies.get(account)!, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

async function administer<T>(path: string, method: string, body?: unknown): Promise<T> {
  const answer = await call(ADMINISTRATOR.name, path, method, body);

  expect({ path, status: answer.status, ok: answer.ok }).toMatchObject({ path, ok: true });

  return (answer.status === 204 ? null : await answer.json().catch(() => null)) as T;
}

// The company's word on the app, written as the organisation screen writes it.
async function companyWord(account: string, change: Record<string, unknown>): Promise<void> {
  const answer = await call(account, `/api/organization/units/${company}/apps/${APP}`, "PUT", change);

  expect({ change, status: answer.status, ok: answer.ok }).toMatchObject({ change, ok: true });
}

beforeAll(async () => {
  if (!origin || !touchReady()) return;

  for (const account of [ADMINISTRATOR, MEMBER, HEAD]) cookies.set(account.name, await login(account));

  // A company of this run's with a team under it: the member standing in the team, the head heading the company.
  company = (await administer<{ id: number }>("/api/organization/units", "POST", { name: `apps-company-${RUN}`, parent: null })).id;

  const team = (await administer<{ id: number }>("/api/organization/units", "POST", { name: `apps-team-${RUN}`, parent: company })).id;
  const users = await administer<{ user: string; name: string }[]>("/api/users", "GET");
  const userOf = (name: string) => encodeURIComponent(users.find((one) => one.name === name)!.user);

  await administer(`/api/organization/users/${userOf(MEMBER.name)}/unit`, "PUT", { unit: team });
  await administer(`/api/organization/users/${userOf(HEAD.name)}/unit`, "PUT", { unit: company });
  await administer(`/api/organization/units/${company}/heads/${userOf(HEAD.name)}`, "PUT");

  browser = await chromium.launch();
}, BROWSER_HOOK_MS);

afterAll(async () => {
  if (company !== 0) {
    await call(ADMINISTRATOR.name, `/api/organization/units/${company}/apps/${APP}`, "PUT", { offer: null, on: null, locks: false }).catch(() => null);
  }

  await browser?.close();
}, BROWSER_HOOK_MS);

async function contextFor(account: string, width: number, height: number): Promise<BrowserContext> {
  const context = await browser!.newContext({ viewport: { width, height }, serviceWorkers: "block", reducedMotion: "reduce" });
  const cookie = cookies.get(account)!;
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

  return context;
}

async function standing(page: Page): Promise<void> {
  await page.waitForFunction(() => window.useNuxtApp?.().isHydrating === false, null, { timeout: 30_000 });
}

// The screens the reader's sidebar names among the applications, read on their home screen: on a phone, in the drawer
// opened from the top bar.
async function applications(page: Page, phone: boolean): Promise<string[]> {
  await page.goto(`${origin}/`, { waitUntil: "load" });
  await standing(page);

  let holder: Locator = page.locator("[id^='console-sidebar-']").first();

  if (phone) {
    await page.getByRole("button", { name: KO.open_sidebar }).click();
    holder = page.getByRole("dialog");
  }

  const menu = holder.locator(`nav[aria-label="${APPLICATION}"]`);

  await menu.waitFor({ timeout: 20_000 });

  return (await menu.locator("[data-slot='link'] [data-slot='linkLabel']").allInnerTexts()).map((one) => one.trim());
}

// What the relay answers the reader for a read of the app's service.
async function relayed(account: string): Promise<{ status: number; code: unknown }> {
  const answer = await call(account, `/api/${APP}/console-manifest`, "GET");
  const body = (await answer.json().catch(() => null)) as { data?: { code?: unknown } } | null;

  return { status: answer.status, code: answer.ok ? null : (body?.data?.code ?? null) };
}

// The member asked to the app's own address: where it leads them, and whether its screen stands there.
async function opened(page: Page): Promise<{ at: string; screen: number }> {
  await page.goto(`${origin}/${APP}`, { waitUntil: "load" });
  await standing(page);
  await page.waitForURL((url) => !url.pathname.endsWith(`/${APP}`), { timeout: 20_000 }).catch(() => null);

  return { at: new URL(page.url()).pathname, screen: await page.locator(`[data-screen="${APP}"]`).count() };
}

// Nothing on the page runs past the screen's edge sideways.
async function overflow(page: Page): Promise<number> {
  return await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

describe.skipIf(!origin || !touchReady())("an app turned off for a reader", () => {
  for (const viewport of WIDTHS) {
    test(`a member whose company is not offered the app finds it nowhere at ${viewport.width}px`, async () => {
      await companyWord(ADMINISTRATOR.name, { offer: false });

      const context = await contextFor(MEMBER.name, viewport.width, viewport.height);

      try {
        const page = await context.newPage();
        const shown = await applications(page, viewport.phone);

        expect(shown).toContain(OTHER);
        expect(shown).not.toContain(APP);
        expect(await relayed(MEMBER.name)).toEqual({ status: 403, code: "app-off" });

        const asked = await opened(page);

        expect(asked.screen).toBe(0);
        expect(asked.at.endsWith(`/${APP}`)).toBe(false);
      } finally {
        await context.close();
        await companyWord(ADMINISTRATOR.name, { offer: null });
      }
    }, 120_000);

    test(`a head turning the app off on the apps tab takes it from a member at ${viewport.width}px`, async () => {
      // Offered and following the platform, the member holds the app.
      expect(await relayed(MEMBER.name)).toEqual({ status: 200, code: null });

      const head = await contextFor(HEAD.name, viewport.width, viewport.height);
      const member = await contextFor(MEMBER.name, viewport.width, viewport.height);

      try {
        const memberPage = await member.newPage();

        expect(await applications(memberPage, viewport.phone)).toContain(APP);

        // The head opens the company's apps tab and turns the app off there.
        const page = await head.newPage();

        await page.goto(`${origin}/organization?company=${company}&tab=apps`, { waitUntil: "load" });
        await standing(page);

        const row = page.locator(`[data-app-row="${APP}"]`);

        await row.waitFor({ timeout: 20_000 });
        expect(await overflow(page)).toBeLessThanOrEqual(0);
        await row.locator("[data-app-choice]").click();
        await page.getByRole("option", { name: wording("apps.label.off"), exact: true }).click();
        await row.locator("[data-app-state]", { hasText: wording("apps.label.own") }).waitFor({ timeout: 20_000 });

        // The member's sidebar, read afresh, names it no longer, and the relay refuses it.
        expect(await applications(memberPage, viewport.phone)).not.toContain(APP);
        expect(await relayed(MEMBER.name)).toEqual({ status: 403, code: "app-off" });
      } finally {
        await head.close();
        await member.close();
        await companyWord(HEAD.name, { on: null });
      }
    }, 120_000);
  }
});
