import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { HARNESS_SCREEN_UNITS } from "../support/harness-screens";
import { BROWSER_HOOK_MS, fingerOn, touchReady } from "./touch";

import type { Browser, BrowserContext, Locator, Page } from "playwright-core";
import KO from "../fixtures/browser/sidebar-sections.test.ko.json";

// The one apps screen as a hand works it (docs/web.md, 「Organisation」, the apps tab): the organisation screen's tree
// holds the links the reader may write, and the apps tab draws the link chosen. The administrator chooses the platform
// node from a company and the tab stays open on the platform's own word, where an app is recalled from everyone, asked
// first on its row, and lifted again; a tab declaring nothing at the platform says so in one line. At a company the
// administrator's offer switch withholds the app from it and gives it back. A member opens the settings dialog's door
// and lands on their own node, where they turn the app off for themselves and take their word back. Each change
// is read where it lands: the member's sidebar and the relay's answer. Every press lands on what the browser draws at
// that point, a finger's tap at a phone's width and a mouse's click at a desk's, and nothing runs past the screen
// sideways.
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
  company = (await administer<{ id: number }>("/api/organization/units", "POST", { name: `apps-org-company-${RUN}`, parent: null })).id;

  const users = await administer<{ user: string; name: string }[]>("/api/users", "GET");
  const member = encodeURIComponent(users.find((one) => one.name === MEMBER.name)!.user);

  await administer(`/api/organization/users/${member}/unit`, "PUT", { unit: company });

  browser = await chromium.launch();
}, BROWSER_HOOK_MS);

