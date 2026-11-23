import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";

import type { Browser, BrowserContext, Locator, Page } from "playwright-core";

// What a person's organisation may know of them (docs/web.md, 「Settings」, the account section's shared information; docs/accounts.md, 「A unit's
// org memory」): the account section's group lists the shared memories about the reader in their home unit's org
// memory, adds one through its form and deletes one after asking; and the org memory tab's form offers the people of
// the unit, writing a memory about one of them that its row then names. Each is worked at a desk's width and a
// phone's, every control pressed where it stands and nothing reaching past the window.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up, whose brain
// stand-in keeps the org memories written (tests/support/org-brain.ts).

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "shared-info", password: "fixture-password-4113" };
const RUN = Date.now().toString(36);

let browser: Browser | null = null;
let cookie = "";
let team = 0;
let company = 0;

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

  cookie = login.headers.get("set-cookie")!.split(";")[0]!;

  // A company and a team under it, named for this run, the reader standing in the team.
  company = (await call<{ id: number }>("/api/organization/units", "POST", { name: `shared-company-${RUN}`, parent: null })).id;
  team = (await call<{ id: number }>("/api/organization/units", "POST", { name: `shared-team-${RUN}`, parent: company })).id;

  const user = (await call<{ user: string; name: string }[]>("/api/users", "GET")).find((one) => one.name === ACCOUNT.name)!.user;

  await call(`/api/organization/users/${encodeURIComponent(user)}/unit`, "PUT", { unit: team });
  browser = await chromium.launch();
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();
}, BROWSER_HOOK_MS);

async function contextFor(width: number, height: number): Promise<BrowserContext> {
  const context = await browser!.newContext({ viewport: { width, height }, serviceWorkers: "block", reducedMotion: "reduce" });
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

  return context;
}

async function standing(page: Page): Promise<void> {
  await page.waitForFunction(() => window.useNuxtApp?.().isHydrating === false, null, { timeout: 30_000 });
}

// How far the page's widest box stands past the window.
async function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

// Whether a press on the control's middle reaches it, nothing standing over it, once it is scrolled into view.
async function reachable(control: Locator): Promise<true | string> {
  await control.scrollIntoViewIfNeeded();

  return control.evaluate(async (element) => {
    await Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => undefined)));

    const box = element.getBoundingClientRect();
    const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);

    return top !== null && (element === top || element.contains(top)) ? true : (top?.outerHTML.slice(0, 160) ?? "nothing");
  });
}

describe.skipIf(!origin || !touchReady())("what the organisation may know of a person", () => {
  for (const [width, height] of [[1280, 900], [360, 780]] as const) {
    test(`the account section adds and deletes the reader's own shared information, at ${width}px`, async () => {
      const context = await contextFor(width, height);
      const text = `Reached by chat first ${width}`;

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/rooms?settings=account`, { waitUntil: "load" });
        await standing(page);

        const group = page.locator("[data-shared-info]");
        const add = group.locator("[data-shared-info-add]");

        await add.waitFor({ timeout: 20_000 });
        await page.waitForFunction(() => !document.querySelector("[data-shared-info-add]")?.hasAttribute("disabled"), null, { timeout: 20_000 });
        expect(await reachable(add)).toBe(true);
        expect(await overflow(page)).toBeLessThanOrEqual(0);

        await add.click();
        await page.locator("[data-shared-info-text]").fill(text);

        const save = page.locator("[data-shared-info-save]");

        expect(await reachable(save)).toBe(true);
        await save.click();

        const row = group.locator("[data-shared-info-row]", { hasText: text });

        await row.waitFor({ timeout: 20_000 });
        await page.locator("[data-shared-info-text]").waitFor({ state: "detached", timeout: 20_000 });

        const drop = row.locator("[data-shared-info-delete]");

        expect(await reachable(drop)).toBe(true);
        await drop.click();
        await page.getByRole("button", { name: wording("common.action.delete"), exact: true }).last().click();
        await row.waitFor({ state: "detached", timeout: 20_000 });
        expect(await overflow(page)).toBeLessThanOrEqual(0);
      } finally {
        await context.close();
      }
    }, 120_000);

    test(`the org memory form writes a memory about a person of the unit, which its row names, at ${width}px`, async () => {
      const context = await contextFor(width, height);
      const text = `Leads the site team ${width}`;

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/organization?tab=memory&company=${company}&unit=${team}`, { waitUntil: "load" });
        await standing(page);
        await page.locator("[data-org-memory-own]").waitFor({ timeout: 20_000 });

        const add = page.getByRole("button", { name: wording("org_memory.action.add"), exact: true }).first();

        expect(await reachable(add)).toBe(true);
        await add.click();
        await page.locator("[data-org-memory-text]").fill(text);

        const person = page.locator("[data-org-memory-person]");

        expect(await reachable(person)).toBe(true);
        await person.click();
        await page.getByRole("option", { name: ACCOUNT.name }).first().click();

        const save = page.locator("[data-org-memory-save]");

        expect(await reachable(save)).toBe(true);
        await save.click();

        const row = page.locator("[data-org-memory-row]", { hasText: text });

        await row.waitFor({ timeout: 20_000 });
        expect(await row.locator("[data-org-memory-person-line]").innerText()).toBe(wording("org_memory.label.person_line", { name: ACCOUNT.name }));
        expect(await overflow(page)).toBeLessThanOrEqual(0);
      } finally {
        await context.close();
      }
    }, 120_000);
  }
});
