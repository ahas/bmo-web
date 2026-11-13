import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";

import type { Browser, BrowserContext, Page } from "playwright-core";

// The settings dialog holds what a person sets for themselves alone, and the organisation settings screen what is set
// for the whole deployment or for other people, a tab to a section; its units tab stands the units as a tree beside
// the unit chosen, the tree a bottom drawer on a narrow screen (docs/web.md, 「Settings」 and 「Organisation settings」).
// Each is read at a desk's width and a phone's, in light and in dark, by the administrator and by a member who heads
// a unit and one who heads none.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ADMINISTRATOR = { name: "org-settings", password: "fixture-password-2666" };
const MEMBER = { name: "org-member", password: "fixture-password-2667" };
const RUN = Date.now().toString(36);

const PERSONAL = ["settings.label.account", "settings.label.theme", "settings.label.palette"];
const ADMINISTRATOR_PERSONAL = [...PERSONAL, "settings.label.notifications", "settings.label.briefing_player"];
const MOVED = ["settings.label.invites", "settings.label.permissions", "settings.label.providers", "settings.label.research", "settings.label.secrets", "settings.label.briefing"];
const TABS = ["organization.label.chart", "settings.label.invites", "settings.label.permissions", "settings.label.providers", "settings.label.research", "settings.label.briefing", "settings.label.secrets"];

let browser: Browser | null = null;
const cookies = new Map<string, string>();
let company = 0;
let team = 0;
let member = "";

async function login(account: { name: string; password: string }): Promise<string> {
  const answer = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(account) });

  expect(answer.ok).toBe(true);

  return answer.headers.get("set-cookie")!.split(";")[0]!;
}

