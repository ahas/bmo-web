import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, fingerOn, touchReady } from "./touch";

import type { Browser, BrowserContext, Locator, Page } from "playwright-core";

// One setting on one tab, drawn by the reader's reach (docs/web.md, 「Organisation」, the agents, apps and supply tabs):
// the administrator reads the platform's own supply and agents at the platform node, opens organisation supply and a personal
// app's network to a company from its node and takes them back, and reads a lock set at a company named by that
// company on a unit below it; a member follows the settings' doors to their own node, where their agents and their
// supply stand. Every press lands on what the browser draws at that point, a finger's tap at a phone's width and a
// mouse's click at a desk's, and nothing runs past the screen sideways.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ADMINISTRATOR = { name: "axis-admin", password: "fixture-password-4121" };
const MEMBER = { name: "axis-reader", password: "fixture-password-4122" };
const RUN = Date.now().toString(36);
const COMPANY_NAME = `axis-company-${RUN}`;

const WIDTHS = [
  { width: 360, height: 740, phone: true },
  { width: 1280, height: 800, phone: false }
] as const;

let browser: Browser | null = null;
const cookies = new Map<string, string>();
let company = 0;
let team = 0;

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

  // A company of this run's with a team under it, the member standing in the team.
  company = (await administer<{ id: number }>("/api/organization/units", "POST", { name: COMPANY_NAME, parent: null })).id;
  team = (await administer<{ id: number }>("/api/organization/units", "POST", { name: `axis-team-${RUN}`, parent: company })).id;

  const users = await administer<{ user: string; name: string }[]>("/api/users", "GET");
  const member = encodeURIComponent(users.find((one) => one.name === MEMBER.name)!.user);

  await administer(`/api/organization/users/${member}/unit`, "PUT", { unit: team });

  browser = await chromium.launch();
}, BROWSER_HOOK_MS);

