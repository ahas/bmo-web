import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";

import type { Browser, BrowserContext, Locator, Page } from "playwright-core";

// The sidebar's organisation entry and the agents tab (docs/web.md, 「Sidebar」 and 「Organisation」, the agents
// tab), and what a company decided read in a person's own settings (「Settings」, the supply and own-BMO sections).
// The entry stands among the administrator services by its name, alone under their heading for a head who opens no
// other of them, and opens the organisation screen, which keeps its own tab row; the agents tab sets a company's instructions, persona, supply sources and
// repositories, each with what the units below may do; and a person under the company reads the persona and the
// supply source it locked or closed as decided by the company, named, with nothing to change. Each is worked as a hand
// works it at a phone's width and a desk's: what a press lands on is the control it names, nothing runs off the side,
// and what a press does is read back off the screen after the page is read again.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ADMINISTRATOR = { name: "org-group", password: "fixture-password-3903" };
const PERSON = { name: "org-group-person", password: "fixture-password-3904" };
const RUN = Date.now().toString(36);
const WIDTHS = [1280, 360] as const;
const COMPANY_NAME = `group-${RUN}`;

let browser: Browser | null = null;
const cookies = new Map<string, string>();
let company = 0;
let team = 0;
let person = "";

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
  cookies.set(PERSON.name, await login(PERSON));

  // A company and a team under it, named for this run, with the person standing in the team and let personalise their
  // BMO.
  company = (await administer<{ id: number }>("/api/organization/units", "POST", { name: COMPANY_NAME, parent: null })).id;
  team = (await administer<{ id: number }>("/api/organization/units", "POST", { name: `team-${RUN}`, parent: company })).id;
  person = (await administer<{ user: string; name: string }[]>("/api/users", "GET")).find((one) => one.name === PERSON.name)!.user;
  await administer(`/api/organization/users/${encodeURIComponent(person)}/unit`, "PUT", { unit: team });
  await administer(`/api/organization/users/${encodeURIComponent(person)}/agent-permission`, "PUT", { setting: "allow" });

  browser = await chromium.launch();
}, BROWSER_HOOK_MS);

afterAll(async () => {
  if (person !== "" && team !== 0) await administer(`/api/organization/units/${team}/heads/${encodeURIComponent(person)}`, "DELETE").catch(() => null);
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

// Whether a press at the control's centre lands on the control itself, nothing standing over it, once what was open
// over the page has gone: a dialog closing fades for a moment over what it leaves.
async function reachable(control: Locator): Promise<boolean> {
  await control.scrollIntoViewIfNeeded();

  const lands = async (): Promise<boolean> =>
    await control.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);

      return hit !== null && (hit === element || element.contains(hit) || hit.contains(element));
    });

  for (let look = 0; look < 20; look += 1) {
    if (await lands()) return true;
    await control.page().waitForTimeout(100);
  }

  return await lands();
}

// Whether the page runs off its side: the document wider than the screen.
async function overflows(page: Page): Promise<boolean> {
  return await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
}

// The sidebar's administrator services, the section the organisation entry stands in, the phone's drawer opened
// first; the title bar's toggle answers only once the page has hydrated, so a press that opened nothing is made again.
async function organizationSection(page: Page, width: number): Promise<Locator> {
  const section = page.getByRole("navigation", { name: wording("screens.label.section_administration"), exact: true });
  const entry = section.getByRole("link", { name: wording("screens.label.organization"), exact: true });

  for (let press = 0; width < 1024 && press < 10 && !(await entry.isVisible()); press += 1) {
    await page.locator("[data-title-bar] [data-slot='toggle']").first().click();
    await entry.waitFor({ timeout: 2_000 }).catch(() => undefined);
  }
  await entry.waitFor({ timeout: 20_000 });

  return section;
}

// The names the sidebar's sections are called by, in their order.
async function sectionNames(page: Page): Promise<string[]> {
  const named = [wording("screens.label.section_administration"), wording("screens.label.organization"), wording("screens.label.section_application")];

  return await page.evaluate(
    (names) => [...document.querySelectorAll<HTMLElement>("nav[aria-label]")].filter((one) => one.checkVisibility()).map((one) => one.getAttribute("aria-label")!).filter((name) => names.includes(name)),
    named
  );
}