// Whatever a failed test left standing is taken back, so the app stands for every later file as it stood before.
afterAll(async () => {
  if (company !== 0) {
    await call(ADMINISTRATOR.name, `/api/organization/platform/apps/${APP}/recall`, "DELETE").catch(() => null);
    await call(ADMINISTRATOR.name, `/api/organization/units/${company}/apps/${APP}`, "PUT", { offer: null }).catch(() => null);
    await call(MEMBER.name, `/api/account/apps/${APP}`, "PUT", { on: null }).catch(() => null);
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

// A press where the browser draws the control once it stands still, as a drawer rising has stopped: scrolled into
// view, the topmost thing at its centre is the control or stands inside it, so nothing stands over what is pressed;
// then a finger's tap on a phone and a click on a desk.
async function press(page: Page, target: Locator, phone: boolean): Promise<void> {
  await target.scrollIntoViewIfNeeded();

  let box = (await target.boundingBox())!;

  for (let tries = 0; tries < 20; tries += 1) {
    await page.waitForTimeout(100);

    const now = (await target.boundingBox())!;

    if (now.x === box.x && now.y === box.y) break;
    box = now;
  }

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

// The relay's answer read until it says what is expected, as a write reaches it.
async function relaysAs(expected: { status: number; code: unknown }): Promise<void> {
  const until = Date.now() + 20_000;
  let read = await relayed();

  while (Date.now() < until && (read.status !== expected.status || read.code !== expected.code)) {
    await new Promise((done) => setTimeout(done, 200));
    read = await relayed();
  }

  expect(read).toEqual(expected);
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

// The organisation tree where the hand reaches it: beside the node chosen at a desk's width, in its drawer on a phone,
// opened from the button at the start of the tab row.
async function tree(page: Page, phone: boolean): Promise<Locator> {
  if (!phone) return page.locator("[data-choice-sidebar-list]");

  await press(page, page.locator("[data-choice-sidebar-open]"), phone);

  const drawer = page.getByRole("dialog").last();

  await drawer.locator("[data-choice-sidebar-list]").waitFor({ timeout: 10_000 });

  return drawer.locator("[data-choice-sidebar-list]");
}

// A node of the tree chosen by the hand, by its key.
async function chooseNode(page: Page, key: string, phone: boolean): Promise<void> {
  const list = await tree(page, phone);
  const row = list.locator(`[data-choice-tree-row="${key}"]`);

  await row.waitFor({ timeout: 20_000 });
  await press(page, row, phone);

  // Choosing closes the drawer, which stands over nothing once it has gone.
  if (phone) await page.getByRole("dialog").waitFor({ state: "detached", timeout: 10_000 });
}

// The app's row on the apps tab of the node the address names.
async function appRow(page: Page): Promise<Locator> {
  const row = page.locator(`[data-app-row="${APP}"]`);

  await row.waitFor({ timeout: 20_000 });

  return row;
}

describe.skipIf(!origin || !touchReady())("the organisation screen's one apps tab", () => {
  for (const viewport of WIDTHS) {
    test(`the platform chosen from a company keeps the tab, recalls an app from everyone and lifts it, at ${viewport.width}px`, async () => {
      const admin = await contextFor(ADMINISTRATOR.name, viewport.width, viewport.height, viewport.phone);
      const member = await contextFor(MEMBER.name, viewport.width, viewport.height, viewport.phone);

      try {
        const memberPage = await member.newPage();

        expect(await applications(memberPage, viewport.phone)).toContain(APP);

        const page = await admin.newPage();

        await page.goto(`${origin}/organization?company=${company}&tab=apps`, { waitUntil: "load" });
        await standing(page);
        await appRow(page);

        // The platform chosen in the tree, the apps tab staying open on the platform's own word.
        await chooseNode(page, "string:platform", viewport.phone);
        await page.waitForURL((url) => url.searchParams.get("company") === "platform" && url.searchParams.get("tab") === "apps", { timeout: 15_000 });
        await page.locator('[data-organization-node="platform"]').waitFor({ timeout: 10_000 });

        const row = await appRow(page);

        await row.locator("button[data-app-recall]").waitFor({ timeout: 20_000 });
        expect(await overflow(page)).toBeLessThanOrEqual(0);

        // The recall is asked first as a step the row grows; its way out puts the row back as it stood.
        await press(page, row.locator("button[data-app-recall]"), viewport.phone);

        const question = row.locator("[data-app-recall-ask]");

        await question.waitFor({ timeout: 10_000 });
        expect(await question.innerText()).toContain(wording("apps.title.recall", { app: (await row.locator("[data-app-title]").innerText()).trim() }));
        expect(await overflow(page)).toBeLessThanOrEqual(0);

        await press(page, question.locator("button[data-app-recall-cancel]"), viewport.phone);
        await question.waitFor({ state: "detached", timeout: 10_000 });
        expect(await relayed()).toEqual({ status: 200, code: null });

        // Gone through, the row says the app is recalled and offers the lift in its place.
        await press(page, row.locator("button[data-app-recall]"), viewport.phone);
        await press(page, row.locator("button[data-app-recall-confirm]"), viewport.phone);
        await row.locator("[data-app-state]", { hasText: wording("apps.label.recalled") }).waitFor({ timeout: 20_000 });
        await row.locator("button[data-app-lift]").waitFor({ timeout: 10_000 });
        expect(await row.locator("button[data-app-lock]").isDisabled()).toBe(true);
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

        // A tab declaring nothing at the platform says so in one line, the platform still chosen.
        await press(page, page.getByRole("tab", { name: wording("roster.label.tab") }), viewport.phone);
        await page.waitForURL((url) => url.searchParams.get("tab") === "people" && url.searchParams.get("company") === "platform", { timeout: 15_000 });
        expect(await page.locator("[data-organization-link-none]").innerText({ timeout: 10_000 })).toBe(wording("organization.label.platform_none"));
        expect(await overflow(page)).toBeLessThanOrEqual(0);
      } finally {
        await admin.close();
        await member.close();
      }
    }, 120_000);

    test(`a company's offer is withheld and given back on its own row, at ${viewport.width}px`, async () => {
      const admin = await contextFor(ADMINISTRATOR.name, viewport.width, viewport.height, viewport.phone);

      try {
        const page = await admin.newPage();

        await page.goto(`${origin}/organization?company=${company}&tab=apps`, { waitUntil: "load" });
        await standing(page);

        const row = await appRow(page);
        const offer = row.getByRole("switch");

        expect(await offer.getAttribute("aria-checked")).toBe("true");
        expect(await overflow(page)).toBeLessThanOrEqual(0);

        await press(page, offer, viewport.phone);
        await row.locator("[data-app-state]", { hasText: wording("apps.label.not_offered") }).waitFor({ timeout: 20_000 });
        await relaysAs({ status: 403, code: "app-off" });

        await press(page, offer, viewport.phone);
        await row.locator("[data-app-state]", { hasText: wording("apps.label.not_offered") }).waitFor({ state: "detached", timeout: 20_000 });
        await relaysAs({ status: 200, code: null });
      } finally {
        await admin.close();
      }
    }, 120_000);

    test(`a member opens their own node and turns the app off for themselves, at ${viewport.width}px`, async () => {
      const member = await contextFor(MEMBER.name, viewport.width, viewport.height, viewport.phone);

      try {
        const page = await member.newPage();

        // The organisation entry stands for a reader with a user, and the screen opens at their own link of the chain
        // on the tab the address names (docs/web.md, 「Sidebar」, 「Organisation」, the apps tab).
        await page.goto(`${origin}/organization?company=me&tab=apps`, { waitUntil: "load" });
        await standing(page);
        await page.locator('[data-organization-node="me"]').waitFor({ timeout: 10_000 });

        const row = await appRow(page);
        const toggle = row.locator("[data-app-switch]");

        expect(await row.locator("[data-app-state]").innerText()).toBe(wording("apps.label.follows_organization"));
        expect(await overflow(page)).toBeLessThanOrEqual(0);

        await press(page, toggle, viewport.phone);
        await row.locator("[data-app-state]", { hasText: wording("apps.label.own") }).waitFor({ timeout: 20_000 });
        await relaysAs({ status: 403, code: "app-off" });

        // Taken back, the organisation's word stands again.
        await press(page, row.locator("button[data-app-follow]"), viewport.phone);
        await row.locator("[data-app-state]", { hasText: wording("apps.label.follows_organization") }).waitFor({ timeout: 20_000 });
        await relaysAs({ status: 200, code: null });
      } finally {
        await member.close();
      }
    }, 120_000);
  }
});
