import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";

import type { Browser, Locator, Page } from "playwright-core";

// The platform administrator's permanent delete of a person (docs/web.md, the organisation screen's permanent delete):
// opened from the person's row on the organisation chart, the dialog reads each unit's count in the pack's words, the
// way through stays shut until the person's name is typed exactly and the leave asked for is chosen, and once run it
// says what each unit removed. A member's chart offers no such mark, and the route answers them as if nothing stood
// there. Each width deletes a person of its own, at a desk's width and a phone's, and at the phone's nothing stands
// over the control pressed.
//
// It drives the console tests/support/browser-console.ts stands up, whose content units answer their removal routes
// (tests/support/removal-units.ts) and whose account service removes the person for good on its scratch database. The
// suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ADMINISTRATOR = { name: "permanent-delete", password: "fixture-password-3611" };
const MEMBER = { name: "org-member", password: "fixture-password-2667" };
const TARGETS: Record<number, { name: string; password: string }> = {
  1280: { name: "removal-target-1280", password: "fixture-password-3620" },
  360: { name: "removal-target-360", password: "fixture-password-3621" }
};
const RUN = Date.now().toString(36);

let browser: Browser | null = null;
let cookie = "";
let memberCookie = "";
let unit = 0;
const users: Record<string, string> = {};

async function signIn(account: { name: string; password: string }): Promise<string> {
  const login = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(account) });

  expect(login.ok).toBe(true);

  return login.headers.get("set-cookie")!.split(";")[0]!;
}

async function call<T>(path: string, method: string, body?: unknown, as = cookie): Promise<{ status: number; body: T }> {
  const answer = await fetch(`${origin}${path}`, { method, headers: { cookie: as, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

  return { status: answer.status, body: (answer.status === 204 ? null : await answer.json().catch(() => null)) as T };
}

beforeAll(async () => {
  if (!origin || !touchReady()) return;

  cookie = await signIn(ADMINISTRATOR);
  memberCookie = await signIn(MEMBER);

  // A company of this run with both people standing in it, neither marked left.
  unit = (await call<{ id: number }>("/api/organization/units", "POST", { name: `removal-company-${RUN}`, parent: null })).body.id;

  const listed = (await call<{ user: string; name: string }[]>("/api/users", "GET")).body;

  for (const target of Object.values(TARGETS)) {
    const user = listed.find((one) => one.name === target.name)!.user;

    users[target.name] = user;
    expect((await call(`/api/organization/users/${encodeURIComponent(user)}/unit`, "PUT", { unit })).status).toBe(200);
  }

  browser = await chromium.launch();
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();
}, BROWSER_HOOK_MS);

async function standing(page: Page): Promise<void> {
  await page.waitForFunction(() => window.useNuxtApp?.().isHydrating === false, null, { timeout: 30_000 });
}

async function opened(width: number, as: string): Promise<Page> {
  const context = await browser!.newContext({ viewport: { width, height: 900 }, serviceWorkers: "block", reducedMotion: "reduce" });
  const at = as.indexOf("=");

  await context.addCookies([{ name: as.slice(0, at), value: as.slice(at + 1), url: origin! }]);

  return await context.newPage();
}

// Whether what a finger lands on at the control's middle is the control itself or a part of it.
async function uncovered(control: Locator): Promise<boolean> {
  return await control.evaluate((one) => {
    const box = one.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);

    return hit !== null && (hit === one || one.contains(hit));
  });
}

async function overflow(page: Page): Promise<number> {
  return await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

describe.skipIf(!origin || !touchReady())("the permanent delete of a person", () => {
  for (const width of [1280, 360] as const) {
    test(`reads each unit's count, opens once the name is typed, and says what each unit removed, at ${width}px`, async () => {
      const target = TARGETS[width]!;
      const user = users[target.name]!;
      const page = await opened(width, cookie);

      try {
        await page.goto(`${origin}/organization?company=${unit}`, { waitUntil: "load" });
        await standing(page);

        const mark = page.locator(`[data-member-row="${user}"] [data-member-delete]`);

        await mark.waitFor({ timeout: 20_000 });
        await mark.scrollIntoViewIfNeeded();
        expect(await uncovered(mark)).toBe(true);
        await mark.click();

        const dialog = page.getByRole("dialog");

        await dialog.locator('[data-removal-unit="web"]').waitFor({ timeout: 20_000 });
        expect(await dialog.getByText(wording("removal.title.account", { name: target.name }), { exact: true }).count()).toBeGreaterThan(0);

        // Each unit under its name, each kind in its word, a kind the pack holds no word for among the other records,
        // and no key of a kind standing.
        const agency = dialog.locator('[data-removal-unit="agency"]');

        expect(await agency.getByText(wording("removal.label.unit.agency"), { exact: true }).count()).toBe(1);
        expect(await agency.getByText(wording("removal.label.kind.supervisors"), { exact: true }).count()).toBe(1);
        expect(await agency.getByText(wording("removal.label.kind.other"), { exact: true }).count()).toBe(1);
        expect(await dialog.locator('[data-removal-unit="receiver"]').getByText("1,250", { exact: true }).count()).toBe(1);
        expect(await dialog.getByText("unheard-of").count()).toBe(0);
        expect(await dialog.getByText("slot-requests").count()).toBe(0);

        // The way through stays shut until the leave is chosen and the name typed exactly.
        const run = dialog.locator("[data-removal-run]");
        const typed = dialog.locator("[data-removal-confirm] input, input[data-removal-confirm]").first();

        expect(await run.isDisabled()).toBe(true);
        await typed.fill(target.name);
        expect(await run.isDisabled()).toBe(true);
        await dialog.locator("[data-removal-leave]").click();
        await typed.fill(`${target.name}x`);
        expect(await run.isDisabled()).toBe(true);
        await typed.fill(target.name);
        expect(await run.isDisabled()).toBe(false);
        expect(await overflow(page)).toBeLessThanOrEqual(0);

        await run.scrollIntoViewIfNeeded();
        expect(await uncovered(run)).toBe(true);
        await run.click();

        const result = dialog.locator("[data-removal-result]");

        await result.waitFor({ timeout: 60_000 });
        expect(await result.innerText()).toBe(wording("removal.label.finished"));
        expect(await dialog.locator('[data-removal-step="agency"]').getByText(wording("removal.label.removed"), { exact: true }).count()).toBe(1);
        expect(await dialog.locator('[data-removal-step="web"]').getByText(wording("removal.label.removed"), { exact: true }).count()).toBe(1);

        // The account no longer stands.
        expect((await call(`/api/organization/users/${encodeURIComponent(user)}/removal`, "GET")).status).toBe(404);
      } finally {
        await page.context().close();
      }
    });
  }

  test("is offered to nobody but the platform administrator", async () => {
    const page = await opened(360, memberCookie);

    try {
      await page.goto(`${origin}/organization?company=${unit}`, { waitUntil: "load" });
      await standing(page);
      expect(await page.locator("[data-member-delete], [data-unit-delete]").count()).toBe(0);
    } finally {
      await page.context().close();
    }

    expect((await call(`/api/organization/units/${unit}/removal`, "GET", undefined, memberCookie)).status).toBe(404);
  });
});
