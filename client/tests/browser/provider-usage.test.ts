import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { moneyText } from "../../apps/web/app/domain/usage";
import { wording } from "../../apps/web/shared/wording";
import { contrast } from "./contrast";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, Locator, Page } from "playwright-core";

// What each Claude account and provider has left (docs/web.md, 「Organisation」, the supply tab with the platform chosen,
// and 「Administration」, the providers tab): no account marked as the one in use and no line naming it, each account on
// its own row with its windows and their bars, an account that is off with none, and a provider's own road with its
// balance and request allowance on the provider's row of the administration screen. The rows stand on shared columns, a bar beside its figure on a
// wide screen and on a line of its own under it on a phone. The console, with the agency's stand-in answering this
// account's reads with two accounts on, one off and a road keeping a balance, is the one given in
// BMO_CONSOLE_TEST_URL, which tests/support/browser-console.ts stands up. The suite stands up no console, so there it
// skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "provider-usage", password: "fixture-password-3768" };
// A desk wide enough that the reading column beside the organisation tree holds a bar beside its figure.
const DESK = { width: 1600, height: 900 };
const PHONE = { width: 360, height: 780 };
const TEST_MS = 120_000;

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

async function opened(viewport: { width: number; height: number }, colorScheme: "light" | "dark" = "light"): Promise<Page> {
  const context = await browser!.newContext({ viewport, colorScheme });
  const [name, value] = cookie.split("=") as [string, string];

  await context.addCookies([{ name, value, url: origin! }]);

  const page = await context.newPage();

  await page.goto(`${origin}/organization?company=platform&tab=supply`, { waitUntil: "load" });
  await page.locator('[data-account-usage="acct-b"] [data-usage-window]').first().waitFor({ timeout: 30_000 });

  return page;
}

async function box(locator: Locator): Promise<{ x: number; y: number; width: number; height: number }> {
  const found = await locator.boundingBox();

  expect(found).not.toBeNull();

  return found!;
}

async function texts(locator: Locator): Promise<string[]> {
  return (await locator.allTextContents()).map((one) => one.replace(/\s+/g, " ").trim());
}

// What every width holds: the figures where they belong and no mark of the account in use.
async function holdsFigures(page: Page): Promise<void> {
  const spent = page.locator('[data-account-usage="acct-a"]');
  const both = page.locator('[data-account-usage="acct-b"]');

  expect(await texts(spent.locator("[data-usage-window] dt"))).toEqual([wording("usage.label.window_weekly")]);
  expect(await texts(spent.locator("[data-usage-window] dd > span").first())).toEqual(["3%"]);
  expect(await texts(both.locator("[data-usage-window] dt"))).toEqual([wording("usage.label.window_session"), wording("usage.label.window_weekly")]);
  expect((await texts(both.locator("[data-usage-window] dd > span:first-of-type"))).slice(0, 2)).toEqual(["75%", "84%"]);
  // Each window says how long is left until it resets.
  for (const reset of await texts(both.locator("[data-usage-window] dd > span:last-child"))) expect(reset.length).toBeGreaterThan(0);
  // An account that is off answers nothing, so it stands no figures.
  await expect(page.locator('[data-account-usage="acct-c"]').count()).resolves.toBe(0);

  // No row is marked as the one in use and no line names it: the account runs go out on carries no badge.
  await expect(page.locator("[data-choice-note]").count()).resolves.toBe(0);
  await expect(page.locator('[data-account="acct-b"] [data-account-marks]').count()).resolves.toBe(0);
  // A login never signed in on the agency's machine says so on its row, never standing as signed in.
  expect(await texts(page.locator('[data-account="acct-d"] [data-account-marks]'))).toEqual([wording("agents.label.login_none")]);

  // An account's figures close its row as far from its bottom edge as its name stands from its top, measured inside
  // the hairlines the list parts its rows with.
  const row = page.locator('[data-account="acct-a"]');
  const account = await box(row);
  const [lineAbove, lineBelow] = await row.evaluate((element) => [getComputedStyle(element).borderTopWidth, getComputedStyle(element).borderBottomWidth].map(parseFloat));
  const name = await box(row.locator("> span:nth-child(2) > span:first-child"));
  const figures = await box(page.locator('[data-account-usage="acct-a"] [data-usage-figures]'));
  const above = name.y - (account.y + lineAbove!);
  const below = account.y + account.height - lineBelow! - (figures.y + figures.height);

  expect(Math.abs(above - below)).toBeLessThan(1);

  // Nothing runs past the screen's edge.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

  expect(overflow).toBeLessThanOrEqual(0);
}