// Whatever a failed test left standing is taken back.
afterAll(async () => {
  if (company !== 0) {
    await call(ADMINISTRATOR.name, `/api/organization/units/${company}/agent-settings`, "PUT", { setting: "persona", delegation: "inherit" }).catch(() => null);
    await call(ADMINISTRATOR.name, `/api/organization/units/${company}/supply/company`, "PUT", { opened: false }).catch(() => null);
    await call(ADMINISTRATOR.name, `/api/organization/units/${company}/personal-apps`, "PUT", { setting: "network", offered: false }).catch(() => null);
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

// The admin's word on a company's organisation supply and a personal app's network, read back as the routes answer them.
async function companyOpened(): Promise<boolean | null> {
  return (await administer<{ companyOpened: boolean | null }>(`/api/organization/units/${company}/supply?company=true`, "GET")).companyOpened;
}

async function networkOffered(): Promise<boolean | null> {
  const view = await administer<{ settings: { setting: string; offered: boolean | null }[] }>(`/api/organization/units/${company}/personal-apps?company=true`, "GET");

  return view.settings.find((one) => one.setting === "network")?.offered ?? null;
}

async function until(read: () => Promise<unknown>, expected: unknown): Promise<void> {
  const ends = Date.now() + 20_000;
  let now = await read();

  while (Date.now() < ends && now !== expected) {
    await new Promise((done) => setTimeout(done, 200));
    now = await read();
  }

  expect(now).toBe(expected);
}

describe.skipIf(!origin || !touchReady())("one setting on one tab, drawn by the reader's reach", () => {
  for (const viewport of WIDTHS) {
    test(`the platform's own supply and agents stand at the platform node, at ${viewport.width}px`, async () => {
      const admin = await contextFor(ADMINISTRATOR.name, viewport.width, viewport.height, viewport.phone);

      try {
        const page = await admin.newPage();

        await page.goto(`${origin}/organization?company=${company}&tab=supply`, { waitUntil: "load" });
        await standing(page);
        await page.locator("[data-org-supply]").waitFor({ timeout: 20_000 });

        // The platform chosen in the tree, the supply tab staying open on the platform's own supply.
        await chooseNode(page, "string:platform", viewport.phone);
        await page.waitForURL((url) => url.searchParams.get("company") === "platform" && url.searchParams.get("tab") === "supply", { timeout: 15_000 });
        await page.locator("[data-org-platform-supply]").waitFor({ timeout: 10_000 });
        await page.locator("[data-platform-source]").first().waitFor({ timeout: 20_000 });
        await page.locator("[data-platform-plans]").waitFor({ timeout: 20_000 });
        await page.locator("[data-platform-keys]").waitFor({ timeout: 20_000 });
        await page.locator("#accounts").waitFor({ timeout: 20_000 });
        expect(await overflow(page)).toBeLessThanOrEqual(0);

        // The plans' own add opens the plan's form at the group's heading.
        await press(page, page.locator("[data-plan-add]"), viewport.phone);
        await page.getByRole("dialog").waitFor({ timeout: 10_000 });
        await page.keyboard.press("Escape");
        await page.getByRole("dialog").waitFor({ state: "detached", timeout: 10_000 });

        // The agents tab at the same node: the platform's own BMO default and who may personalise one.
        await page.goto(`${origin}/organization?company=platform&tab=agents`, { waitUntil: "load" });
        await standing(page);
        await page.locator("[data-org-platform-agents]").waitFor({ timeout: 20_000 });
        await page.locator("[data-bmo-platform-default]").waitFor({ timeout: 20_000 });
        await page.locator("[data-org-personalize]").waitFor({ timeout: 20_000 });
        expect(await overflow(page)).toBeLessThanOrEqual(0);
      } finally {
        await admin.close();
      }
    }, 120_000);

    test(`a company's organisation supply and personal apps' network are opened from its node and taken back, at ${viewport.width}px`, async () => {
      const admin = await contextFor(ADMINISTRATOR.name, viewport.width, viewport.height, viewport.phone);

      try {
        const page = await admin.newPage();

        await page.goto(`${origin}/organization?company=${company}&tab=supply`, { waitUntil: "load" });
        await standing(page);

        const offer = page.locator("[data-agent-supply-company]").getByRole("switch");

        await offer.waitFor({ timeout: 20_000 });
        expect(await overflow(page)).toBeLessThanOrEqual(0);
        await press(page, offer, viewport.phone);
        await until(companyOpened, true);
        await press(page, offer, viewport.phone);
        await until(companyOpened, false);

        await page.goto(`${origin}/organization?company=${company}&tab=apps`, { waitUntil: "load" });
        await standing(page);

        const network = page.locator('[data-personal-app-setting="network"] [data-personal-app-offered]');

        await network.waitFor({ timeout: 20_000 });
        expect(await overflow(page)).toBeLessThanOrEqual(0);
        await press(page, network, viewport.phone);
        await until(networkOffered, true);
        await press(page, network, viewport.phone);
        await until(networkOffered, false);
      } finally {
        await admin.close();
      }
    }, 120_000);

    test(`a lock set at a company reads by the company's name on a unit below it, at ${viewport.width}px`, async () => {
      const admin = await contextFor(ADMINISTRATOR.name, viewport.width, viewport.height, viewport.phone);

      try {
        await administer(`/api/organization/units/${company}/agent-settings`, "PUT", { setting: "persona", delegation: "lock" });

        const page = await admin.newPage();

        await page.goto(`${origin}/organization?company=${company}&tab=agents`, { waitUntil: "load" });
        await standing(page);
        await page.locator("[data-org-persona]").waitFor({ timeout: 20_000 });

        await chooseNode(page, `number:${team}`, viewport.phone);
        await page.waitForURL((url) => url.searchParams.get("unit") === String(team), { timeout: 15_000 });
        await page.locator("[data-org-persona]", { hasText: wording("org_agents.label.decided_named", { name: COMPANY_NAME }) }).waitFor({ timeout: 20_000 });
        expect(await overflow(page)).toBeLessThanOrEqual(0);
      } finally {
        await call(ADMINISTRATOR.name, `/api/organization/units/${company}/agent-settings`, "PUT", { setting: "persona", delegation: "inherit" });
        await admin.close();
      }
    }, 120_000);

    test(`a member follows the settings' doors to their own agents and supply, at ${viewport.width}px`, async () => {
      const member = await contextFor(MEMBER.name, viewport.width, viewport.height, viewport.phone);

      try {
        const page = await member.newPage();

        for (const { key, tab, view } of [
          { key: "agent", tab: "agents", view: "[data-org-person-agents]" },
          { key: "supply", tab: "supply", view: "[data-org-person-supply]" }
        ]) {
          await page.goto(`${origin}/?settings=${key}`, { waitUntil: "load" });
          await standing(page);

          const door = page.locator(`[data-settings-door="${tab}"]`);

          await door.waitFor({ timeout: 20_000 });
          await press(page, door, viewport.phone);
          await page.waitForURL((url) => url.pathname.endsWith("/organization") && url.searchParams.get("company") === "me" && url.searchParams.get("tab") === tab, { timeout: 15_000 });
          await page.locator('[data-organization-node="me"]').waitFor({ timeout: 20_000 });
          await page.getByRole("dialog").waitFor({ state: "detached", timeout: 10_000 });
          await page.locator(view).waitFor({ timeout: 20_000 });
          expect(await overflow(page)).toBeLessThanOrEqual(0);
        }
      } finally {
        await member.close();
      }
    }, 120_000);
  }
});