// A call of the console's own API as the administrator.
async function administer<T>(path: string, method: string, body?: unknown): Promise<T> {
  const answer = await fetch(`${origin}${path}`, {
    method,
    headers: { cookie: cookies.get(ADMINISTRATOR.name)!, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  expect({ path, status: answer.status, ok: answer.ok }).toMatchObject({ path, ok: true });

  return (answer.status === 204 ? null : await answer.json().catch(() => null)) as T;
}

beforeAll(async () => {
  if (!origin || !touchReady()) return;

  cookies.set(ADMINISTRATOR.name, await login(ADMINISTRATOR));
  cookies.set(MEMBER.name, await login(MEMBER));

  // A company and a team under it, named for this run, with the member standing in the team.
  company = (await administer<{ id: number }>("/api/organization/units", "POST", { name: `company-${RUN}`, parent: null })).id;
  team = (await administer<{ id: number }>("/api/organization/units", "POST", { name: `team-${RUN}`, parent: company })).id;
  member = (await administer<{ user: string; name: string }[]>("/api/users", "GET")).find((one) => one.name === MEMBER.name)!.user;
  await administer(`/api/organization/users/${encodeURIComponent(member)}/unit`, "PUT", { unit: team });

  browser = await chromium.launch();
}, BROWSER_HOOK_MS);

afterAll(async () => {
  if (member !== "" && team !== 0) await administer(`/api/organization/units/${team}/heads/${encodeURIComponent(member)}`, "DELETE").catch(() => null);
  await browser?.close();
}, BROWSER_HOOK_MS);

async function contextFor(account: string, width: number, height: number, scheme: "light" | "dark"): Promise<BrowserContext> {
  const context = await browser!.newContext({ viewport: { width, height }, colorScheme: scheme, serviceWorkers: "block", reducedMotion: "reduce" });
  const cookie = cookies.get(account)!;
  const at = cookie.indexOf("=");

  await context.addCookies([
    { name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! },
    { name: "nuxt-color-mode", value: scheme, url: origin! }
  ]);

  return context;
}

// The console's app standing on the page once it has taken it over.
async function standing(page: Page): Promise<void> {
  await page.waitForFunction(() => window.useNuxtApp?.().isHydrating === false, null, { timeout: 30_000 });
}

// The section names the settings dialog lists, opened at its account section over the reader's home.
async function dialogSections(page: Page, home: string): Promise<string[]> {
  await page.goto(`${origin}${home}?settings=account`, { waitUntil: "load" });
  await standing(page);

  // On a phone the address goes into the section, over the list; its back arrow returns to the list.
  const back = page.getByRole("button", { name: wording("settings.action.back"), exact: true });

  if (await back.waitFor({ timeout: 5_000 }).then(() => true, () => false)) await back.click();

  const dialog = page.getByRole("dialog").first();

  await dialog.waitFor({ timeout: 20_000 });
  await dialog.getByText(wording("settings.label.account"), { exact: true }).first().waitFor({ timeout: 10_000 });

  const named = [...ADMINISTRATOR_PERSONAL, ...MOVED].map((key) => wording(key));
  const shown: string[] = [];

  for (const name of named) {
    if ((await dialog.getByRole("link", { name, exact: true }).or(dialog.getByRole("button", { name, exact: true })).count()) > 0) shown.push(name);
  }

  return shown;
}

// The tabs of the organisation settings screen as its tab row names them.
async function tabNames(page: Page): Promise<string[]> {
  const row = page.locator(`[aria-label="${wording("organization.aria.tabs")}"]`);

  await row.waitFor({ timeout: 20_000 });

  return (await row.getByRole("tab").allInnerTexts()).map((one) => one.trim());
}

// Nothing on the page runs past the screen's edge sideways.
async function overflow(page: Page): Promise<number> {
  return await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

describe.skipIf(!origin || !touchReady())("the settings dialog and the organisation settings screen", () => {
  for (const [width, height] of [[1280, 900], [360, 780]] as const) {
    for (const scheme of ["light", "dark"] as const) {
      test(`the administrator's, at ${width}px in ${scheme}`, async () => {
        const context = await contextFor(ADMINISTRATOR.name, width, height, scheme);

        try {
          const page = await context.newPage();

          expect(await dialogSections(page, "/")).toEqual(ADMINISTRATOR_PERSONAL.map((key) => wording(key)));

          // A link made before a section moved lands on its tab.
          await page.goto(`${origin}/?settings=providers`, { waitUntil: "load" });
          await page.waitForURL((url) => url.pathname.endsWith("/organization") && url.searchParams.get("tab") === "providers", { timeout: 20_000 });
          expect(await tabNames(page)).toEqual(TABS.map((key) => wording(key)));

          // The units tab: the unit chosen by its address, its company above its name.
          await page.goto(`${origin}/organization?unit=${team}`, { waitUntil: "load" });
          await standing(page);

          const chosen = page.locator(`[data-unit-chosen="${team}"]`);

          await chosen.waitFor({ timeout: 20_000 });
          expect(await chosen.innerText()).toContain(`company-${RUN}`);
          expect(await chosen.locator("[data-unit-member]").allInnerTexts()).toContain(MEMBER.name);

          // Every icon button in it is named.
          const unnamed = await chosen.locator("button").evaluateAll((buttons) => buttons.filter((one) => one.textContent?.trim() === "" && !one.getAttribute("aria-label")).length);

          expect(unnamed).toBe(0);

          if (width >= 1024) {
            const tree = page.locator("[data-unit-tree]");

            expect(await tree.innerText()).toContain(`team-${RUN}`);
            await tree.getByText(`company-${RUN}`, { exact: true }).click();
          } else {
            expect(await page.locator("[data-unit-tree]").count()).toBe(0);
            await page.locator("[data-unit-tree-open]").click();

            const drawer = page.getByRole("dialog").last();

            await drawer.getByText(`company-${RUN}`, { exact: true }).click();
            await drawer.waitFor({ state: "hidden", timeout: 10_000 });
          }

          await page.waitForURL((url) => url.searchParams.get("unit") === String(company), { timeout: 10_000 });
          await page.locator(`[data-unit-chosen="${company}"]`).waitFor({ timeout: 10_000 });

          // The unit's form has one save, shut while nothing differs.
          await page.locator("[data-unit-edit]").click();

          const save = page.getByRole("dialog").last().getByRole("button", { name: wording("common.action.save"), exact: true });

          await save.waitFor({ timeout: 10_000 });
          expect(await save.isDisabled()).toBe(true);
          await page.keyboard.press("Escape");

          // The tab row keeps one line, and nothing runs past the screen's edge.
          const row = await page.locator(`[aria-label="${wording("organization.aria.tabs")}"]`).boundingBox();

          expect(row!.height).toBeLessThanOrEqual(48);
          expect(await overflow(page)).toBeLessThanOrEqual(0);
        } finally {
          await context.close();
        }
      }, 120_000);

      test(`a member's, heading a unit and heading none, at ${width}px in ${scheme}`, async () => {
        await administer(`/api/organization/units/${team}/heads/${encodeURIComponent(member)}`, "DELETE").catch(() => null);

        const context = await contextFor(MEMBER.name, width, height, scheme);

        try {
          const page = await context.newPage();

          expect(await dialogSections(page, "/rooms")).toEqual(PERSONAL.map((key) => wording(key)));

          const entry = page.locator('a[href$="/organization"]');

          if (width >= 1024) expect(await entry.count()).toBe(0);

          await administer(`/api/organization/units/${team}/heads/${encodeURIComponent(member)}`, "PUT");
          await page.goto(`${origin}/organization`, { waitUntil: "load" });
          await standing(page);
          expect(await tabNames(page)).toEqual([wording("settings.label.invites")]);

          if (width >= 1024) await entry.first().waitFor({ timeout: 20_000 });

          expect(await overflow(page)).toBeLessThanOrEqual(0);
        } finally {
          await context.close();
          await administer(`/api/organization/units/${team}/heads/${encodeURIComponent(member)}`, "DELETE").catch(() => null);
        }
      }, 120_000);
    }
  }
});