// What the providers tab holds: a provider whose figures are its accounts' stands none of its own, and a road's balance
// and allowance stand on its row.
async function providersHold(page: Page): Promise<void> {
  await page.goto(`${origin}/admin`, { waitUntil: "load" });
  await page.locator('[data-provider="deepseek"] [data-provider-usage="road:deepseek"]').waitFor({ timeout: 30_000 });

  await expect(page.locator('[data-provider="claude-code"] [data-provider-usage]').count()).resolves.toBe(0);

  const road = page.locator('[data-provider="deepseek"] [data-provider-usage="road:deepseek"]');

  expect(await texts(road.locator("[data-usage-balance] dd > span").first())).toEqual([moneyText({ amount: 12.5, currency: "USD", seenAt: 0, requests: null })]);
  expect(await texts(road.locator("[data-usage-requests] dt"))).toEqual([wording("usage.label.requests_free_models")]);
  expect(await texts(road.locator("[data-usage-requests] dd > span"))).toEqual([wording("usage.label.requests_left", { left: "988", limit: "1,000" })]);
}

// The bars of one group start on one line and the figures end on one line.
async function sharesColumns(page: Page): Promise<void> {
  const rows = page.locator('[data-account-usage="acct-b"] [data-usage-window]');
  const bars = await Promise.all([0, 1].map((at) => box(rows.nth(at).locator('[data-slot="root"]').first())));
  const shares = await Promise.all([0, 1].map((at) => box(rows.nth(at).locator("dd > span").first())));

  expect(Math.abs(bars[0]!.x - bars[1]!.x)).toBeLessThan(1);
  expect(Math.abs(shares[0]!.x + shares[0]!.width - (shares[1]!.x + shares[1]!.width))).toBeLessThan(1);
}

// Every word of the figures reads at 4.5:1 or better on the tab's ground, in the light theme and the dark one.
async function readable(page: Page): Promise<void> {
  const read = await contrast(page, "[data-usage-figures] dt, [data-usage-figures] dd > span");

  expect(read.length).toBeGreaterThan(5);
  for (const one of read) expect({ text: one.text, readable: one.ratio >= 4.5 }).toEqual({ text: one.text, readable: true });
}

describe.skipIf(!origin || !touchReady())("what the platform's supply and the providers tab say each account and provider has left", () => {
  test("on a desk, each bar beside its figure on the row's own line", async () => {
    const page = await opened(DESK);

    try {
      await holdsFigures(page);
      await sharesColumns(page);
      await readable(page);

      const row = page.locator('[data-account-usage="acct-b"] [data-usage-window]').first();
      const bar = await box(row.locator('[data-slot="root"]').first());
      const share = await box(row.locator("dd > span").first());

      expect(bar.x + bar.width).toBeLessThanOrEqual(share.x);
      expect(Math.abs(bar.y + bar.height / 2 - (share.y + share.height / 2))).toBeLessThan(4);

      // The hour a window turns over at is in the shared tooltip on how long is left of it.
      await row.locator("dd > span").last().hover();
      const clock = wording("usage.label.reset_at", { month: "1", date: "1", weekday: "W", hour: "0", minute: "0" });
      const shape = new RegExp(`^${clock.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/1|W|0/g, ".+")}$`);

      expect((await page.getByRole("tooltip").first().textContent())?.trim()).toMatch(shape);
      await providersHold(page);
    } finally {
      await page.context().close();
    }
  }, TEST_MS);

  test("on a phone, each bar on a line of its own under its figure", async () => {
    const page = await opened(PHONE, "dark");

    try {
      await holdsFigures(page);
      await sharesColumns(page);
      await readable(page);

      const row = page.locator('[data-account-usage="acct-b"] [data-usage-window]').first();
      const bar = await box(row.locator('[data-slot="root"]').first());
      const share = await box(row.locator("dd > span").first());

      expect(bar.y).toBeGreaterThanOrEqual(share.y + share.height);

      // The title bar's panel stands the same figures, each bar under its row, inside the panel's width.
      await page.getByRole("button", { name: wording("usage.title.remaining"), exact: true }).first().click();

      const panel = page.locator("[data-usage-figures]").filter({ has: page.locator("[data-usage-window]") }).last();

      await panel.waitFor({ timeout: 10_000 });

      const panelRow = panel.locator("[data-usage-window]").first();
      const panelBar = await box(panelRow.locator('[data-slot="root"]').first());
      const panelShare = await box(panelRow.locator("dd > span").first());

      expect(panelBar.y).toBeGreaterThanOrEqual(panelShare.y + panelShare.height);
      await expect(panel.evaluate((element) => element.scrollWidth - element.clientWidth)).resolves.toBeLessThanOrEqual(0);
      expect(panelBar.x + panelBar.width).toBeLessThanOrEqual(PHONE.width);
      await providersHold(page);
    } finally {
      await page.context().close();
    }
  }, TEST_MS);
});
