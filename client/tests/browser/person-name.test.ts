import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";

import type { Browser, BrowserContext, Page, Route } from "playwright-core";

// The person's name on the console's screens (docs/accounts.md, 「Users and senders」; docs/web.md, 「The join page」,
// 「Settings」 and 「Organisation」): the join page offers the name the invitation was made with first and takes no
// account without one; the profile form takes the name first and the user menu reads it once saved; the invitation
// dialog takes it first and the open link is listed by it. Each is read at a desk's width and a phone's, with
// nothing wider than the window. The test console stands no jake hub, so the invitation's own calls are answered
// here; what the service keeps of a name is its own tests'.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ADMINISTRATOR = { name: "person-name", password: "fixture-password-3096" };
const MEMBER = { name: "name-member", password: "fixture-password-3097" };
const TOKEN = "token-3096";
const SIZES = [[1280, 900], [412, 915]] as const;
const UNIT = { id: 1, name: "Company A" };

let browser: Browser | null = null;
const cookies = new Map<string, string>();

beforeAll(async () => {
  if (!origin || !touchReady()) return;

  for (const account of [ADMINISTRATOR, MEMBER]) {
    const answer = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(account) });

    expect(answer.ok).toBe(true);
    cookies.set(account.name, answer.headers.get("set-cookie")!.split(";")[0]!);
  }

  browser = await chromium.launch();
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();
}, BROWSER_HOOK_MS);

async function contextFor(width: number, height: number, login: string | null): Promise<BrowserContext> {
  const context = await browser!.newContext({ viewport: { width, height }, colorScheme: "light", serviceWorkers: "block", reducedMotion: "reduce" });
  const cookie = login === null ? null : cookies.get(login)!;

  if (cookie !== null) {
    const at = cookie.indexOf("=");

    await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
  }

  return context;
}

async function standing(page: Page): Promise<void> {
  await page.waitForFunction(() => window.useNuxtApp?.().isHydrating === false, null, { timeout: 30_000 });
}

// How far the page's widest box stands past the window.
async function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

// The labels of a form's fields, in the order they stand.
async function fieldLabels(form: ReturnType<Page["locator"]>): Promise<string[]> {
  return (await form.locator("label").allInnerTexts()).map((text) => text.replace(/\s*\*$/, "").trim());
}

const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

