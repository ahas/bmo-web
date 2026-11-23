import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { HARNESS_SCREEN_UNITS } from "../support/harness-screens";
import { BROWSER_HOOK_MS, fingerOn, touchReady } from "./touch";

import type { Browser, BrowserContext, Locator, Page } from "playwright-core";
import KO from "../fixtures/browser/sidebar-sections.test.ko.json";

// The administrator's apps tab as a hand works it (docs/web.md, 「Administration」, the apps tab): the administrator
// withholds the app from a company in the app's settings dialog and a member of that company loses it, then chooses
// the platform's own offer again, marked as the default, and the member has it back; and the administrator recalls the
// app, answering the question the row grows, so the member finds it nowhere and every relayed call is refused
// `app-off`, then lifts the recall and the member has it back. Every press lands on what the browser draws at that
// point, a finger's tap at a phone's width and a mouse's click at a desk's, and nothing runs past the screen sideways.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up, whose second
// stand-in screen is an app offered and on wherever nobody says otherwise.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ADMINISTRATOR = { name: "apps-admin", password: "fixture-password-3911" };
const MEMBER = { name: "apps-reader", password: "fixture-password-3912" };
const RUN = Date.now().toString(36);

const APP = HARNESS_SCREEN_UNITS[1];
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

beforeAll(async () => {
  if (!origin || !touchReady()) return;

  for (const account of [ADMINISTRATOR, MEMBER]) cookies.set(account.name, await login(account));

  // A company of this run's, the member standing in it.
  company = (await administer<{ id: number }>("/api/organization/units", "POST", { name: `apps-admin-company-${RUN}`, parent: null })).id;

  const users = await administer<{ user: string; name: string }[]>("/api/users", "GET");
  const member = encodeURIComponent(users.find((one) => one.name === MEMBER.name)!.user);

  await administer(`/api/organization/users/${member}/unit`, "PUT", { unit: company });

  browser = await chromium.launch();
}, BROWSER_HOOK_MS);

// Whatever a failed test left standing is taken back, so the app stands for every later file as it stood before.
afterAll(async () => {
  if (company !== 0) {
    await call(ADMINISTRATOR.name, `/api/admin/apps/${APP}/recall`, "DELETE").catch(() => null);
    await call(ADMINISTRATOR.name, `/api/organization/units/${company}/apps/${APP}`, "PUT", { offer: null }).catch(() => null);
  }

  await browser?.close();
}, BROWSER_HOOK_MS);

async function contextFor(account: string, width: number, height: number, phone: boolean): Promise<BrowserContext> {
  const context = await browser!.newContext({ viewport: { width, height }, hasTouch: phone, isMobile: phone, serviceWorkers: "block", reducedMotion: "reduce" });
  const cookie = cookies.get(account)!;
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

  return context;
}

async function standing(page: Page): Promise<void> {
  await page.waitForFunction(() => window.useNuxtApp?.().isHydrating === false, null, { timeout: 30_000 });
}

// A press where the browser draws the control: scrolled into view, the topmost thing at its centre is the control or
// stands inside it, so nothing stands over what is pressed; then a finger's tap on a phone and a click on a desk.
async function press(page: Page, target: Locator, phone: boolean): Promise<void> {
  await target.scrollIntoViewIfNeeded();

  const box = (await target.boundingBox())!;
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const reached = await target.evaluate((element, at) => {
    const top = document.elementFromPoint(at.x, at.y);

    return top !== null && (element === top || element.contains(top));
  }, centre);

  expect(reached).toBe(true);

  if (phone) await (await fingerOn(page)).tap(centre);
  else await page.mouse.click(centre.x, centre.y);
}

