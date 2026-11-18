import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";

import type { Browser, Locator, Page } from "playwright-core";

// Taking a person's machine away in the organisation's machine dialog (docs/web.md, 「Organisation」, the people's
// machine mark): asked where its button stands, as a step the dialog's foot grows rather than a second dialog over it,
// the question naming the machine and what becomes of it, wrapping at word boundaries as the dialog's other lines do,
// the keyboard's place handed to the way out and back, and a mouse press drawing no ring. The way out takes nothing;
// the way through takes the machine away in one call. Each is read at a desk's width and a phone's, with nothing
// wider than the window.
//
// It drives the console tests/support/browser-console.ts stands up, signed in as its administrator; the machine is
// answered in the browser, so no machine hub is asked. The suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "machine-unbind", password: "fixture-password-3583" };
const RUN = Date.now().toString(36);
const MACHINE = "machine-a";

let browser: Browser | null = null;
let cookie = "";
let user = "";
let unit = 0;

async function call<T>(path: string, method: string, body?: unknown): Promise<T> {
  const answer = await fetch(`${origin}${path}`, { method, headers: { cookie, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

  expect({ path, ok: answer.ok }).toEqual({ path, ok: true });

  return (answer.status === 204 ? null : await answer.json().catch(() => null)) as T;
}

beforeAll(async () => {
  if (!origin || !touchReady()) return;

  const login = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ACCOUNT) });

  expect(login.ok).toBe(true);
  cookie = login.headers.get("set-cookie")!.split(";")[0]!;

  // A company of this run with the account standing in it, whose row opens the account's machine dialog.
  unit = (await call<{ id: number }>("/api/organization/units", "POST", { name: `unbind-company-${RUN}`, parent: null })).id;
  user = (await call<{ user: string; name: string }[]>("/api/users", "GET")).find((one) => one.name === ACCOUNT.name)!.user;
  await call(`/api/organization/users/${encodeURIComponent(user)}/unit`, "PUT", { unit });

  browser = await chromium.launch();
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();
}, BROWSER_HOOK_MS);

async function standing(page: Page): Promise<void> {
  await page.waitForFunction(() => window.useNuxtApp?.().isHydrating === false, null, { timeout: 30_000 });
}

// How far the page's widest box stands past the window.
async function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

// Whether the control holds the keyboard's place, and whether it draws the ring there.
async function focusOf(control: Locator): Promise<{ focused: boolean; ring: boolean }> {
  return control.evaluate((one) => ({ focused: document.activeElement === one, ring: one.matches(":focus-visible") }));
}

describe.skipIf(!origin || !touchReady())("taking a person's machine away in the organisation's machine dialog", () => {
  for (const width of [1280, 360] as const) {
    test(`the question stands where its button does, at ${width}px`, async () => {
      const context = await browser!.newContext({ viewport: { width, height: 900 }, serviceWorkers: "block", reducedMotion: "reduce" });
      const at = cookie.indexOf("=");

      await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

      try {
        let machine: Record<string, unknown> = { agent: MACHINE, attached: true, kind: "desktop", left: false, shared: false };
        let removals = 0;

        await context.route(new RegExp(`/api/organization/users/${encodeURIComponent(user)}/node$`), async (route) => {
          if (route.request().method() === "DELETE") {
            removals += 1;
            machine = { agent: null, attached: false, left: false, shared: false };

            return await route.fulfill({ status: 204 });
          }

          return await route.fulfill({ json: machine });
        });

        const page = await context.newPage();

        await page.goto(`${origin}/organization?unit=${unit}`, { waitUntil: "load" });
        await standing(page);
        await page.locator(`[data-member-row="${user}"] [data-member-marks] button`).first().click();

        const dialog = page.getByRole("dialog");
        const press = dialog.locator("[data-machine-unbind]");
        const question = dialog.locator("[data-machine-unbind-ask]");
        const cancel = question.getByRole("button", { name: wording("common.action.cancel"), exact: true });

        await press.waitFor({ timeout: 20_000 });

        // Opened by the mouse, the way out holds the place with no ring, and pressed it takes nothing and hands the
        // place back to the button, still with no ring.
        await press.click();
        await question.waitFor();
        expect(await focusOf(cancel)).toEqual({ focused: true, ring: false });
        await cancel.click();
        await question.waitFor({ state: "detached" });
        expect(await focusOf(press)).toEqual({ focused: true, ring: false });
        expect(removals).toBe(0);

        // Reached and opened from the keyboard, the question takes the foot alone and hands its place to the way out,
        // ringed; closed from it, the place goes back to the button, ringed again.
        await press.focus();
        await page.keyboard.press("Tab");
        await page.keyboard.press("Shift+Tab");
        expect(await focusOf(press)).toEqual({ focused: true, ring: true });
        await page.keyboard.press("Enter");
        await question.getByText(wording("organization.title.unbind", { name: MACHINE }), { exact: true }).waitFor();
        expect(await question.locator(".font-mono").textContent()).toBe(MACHINE);
        expect(await question.textContent()).toContain(wording("organization.message.unbind"));
        expect(await question.textContent()).toContain(wording("machines.message.unbind_desktop"));
        expect(await dialog.locator("[data-machine-share]").count()).toBe(0);
        expect(await question.locator("p").evaluateAll((lines) => lines.map((line) => getComputedStyle(line).wordBreak))).toEqual(["keep-all", "keep-all"]);
        expect(await dialog.getByText(wording("organization.label.machine_shared_help"), { exact: true }).evaluate((line) => getComputedStyle(line).wordBreak)).toBe("keep-all");
        expect(await overflow(page)).toBeLessThanOrEqual(0);
        expect(await focusOf(cancel)).toEqual({ focused: true, ring: true });
        await page.keyboard.press("Enter");
        await question.waitFor({ state: "detached" });
        expect(await focusOf(press)).toEqual({ focused: true, ring: true });
        expect(removals).toBe(0);

        // A press on the dialog's own words puts the mouse back in hand before the way through is pressed.
        await dialog.locator("[data-machine]").click();

        // The way through takes the machine away in one call, and the dialog says it holds none.
        await press.click();
        await question.locator("[data-machine-unbind-confirm]").click();
        await dialog.getByText(wording("organization.label.machine_none"), { exact: true }).waitFor({ timeout: 20_000 });
        expect(removals).toBe(1);
        expect(await press.count()).toBe(0);
        expect(await focusOf(dialog.getByRole("button", { name: wording("organization.action.bind"), exact: true }))).toEqual({ focused: true, ring: false });
      } finally {
        await context.close();
      }
    }, 120_000);
  }
});