describe.skipIf(!origin || !touchReady())("the person's name", () => {
  for (const [width, height] of SIZES) {
    test(`the join page offers the invitation's name first and takes no account without one, at ${width}px`, async () => {
      const context = await contextFor(width, height, null);

      try {
        const page = await context.newPage();
        const accepted: unknown[] = [];

        await page.route(new RegExp(`/api/join/${TOKEN}$`), (route) => json(route, { unit: UNIT, company: UNIT, head: false, fullName: "Person A", expiresAt: Date.now() + 3_600_000, state: "open" }));
        await page.route(new RegExp(`/api/join/${TOKEN}/accept$`), (route) => {
          accepted.push(route.request().postDataJSON());

          return json(route, { user: "9", agent: "u9", credential: "u9.credential", hubUrl: "http://hub.invalid", install: { linux: "install-linux", windows: "install-windows" } }, 201);
        });
        await page.route(new RegExp(`/api/join/${TOKEN}/proof$`), (route) => json(route, { active: false }));
        await page.goto(`${origin}/join/${TOKEN}`, { waitUntil: "load" });
        await standing(page);

        const form = page.locator("#join-form");
        const name = form.locator('input[name="fullName"]');

        await name.waitFor({ timeout: 20_000 });
        expect(await fieldLabels(form)).toEqual([wording("join.label.full_name"), wording("app.label.user_id"), wording("app.label.password")]);
        expect(await name.inputValue()).toBe("Person A");
        expect(await overflow(page)).toBeLessThanOrEqual(0);

        // Emptied, the account is not taken and the field says why.
        await name.fill("  ");
        await form.locator('input[name="name"]').fill("person-a");
        await form.locator('input[name="password"]').fill("a password");
        await page.getByRole("button", { name: wording("join.action.accept"), exact: true }).click();
        await page.getByText(wording("join.error.full_name_empty"), { exact: true }).waitFor({ timeout: 10_000 });
        expect(accepted).toEqual([]);

        // Corrected, it goes with the login and the password.
        await name.fill("Person Ay");
        await page.getByRole("button", { name: wording("join.action.accept"), exact: true }).click();
        await page.getByText(wording("join.message.created").split("\n")[0]!).waitFor({ timeout: 10_000 });
        expect(accepted).toEqual([{ fullName: "Person Ay", name: "person-a", password: "a password" }]);
      } finally {
        await context.close();
      }
    }, 120_000);

    test(`the profile takes the person's name first and the user menu reads it once saved, at ${width}px`, async () => {
      const context = await contextFor(width, height, MEMBER.name);

      try {
        const page = await context.newPage();
        const given = `Person M ${width}`;

        await page.goto(`${origin}/rooms?settings=account`, { waitUntil: "load" });
        await standing(page);

        const settings = page.getByRole("dialog").first();
        const row = settings.locator("[data-profile-row]");

        await row.getByRole("button", { name: wording("account.action.change"), exact: true }).click();

        const form = page.locator("#profile-form");
        const name = form.locator('input[name="fullName"]');

        await name.waitFor({ timeout: 20_000 });
        expect((await fieldLabels(form))[0]).toBe(wording("account.label.full_name"));
        expect(await overflow(page)).toBeLessThanOrEqual(0);

        await name.fill(given);
        await page.getByRole("button", { name: wording("common.action.save"), exact: true }).last().click();
        await form.waitFor({ state: "detached", timeout: 20_000 });
        await row.getByText(given).waitFor({ timeout: 10_000 });

        // The user menu at the sidebar's foot names the reader by it once the dialog is closed; on a phone the
        // sidebar is a drawer under the dialog, whose foot is the same menu.
        if (width >= 1024) {
          await page.keyboard.press("Escape");
          await settings.waitFor({ state: "detached", timeout: 10_000 });
          await page.getByRole("button", { name: given, exact: true }).waitFor({ timeout: 20_000 });
        }
      } finally {
        await context.close();
      }
    }, 120_000);

    test(`the invitation dialog takes the person's name first and the open link is listed by it, at ${width}px`, async () => {
      const context = await contextFor(width, height, ADMINISTRATOR.name);

      try {
        const page = await context.newPage();
        const made: unknown[] = [];
        let invites: unknown[] = [];

        await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: origin! });
        await page.route(/\/api\/invites\/units$/, (route) => json(route, [{ id: UNIT.id, name: UNIT.name, company: UNIT }]));
        await page.route(/\/api\/invites$/, (route) => {
          if (route.request().method() === "GET") return json(route, invites);

          const body = route.request().postDataJSON() as { fullName: string };
          const invite = { token: TOKEN, unit: UNIT, company: UNIT, head: false, fullName: body.fullName, expiresAt: Date.now() + 3_600_000 };

          made.push(body);
          invites = [invite];

          return json(route, invite, 201);
        });
        await page.goto(`${origin}/organization?tab=invites`, { waitUntil: "load" });
        await standing(page);
        await page.getByRole("button", { name: wording("invites.label.make"), exact: true }).click();

        const form = page.locator("#invite-form");

        await form.locator('input[name="fullName"]').waitFor({ timeout: 20_000 });
        expect((await fieldLabels(form))[0]).toBe(wording("invites.label.full_name"));
        expect(await overflow(page)).toBeLessThanOrEqual(0);

        await form.locator('input[name="fullName"]').fill(" Person I ");
        await page.getByRole("button", { name: wording("invites.action.make"), exact: true }).click();
        await form.waitFor({ state: "detached", timeout: 20_000 });
        expect(made).toEqual([{ unit: UNIT.id, head: false, hours: 72, fullName: "Person I" }]);

        const listed = page.locator("[data-invite]").first();

        expect((await listed.innerText()).startsWith("Person I")).toBe(true);
      } finally {
        await context.close();
      }
    }, 120_000);
  }
});
