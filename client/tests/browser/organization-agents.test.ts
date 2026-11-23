import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";

import type { Browser, BrowserContext, Locator, Page } from "playwright-core";

// An organisation's agents (docs/web.md, 「Organisation」, the supply and BMO tabs, and 「The join page」): the supply
// tab's groups of the unit's supply sources and its own keys, the BMO tab's sign-up composition, and the agent login
// step a person whose runs only their own supply can carry is held at. Each is worked as a hand works it at a phone's width and a desk's: what a
// press lands on is the control it names, nothing runs off the side, and what a press does is read back off the screen
// after the page is read again.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up, whose
// agency stand-in keeps a unit's keys and puts a composition on the account service's chain as the agency does.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ADMINISTRATOR = { name: "org-agents", password: "fixture-password-3901" };
const OWN_ONLY = { name: "agent-login", password: "fixture-password-3902" };
const RUN = Date.now().toString(36);
const WIDTHS = [360, 1280] as const;

let browser: Browser | null = null;
const cookies = new Map<string, string>();
let company = 0;

async function login(account: { name: string; password: string }): Promise<string> {
  const answer = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(account) });

  expect(answer.ok).toBe(true);

  return answer.headers.get("set-cookie")!.split(";")[0]!;
}

beforeAll(async () => {
  if (!origin || !touchReady()) return;

  cookies.set(ADMINISTRATOR.name, await login(ADMINISTRATOR));
  cookies.set(OWN_ONLY.name, await login(OWN_ONLY));

  const made = await fetch(`${origin}/api/organization/units`, {
    method: "POST",
    headers: { cookie: cookies.get(ADMINISTRATOR.name)!, "content-type": "application/json" },
    body: JSON.stringify({ name: `agents-${RUN}`, parent: null })
  });

  expect(made.ok).toBe(true);
  company = ((await made.json()) as { id: number }).id;
  browser = await chromium.launch();
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();
}, BROWSER_HOOK_MS);

async function contextFor(account: string, width: number): Promise<BrowserContext> {
  const context = await browser!.newContext({ viewport: { width, height: width < 600 ? 780 : 900 }, serviceWorkers: "block", reducedMotion: "reduce" });
  const cookie = cookies.get(account)!;
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

  return context;
}

async function standing(page: Page): Promise<void> {
  await page.waitForFunction(() => window.useNuxtApp?.().isHydrating === false, null, { timeout: 30_000 });
}

// Whether a press at the control's centre lands on the control itself, nothing standing over it.
async function reachable(control: Locator): Promise<boolean> {
  await control.scrollIntoViewIfNeeded();

  return await control.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);

    return hit !== null && (hit === element || element.contains(hit) || hit.contains(element));
  });
}

// Whether the page runs off its side: the document wider than the screen.
async function overflows(page: Page): Promise<boolean> {
  return await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
}

async function tab(page: Page, name: string): Promise<void> {
  await page.goto(`${origin}/organization?company=${company}&tab=${name}`, { waitUntil: "load" });
  await standing(page);
}

