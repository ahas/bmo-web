import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";

import type { Browser, BrowserContext, Page } from "playwright-core";

// A console dialog holding a date field answers Esc pressed inside one of the field's segments as it answers Esc
// anywhere else in it, and as it answers the back gesture (bmo-ui's docs/components.md, its back gesture and its
// forms): left untouched it closes at once, and holding a change it asks before the change is thrown away. The
// library's date field keeps that key to itself unless the reka-ui patch under patches/ is installed, so this reads
// the console as it is installed. The dialog is the organisation chart's acting appointment, whose last day is a date
// field; its person is the change. The date picker of a room's day heading names its paging buttons in the console's
// own words and stands inside the screen. A desktop's width and a phone's.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "date-escape", password: "fixture-password-3374" };
const RUN = Date.now().toString(36);
const WIDTHS = [
  { width: 1280, height: 800 },
  { width: 360, height: 780 }
];
// A room the console's stand-in receiver holds, its lines said on days past.
const ROOM = -9_002_000_000_003;

let browser: Browser | null = null;
let cookie = "";
let unit = 0;

async function call<T>(path: string, method: string, body?: unknown): Promise<T> {
  const answer = await fetch(`${origin}${path}`, {
    method,
    headers: { cookie, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  expect({ path, ok: answer.ok }).toEqual({ path, ok: true });

  return (answer.status === 204 ? null : await answer.json().catch(() => null)) as T;
}

beforeAll(async () => {
  if (!origin || !touchReady()) return;

  const login = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ACCOUNT) });

  expect(login.ok).toBe(true);
  cookie = login.headers.get("set-cookie")!.split(";")[0]!;

  // A company of this run with the account standing in it, so the appointment has a person to name.
  unit = (await call<{ id: number }>("/api/organization/units", "POST", { name: `escape-${RUN}`, parent: null })).id;
  const self = (await call<{ user: string; name: string }[]>("/api/users", "GET")).find((one) => one.name === ACCOUNT.name)!.user;
  await call(`/api/organization/users/${encodeURIComponent(self)}/unit`, "PUT", { unit });

  browser = await chromium.launch();
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();
}, BROWSER_HOOK_MS);

async function contextAt(width: number, height: number): Promise<BrowserContext> {
  const context = await browser!.newContext({ viewport: { width, height }, serviceWorkers: "block", reducedMotion: "reduce" });
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

  return context;
}

async function standing(page: Page): Promise<void> {
  await page.waitForFunction(() => window.useNuxtApp?.().isHydrating === false, null, { timeout: 30_000 });
}

// The appointment's dialog opened over the chosen unit, its date field's first segment holding the keyboard.
async function appointment(page: Page): Promise<void> {
  await page.locator("[data-unit-appoint]").click();
  const segment = page.locator('[data-acting-end] [role="spinbutton"]').first();

  await segment.waitFor({ timeout: 10_000 });
  await segment.focus();
  expect(await segment.evaluate((one) => one === document.activeElement)).toBe(true);
}

function discard(page: Page) {
  return page.getByRole("button", { name: wording("common.action.discard"), exact: true });
}

describe.skipIf(!origin || !touchReady())("Esc in a date field's segment inside a console dialog", () => {
  for (const { width, height } of WIDTHS) {
    test(`an untouched dialog closes at once on Esc and on back, and one holding a change asks, at ${width}px`, async () => {
      const context = await contextAt(width, height);
      const page = await context.newPage();

      try {
        await page.goto(`${origin}/organization?unit=${unit}`, { waitUntil: "load" });
        await standing(page);

        await appointment(page);
        await page.keyboard.press("Escape");
        await page.locator("[data-acting-end]").waitFor({ state: "detached", timeout: 10_000 });
        expect(await discard(page).count()).toBe(0);

        await appointment(page);
        await page.locator("[data-acting-person]").click();
        await page.getByRole("option", { name: ACCOUNT.name }).first().click();
        await page.getByRole("listbox").waitFor({ state: "detached", timeout: 10_000 });
        await page.locator('[data-acting-end] [role="spinbutton"]').first().click();
        await page.keyboard.press("Escape");
        await discard(page).waitFor({ timeout: 10_000 });

        // Every way out of the question keeps the dialog, Esc among them; throwing the change away closes it.
        await page.keyboard.press("Escape");
        await discard(page).waitFor({ state: "detached", timeout: 10_000 });
        expect(await page.locator("[data-acting-end]").count()).toBe(1);
        await page.locator('[data-acting-end] [role="spinbutton"]').first().click();
        await page.keyboard.press("Escape");
        await discard(page).click();
        await page.locator("[data-acting-end]").waitFor({ state: "detached", timeout: 10_000 });

        // The back gesture answers the same: an untouched dialog goes at once, one holding a change asks, back on the
        // question keeps the dialog, and throwing the change away closes it.
        await appointment(page);
        await page.goBack();
        await page.locator("[data-acting-end]").waitFor({ state: "detached", timeout: 10_000 });
        expect(await discard(page).count()).toBe(0);

        await appointment(page);
        await page.locator("[data-acting-person]").click();
        await page.getByRole("option", { name: ACCOUNT.name }).first().click();
        await page.getByRole("listbox").waitFor({ state: "detached", timeout: 10_000 });
        await page.goBack();
        await discard(page).waitFor({ timeout: 10_000 });
        await page.goBack();
        await discard(page).waitFor({ state: "detached", timeout: 10_000 });
        expect(await page.locator("[data-acting-end]").count()).toBe(1);
        await page.goBack();
        await discard(page).click();
        await page.locator("[data-acting-end]").waitFor({ state: "detached", timeout: 10_000 });
        expect(new URL(page.url()).pathname).toEndWith("/organization");
      } finally {
        await context.close();
      }
    }, 60_000);

    test(`a room's date picker names its paging buttons in the console's words, at ${width}px`, async () => {
      const context = await contextAt(width, height);
      const page = await context.newPage();

      try {
        await page.goto(`${origin}/rooms/${ROOM}`, { waitUntil: "load" });
        await standing(page);

        // The heading of the room's latest day, named by the words around the day it reads.
        const [before, after] = wording("room.aria.jump_to_date", { name: "\u0000" }).split("\u0000");
        const around = [before ? `[aria-label^="${before}"]` : "", after ? `[aria-label$="${after}"]` : ""].join("");
        const heading = page.locator(`button${around}`).last();

        await heading.click({ timeout: 20_000 });

        const calendar = page.locator("[data-reka-popper-content-wrapper]").last();
        const paging = calendar.locator("button[aria-label][data-tooltip]");

        await paging.nth(3).waitFor({ timeout: 10_000 });
        const named = await paging.evaluateAll((all) => all.map((one) => one.getAttribute("aria-label")));

        expect(named).toEqual(["common.action.previous_year", "common.action.previous_month", "common.action.next_month", "common.action.next_year"].map((key) => wording(key)));

        // The calendar stands whole inside the screen.
        const box = (await calendar.boundingBox())!;

        expect({ left: box.x >= 0, right: box.x + box.width <= width }).toEqual({ left: true, right: true });
      } finally {
        await context.close();
      }
    }, 60_000);
  }
});