async function overflow(page: Page): Promise<number> {
  return await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

// What the relay answers the member for a read of the app's service.
async function relayed(): Promise<{ status: number; code: unknown }> {
  const answer = await call(MEMBER.name, `/api/${APP}/console-manifest`, "GET");
  const body = (await answer.json().catch(() => null)) as { data?: { code?: unknown } } | null;

  return { status: answer.status, code: answer.ok ? null : (body?.data?.code ?? null) };
}

// The screens the member's sidebar names among the applications, read on their home screen.
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

// The administrator's apps tab open, the app's row standing.
async function appsTab(page: Page): Promise<Locator> {
  await page.goto(`${origin}/admin?tab=apps`, { waitUntil: "load" });
  await standing(page);

  const row = page.locator(`[data-app-row="${APP}"]`);

  await row.waitFor({ timeout: 20_000 });

  return row;
}

// A control read until it shows these words alone, as the rows read again after a write draw it.
async function shows(control: Locator, words: string): Promise<void> {
  const until = Date.now() + 20_000;
  let read = "";

  while (Date.now() < until) {
    read = (await control.innerText()).trim();

    if (read === words) return;

    await control.page().waitForTimeout(200);
  }

  expect(read).toBe(words);
}

// One choice made in an open list of the console's select.
async function choose(page: Page, select: Locator, label: string, phone: boolean): Promise<void> {
  await press(page, select, phone);

  const option = page.getByRole("option", { name: label, exact: true });

  await option.waitFor({ timeout: 10_000 });
  await press(page, option, phone);
}

describe.skipIf(!origin || !touchReady())("the administrator's apps tab", () => {
  for (const viewport of WIDTHS) {
    test(`an app withheld from a company in its settings, then given back, at ${viewport.width}px`, async () => {
      expect(await relayed()).toEqual({ status: 200, code: null });

      const context = await contextFor(ADMINISTRATOR.name, viewport.width, viewport.height, viewport.phone);

      try {
        const page = await context.newPage();
        const row = await appsTab(page);

        expect(await overflow(page)).toBeLessThanOrEqual(0);
        await press(page, row.locator("button[data-app-settings]"), viewport.phone);

        const dialog = page.locator("[data-app-dialog]");

        await dialog.waitFor({ timeout: 10_000 });

        const companyRow = dialog.locator(`[data-app-company="${company}"]`);
        const select = companyRow.locator("[data-app-company-offer]");
        const withhold = wording("apps.label.withhold");
        // The platform's own offer, the value standing with no rule, is the one marked as the default.
        const offer = wording("organization.label.default_mark", { label: wording("apps.label.offer") });

        await expect(select.innerText()).resolves.toContain(offer);
        expect(await overflow(page)).toBeLessThanOrEqual(0);

        await choose(page, select, withhold, viewport.phone);
        await shows(select, withhold);
        expect(await relayed()).toEqual({ status: 403, code: "app-off" });

        // Choosing the marked value takes the company's rule away, and the member holds the app again.
        await choose(page, select, offer, viewport.phone);
        await shows(select, offer);
        expect(await relayed()).toEqual({ status: 200, code: null });

        // Closed untouched by a write left half-made, the dialog asks nothing.
        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "detached", timeout: 10_000 });
      } finally {
        await context.close();
      }
    }, 120_000);

    test(`an app recalled from everyone, asked first on its row, then lifted, at ${viewport.width}px`, async () => {
      const admin = await contextFor(ADMINISTRATOR.name, viewport.width, viewport.height, viewport.phone);
      const member = await contextFor(MEMBER.name, viewport.width, viewport.height, viewport.phone);

      try {
        const memberPage = await member.newPage();

        expect(await applications(memberPage, viewport.phone)).toContain(APP);

        const page = await admin.newPage();
        const row = await appsTab(page);

        // The recall is asked first as a step the row grows; its way out puts the row back as it stood.
        await press(page, row.locator("button[data-app-recall]"), viewport.phone);

        const question = row.locator("[data-app-recall-ask]");

        await question.waitFor({ timeout: 10_000 });
        expect(await question.innerText()).toContain(wording("apps.title.recall", { app: (await row.locator("span").first().innerText()).trim() }));
        expect(await overflow(page)).toBeLessThanOrEqual(0);

        await press(page, question.locator("button[data-app-recall-cancel]"), viewport.phone);
        await question.waitFor({ state: "detached", timeout: 10_000 });
        expect(await relayed()).toEqual({ status: 200, code: null });

        // Gone through, the row says the app is recalled and offers the lift in its place.
        await press(page, row.locator("button[data-app-recall]"), viewport.phone);
        await press(page, row.locator("button[data-app-recall-confirm]"), viewport.phone);
        await row.locator("[data-app-state]", { hasText: wording("apps.label.recalled") }).waitFor({ timeout: 20_000 });
        await row.locator("button[data-app-lift]").waitFor({ timeout: 10_000 });
        expect(await overflow(page)).toBeLessThanOrEqual(0);

        // The member finds it nowhere, and the relay refuses it.
        expect(await applications(memberPage, viewport.phone)).not.toContain(APP);
        expect(await relayed()).toEqual({ status: 403, code: "app-off" });

        // Lifted, the member holds it again.
        await press(page, row.locator("button[data-app-lift]"), viewport.phone);
        await row.locator("button[data-app-recall]").waitFor({ timeout: 20_000 });
        expect(await row.locator("[data-app-state]").innerText()).not.toContain(wording("apps.label.recalled"));
        expect(await relayed()).toEqual({ status: 200, code: null });
        expect(await applications(memberPage, viewport.phone)).toContain(APP);
      } finally {
        await admin.close();
        await member.close();
      }
    }, 120_000);
  }
});