describe.skipIf(!origin || !touchReady())("an organisation's agents", () => {
  for (const width of WIDTHS) {
    test(`the administrator opens organisation supply to a company and adds a key of its own at ${width}px`, async () => {
      const context = await contextFor(ADMINISTRATOR.name, width);
      const page = await context.newPage();

      await tab(page, "supply");

      const sources = page.locator("[data-agent-supply]");

      await sources.getByText(wording("org_agents.title.sources"), { exact: true }).waitFor({ timeout: 20_000 });
      expect(await sources.locator("[data-agent-source]").evaluateAll((rows) => rows.map((row) => (row as HTMLElement).dataset.agentSource))).toEqual(["personal", "organisation", "platform"]);

      // Organisation supply stands closed until the company is given it, and the key's add with it.
      const organisation = sources.locator('[data-agent-source="organisation"]');
      const opened = sources.locator("[data-agent-supply-company]").getByRole("switch");
      const add = sources.locator("[data-agent-key-add]");

      if ((await opened.getAttribute("aria-checked")) !== "true") {
        await expect(organisation.getByText(wording("org_agents.label.not_provided"), { exact: true }).count()).resolves.toBe(1);
        expect(await add.isDisabled()).toBe(true);
        expect(await reachable(opened)).toBe(true);
        await opened.click();
        await page.waitForFunction(() => document.querySelector('[data-agent-supply-company] [role="switch"]')?.getAttribute("aria-checked") === "true", null, { timeout: 15_000 });
      }

      await page.waitForFunction(() => document.querySelector('[data-agent-source="organisation"] [role="switch"]')?.getAttribute("aria-checked") === "true", null, { timeout: 15_000 });

      // A key added through the dialog stands as a row by its name alone; its value shows nowhere.
      const secret = `team-${width}-${RUN}`;
      const value = `sk-never-shown-${RUN}`;

      expect(await reachable(add)).toBe(true);
      await add.click();

      const dialog = page.getByRole("dialog");

      await dialog.locator("[data-agent-key-name]").fill(secret);
      await dialog.locator("[data-agent-key-value]").fill(value);
      await dialog.getByRole("button", { name: wording("common.action.add"), exact: true }).click();
      await sources.locator(`[data-agent-key="${secret}"]`).waitFor({ timeout: 15_000 });
      expect(await page.content()).not.toContain(value);

      const row = sources.locator(`[data-agent-key="${secret}"]`);

      expect(await reachable(row.getByRole("switch"))).toBe(true);
      expect(await reachable(row.getByRole("button", { name: wording("org_agents.aria.key_remove", { name: secret }), exact: true }))).toBe(true);
      expect(await overflows(page)).toBe(false);

      // Read again, it stands as it was left.
      await page.reload({ waitUntil: "load" });
      await standing(page);
      await page.locator(`[data-agent-key="${secret}"]`).waitFor({ timeout: 20_000 });

      await context.close();
    }, 120_000);

    test(`a role turned off in the sign-up composition stays off when the tab is read again at ${width}px`, async () => {
      const context = await contextFor(ADMINISTRATOR.name, width);
      const page = await context.newPage();

      await tab(page, "agent");

      const group = page.locator("[data-composition]");
      const worker = group.locator('[data-composition-role="worker"]');
      const select = worker.locator('button[aria-haspopup="listbox"]');

      await worker.waitFor({ timeout: 20_000 });
      expect(await reachable(select)).toBe(true);
      await select.click();
      await page.getByRole("option", { name: wording("org_agents.label.choice_off"), exact: true }).click();
      await page.waitForFunction((off) => document.querySelector('[data-composition-role="worker"] button[aria-haspopup="listbox"]')?.textContent?.includes(off) === true, wording("org_agents.label.choice_off"), { timeout: 15_000 });
      expect(await overflows(page)).toBe(false);

      await page.reload({ waitUntil: "load" });
      await standing(page);
      await page.locator('[data-composition-role="worker"]').waitFor({ timeout: 20_000 });
      expect(await page.locator('[data-composition-role="worker"]').locator('button[aria-haspopup="listbox"]').textContent()).toContain(wording("org_agents.label.choice_off"));

      // Following above again leaves the role to the platform's own rule, said under its name.
      await page.locator('[data-composition-role="worker"]').locator('button[aria-haspopup="listbox"]').click();
      await page.getByRole("option", { name: wording("org_agents.label.choice_inherit"), exact: true }).click();
      await page.locator('[data-composition-role="worker"]').getByText(wording("org_agents.label.stands_platform"), { exact: true }).waitFor({ timeout: 15_000 });

      await context.close();
    }, 120_000);

    test(`a person only their own supply can carry is held at the agent login step at ${width}px`, async () => {
      const context = await contextFor(OWN_ONLY.name, width);
      const page = await context.newPage();

      await page.goto(`${origin}/`, { waitUntil: "load" });
      await standing(page);
      await page.waitForURL((address) => address.pathname.endsWith("/agent-login"), { timeout: 20_000 });
      await page.getByRole("heading", { name: wording("agent_login.title.page"), exact: true }).waitFor({ timeout: 20_000 });

      const start = page.locator("[data-agent-login-start]");

      expect(await reachable(start)).toBe(true);
      await start.click();
      await page.locator("[data-agent-login-still]").waitFor({ timeout: 15_000 });
      expect(new URL(page.url()).pathname.endsWith("/agent-login")).toBe(true);
      expect(await overflows(page)).toBe(false);

      await context.close();
    }, 120_000);
  }
});