// A choice made in a select: the select pressed, then the option it opens.
async function choose(page: Page, select: Locator, option: string): Promise<void> {
  expect(await reachable(select)).toBe(true);
  await select.click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

describe.skipIf(!origin || !touchReady())("the organisation entry and the agents tab", () => {
  for (const width of WIDTHS) {
    test(`the administrator's sidebar stands the organisation screen among the administrator services by its name, and the entry opens the screen with its tab row, at ${width}px`, async () => {
      const context = await contextFor(ADMINISTRATOR.name, width);

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/rooms`, { waitUntil: "load" });
        await standing(page);

        const name = wording("screens.label.organization");
        const section = await organizationSection(page, width);

        // An entry among the administrator services, which stand by their names; no section of its own stands for it.
        const names = (await section.getByRole("link").allInnerTexts()).map((one) => one.trim());

        expect(names).toContain(name);
        expect(names).toEqual([...names].sort(new Intl.Collator("en").compare));
        expect(await sectionNames(page)).toEqual([wording("screens.label.section_administration"), wording("screens.label.section_application")]);
        expect(await section.locator('a[aria-current="page"]').count()).toBe(0);

        const entry = section.getByRole("link", { name, exact: true });

        expect(await reachable(entry)).toBe(true);
        await entry.click();
        await page.waitForURL((url) => url.pathname.endsWith("/organization"), { timeout: 15_000 });

        // The screen keeps its own tab row, every tab of it the administrator's, and the entry is lit on any of them.
        const row = page.locator(`[aria-label="${wording("organization.aria.tabs")}"]`);
        const agents = row.getByRole("tab", { name: wording("org_agents.label.tab"), exact: true });

        await agents.waitFor({ timeout: 20_000 });
        expect(await row.getByRole("tab", { name: wording("roster.label.tab"), exact: true }).count()).toBe(1);

        const lit = await organizationSection(page, width);

        expect(await lit.locator('a[aria-current="page"]').allInnerTexts()).toEqual([name]);
        if (width < 1024) await page.keyboard.press("Escape");
        expect(await reachable(agents)).toBe(true);
        await agents.click();
        await page.waitForURL((url) => url.searchParams.get("tab") === "agents", { timeout: 15_000 });
        await page.locator("[data-org-agents]").waitFor({ timeout: 20_000 });

        const still = await organizationSection(page, width);

        expect(await still.locator('a[aria-current="page"]').allInnerTexts()).toEqual([name]);
        expect(await overflows(page)).toBe(false);
      } finally {
        await context.close();
      }
    }, 120_000);

    test(`the agents tab sets the company's instructions, persona, supply source and repositories, each with what the units below may do, at ${width}px`, async () => {
      const context = await contextFor(ADMINISTRATOR.name, width);

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/organization?company=${company}&tab=agents`, { waitUntil: "load" });
        await standing(page);

        // The company's instructions, typed in their form and read back under the row after the page is read again.
        const words = `Keep every record of ${RUN} in the folder of ${width}.`;
        const change = page.locator("[data-org-instructions-change]");

        await change.waitFor({ timeout: 20_000 });
        expect(await reachable(change)).toBe(true);
        await change.click();

        const dialog = page.getByRole("dialog");

        await dialog.locator("[data-org-instructions-text]").fill(words);
        await dialog.getByRole("button", { name: wording("common.action.save"), exact: true }).click();
        await dialog.waitFor({ state: "hidden", timeout: 15_000 });
        await page.locator("[data-org-instructions-own]").getByText(words, { exact: true }).waitFor({ timeout: 15_000 });

        // The form closes at once untouched and with a change taken back, and asks before a change is thrown away.
        const discard = page.getByRole("button", { name: wording("common.action.discard"), exact: true });
        const text = dialog.locator("[data-org-instructions-text]");

        await change.click();
        await text.waitFor({ timeout: 10_000 });
        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "hidden", timeout: 10_000 });
        await change.click();
        await text.fill(`${words} More.`);
        await text.fill(words);
        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "hidden", timeout: 10_000 });
        expect(await discard.count()).toBe(0);
        await change.click();
        await text.fill(`${words} More.`);
        await page.keyboard.press("Escape");
        await discard.waitFor({ timeout: 10_000 });
        await discard.click();
        await text.waitFor({ state: "hidden", timeout: 10_000 });
        await page.locator("[data-org-instructions-own]").getByText(words, { exact: true }).waitFor({ timeout: 15_000 });

        // The persona left out, and locked for every unit below.
        await choose(page, page.locator("[data-org-persona-choice]"), wording("org_agents.label.persona_none"));
        await page.waitForFunction((none) => document.querySelector("[data-org-persona-choice]")?.textContent?.includes(none) === true, wording("org_agents.label.persona_none"), { timeout: 15_000 });
        await choose(page, page.locator('[data-org-delegation="persona"]'), wording("org_agents.label.delegation_lock"));
        await page.waitForFunction((lock) => document.querySelector('[data-org-delegation="persona"]')?.textContent?.includes(lock) === true, wording("org_agents.label.delegation_lock"), { timeout: 15_000 });

        // Personal supply closed at the company.
        const personal = page.locator('[data-agent-source="personal"]').getByRole("switch");

        await personal.waitFor({ timeout: 20_000 });
        if ((await personal.getAttribute("aria-checked")) === "true") {
          expect(await reachable(personal)).toBe(true);
          await personal.click();
          await page.waitForFunction(() => document.querySelector('[data-agent-source="personal"] [role="switch"]')?.getAttribute("aria-checked") === "false", null, { timeout: 15_000 });
        }

        // A repository added under the company stands as a row by its name and path, and its delete takes it away.
        const name = `team-tools-${width}-${RUN}`;
        const add = page.locator("[data-org-repository-add]");

        expect(await reachable(add)).toBe(true);
        await add.click();
        await dialog.locator("[data-org-repository-name]").fill(name);
        await dialog.locator("[data-org-repository-path]").fill(`/srv/checkouts/${name}`);
        await dialog.getByRole("button", { name: wording("common.action.add"), exact: true }).click();

        const row = page.locator(`[data-org-repository="${name}"]`);

        await row.waitFor({ timeout: 15_000 });
        expect(await row.innerText()).toContain(`/srv/checkouts/${name}`);
        expect(await overflows(page)).toBe(false);

        // Read again, everything stands as it was left.
        await page.reload({ waitUntil: "load" });
        await standing(page);
        await page.locator("[data-org-instructions-own]").getByText(words, { exact: true }).waitFor({ timeout: 20_000 });
        expect(await page.locator("[data-org-persona-choice]").textContent()).toContain(wording("org_agents.label.persona_none"));
        expect(await page.locator('[data-org-delegation="persona"]').textContent()).toContain(wording("org_agents.label.delegation_lock"));
        await row.waitFor({ timeout: 20_000 });

        const remove = row.getByRole("button", { name: wording("org_agents.aria.repository_remove", { name }), exact: true });

        expect(await reachable(remove)).toBe(true);
        await remove.click();
        await page.getByRole("alertdialog").or(page.getByRole("dialog")).last().getByRole("button", { name: wording("common.action.delete"), exact: true }).click();
        await row.waitFor({ state: "detached", timeout: 15_000 });
        expect(await overflows(page)).toBe(false);
      } finally {
        await context.close();
      }
    }, 120_000);

    test(`a person under the company reads the persona and the supply source it decided as the company's, named, with nothing to change, and a head's sidebar stands the organisation entry, at ${width}px`, async () => {
      const context = await contextFor(PERSON.name, width);

      try {
        const page = await context.newPage();
        const decided = wording("org_agents.label.decided_named", { name: COMPANY_NAME });

        // The own-BMO section: the persona's choice the company locked reads as the company's, its switch off and disabled.
        await page.goto(`${origin}/rooms?settings=agent`, { waitUntil: "load" });
        await standing(page);

        const state = page.locator("[data-persona-state]");

        await state.waitFor({ timeout: 20_000 });
        expect(await state.innerText()).toBe(decided);

        const choice = page.locator("[data-persona-switch]");

        expect(await choice.getAttribute("aria-checked")).toBe("false");
        expect(await choice.isDisabled()).toBe(true);
        expect(await page.locator("[data-persona-follow]").count()).toBe(0);
        expect(await overflows(page)).toBe(false);

        // The supply section: personal supply the company closed reads off, as the company's, with no control on its row.
        await page.goto(`${origin}/rooms?settings=supply`, { waitUntil: "load" });
        await standing(page);

        const source = page.locator('[data-own-source="personal"]');

        await source.waitFor({ timeout: 20_000 });
        expect(await source.innerText()).toContain(decided);
        expect(await source.innerText()).toContain(wording("org_agents.label.state_off"));
        expect(await source.locator("button, [role='switch'], input").count()).toBe(0);
        expect(await page.locator('[data-own-source="platform"]').innerText()).toContain(wording("org_agents.label.state_on"));
        expect(await overflows(page)).toBe(false);

        // A head of the team who opens no other administrator service: the section stands for them under its heading,
        // the organisation entry its one row.
        await administer(`/api/organization/units/${team}/heads/${encodeURIComponent(person)}`, "PUT");
        await page.goto(`${origin}/rooms`, { waitUntil: "load" });
        await standing(page);

        const section = await organizationSection(page, width);

        expect((await section.getByRole("link").allInnerTexts()).map((one) => one.trim())).toEqual([wording("screens.label.organization")]);
        expect((await section.innerText()).split("\n").map((one) => one.trim()).filter((one) => one !== "")).toEqual([wording("screens.label.section_administration"), wording("screens.label.organization")]);
        expect(await sectionNames(page)).not.toContain(wording("screens.label.organization"));
      } finally {
        await context.close();
        await administer(`/api/organization/units/${team}/heads/${encodeURIComponent(person)}`, "DELETE").catch(() => null);
      }
    }, 120_000);
  }
});
