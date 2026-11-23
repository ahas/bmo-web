import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";

import type { Browser, BrowserContext, Locator, Page, Route } from "playwright-core";

// The organisation screen chooses a node of one organisation tree first (docs/web.md, 「Organisation」): the companies at
// its left with their units under them, searched by name, each chosen as a step of the history that stands in the
// address, the way down to a unit chosen open and marked, and on a phone the tree rises as a bottom drawer from the
// button at the start of the tab row carrying the node's name; moving between tabs keeps the node; and a member is
// listed the companies where they head a unit or hold a part of the supply, with the units they head under them. Its plans tab applies one of the
// plans shown and switches which are shown; its supply tab's policy form stands a source the platform has off with its
// switch disabled; the platform's policy form says what a person's own setting may change; the providers tab says
// whose a gateway road and a Claude account are; and the settings' supply section stands what the platform locks. Each
// is read at a desk's width and a phone's.
//
// The account service's plan, unit supply, supply reach, platform and personal supply routes are answered by a
// stand-in on the page, so what they hold is the test's own; the organisations are the console's own, made for this
// run, and the gateway's members and the Claude accounts are the agency stand-in's of tests/support/browser-console.ts.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ADMINISTRATOR = { name: "qa-admin", password: "fixture-password-3765" };
const MEMBER = { name: "tester", password: "fixture-password-3766" };
const RUN = Date.now().toString(36);
const WIDTHS = [
  [1280, 900],
  [360, 780]
] as const;

let browser: Browser | null = null;
const cookies = new Map<string, string>();
let alpha = 0;
let beta = 0;
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

  expect({ path, ok: answer.ok }).toEqual({ path, ok: true });

  return (answer.status === 204 ? null : await answer.json().catch(() => null)) as T;
}

beforeAll(async () => {
  if (!origin || !touchReady()) return;

  cookies.set(ADMINISTRATOR.name, await login(ADMINISTRATOR));
  cookies.set(MEMBER.name, await login(MEMBER));

  // Two companies named for this run, a team under the second, and the member standing in that team.
  alpha = (await administer<{ id: number }>("/api/organization/units", "POST", { name: `alpha-${RUN}`, parent: null })).id;
  beta = (await administer<{ id: number }>("/api/organization/units", "POST", { name: `beta-${RUN}`, parent: null })).id;
  team = (await administer<{ id: number }>("/api/organization/units", "POST", { name: `team-${RUN}`, parent: beta })).id;
  member = (await administer<{ user: string; name: string }[]>("/api/users", "GET")).find((one) => one.name === MEMBER.name)!.user;
  await administer(`/api/organization/users/${encodeURIComponent(member)}/unit`, "PUT", { unit: team });

  browser = await chromium.launch();
}, BROWSER_HOOK_MS);

afterAll(async () => {
  if (member !== "" && team !== 0) await administer(`/api/organization/units/${team}/heads/${encodeURIComponent(member)}`, "DELETE").catch(() => null);
  await browser?.close();
}, BROWSER_HOOK_MS);

async function contextFor(account: string, width: number, height: number): Promise<BrowserContext> {
  const context = await browser!.newContext({ viewport: { width, height }, serviceWorkers: "block", reducedMotion: "reduce" });
  const cookie = cookies.get(account)!;
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

  return context;
}

// The console's app standing on the page once it has taken it over.
async function standing(page: Page): Promise<void> {
  await page.waitForFunction(() => window.useNuxtApp?.().isHydrating === false, null, { timeout: 30_000 });
}

async function open(page: Page, path: string): Promise<void> {
  await page.goto(`${origin}${path}`, { waitUntil: "load" });
  await standing(page);
}

function company(page: Page): string | null {
  return new URL(page.url()).searchParams.get("company");
}

function unit(page: Page): string | null {
  return new URL(page.url()).searchParams.get("unit");
}

async function companyIs(page: Page, id: number): Promise<void> {
  await page.waitForURL((url) => url.searchParams.get("company") === String(id), { timeout: 15_000 });
  await page.locator(`[data-organization-chosen="${id}"]`).waitFor({ timeout: 15_000 });
}

// The organisation tree where it stands: beside the node chosen at a desk's width, in its drawer on a phone.
async function organizationList(page: Page, width: number): Promise<Locator> {
  if (width >= 640) return page.locator("[data-choice-sidebar-list]");

  await page.locator("[data-choice-sidebar-open]").click();

  const drawer = page.getByRole("dialog").last();

  await drawer.locator("[data-choice-sidebar-list]").waitFor({ timeout: 10_000 });

  return drawer.locator("[data-choice-sidebar-list]");
}

// The rows of this run's nodes the tree shows, top to bottom.
async function runRows(list: Locator): Promise<string[]> {
  return (await list.locator("[data-choice-tree-row]").allInnerTexts()).map((one) => one.trim()).filter((one) => one.endsWith(`-${RUN}`));
}

// The tree's row of a node, by its number.
function nodeRow(list: Locator, id: number): Locator {
  return list.locator(`[role=treeitem]:has([data-choice-tree-row="number:${id}"])`);
}

// The node chosen, a company or a unit of it, as the body stands for it.
async function nodeIs(page: Page, id: number): Promise<void> {
  await page.locator(`[data-organization-node="${id}"]`).waitFor({ timeout: 15_000 });
}

describe.skipIf(!origin || !touchReady())("the organisation list", () => {
  for (const [width, height] of WIDTHS) {
    test(`is searched, and choosing one is a step of the history that the tabs keep, at ${width}px`, async () => {
      const context = await contextFor(ADMINISTRATOR.name, width, height);

      try {
        const page = await context.newPage();

        await open(page, `/organization?company=${alpha}`);
        await companyIs(page, alpha);

        // At a desk's width the list's head and the tab row beside it draw one straight line under them.
        if (width >= 640) {
          const lines = await page.evaluate(() => ({
            head: document.querySelector("[data-choice-sidebar-list]")!.firstElementChild!.getBoundingClientRect().bottom,
            tabs: document.querySelector("[data-organization-chosen]")!.firstElementChild!.getBoundingClientRect().bottom
          }));

          expect(lines.head).toBe(lines.tabs);
        }

        // On a phone the organisation's head carries its name, and the list is in the drawer it opens.
        if (width < 640) {
          expect(await page.locator("[data-choice-sidebar-list]").count()).toBe(0);
          expect(await page.locator("[data-choice-sidebar-open]").innerText()).toBe(`alpha-${RUN}`);
        }

        let list = await organizationList(page, width);

        // Companies at the top, the one chosen open; the second's team stands folded under it.
        expect(await runRows(list)).toEqual([`alpha-${RUN}`, `beta-${RUN}`]);
        expect(await nodeRow(list, alpha).getAttribute("aria-selected")).toBe("true");
        expect(await nodeRow(list, beta).getAttribute("aria-level")).toBe("1");
        // The administrator adds a company from the tree's head.
        expect(await list.locator("[data-organization-add]").count()).toBe(1);

        // The search narrows the whole tree as it is typed, marking where it matched, keeping the nodes over a match
        // open, and says so where none matches.
        const search = list.locator("[data-choice-sidebar-search]");

        await search.fill(`BETA-${RUN}`);
        await list.locator(`[data-choice-tree-row="number:${alpha}"]`).waitFor({ state: "detached", timeout: 5_000 });
        expect(await runRows(list)).toEqual([`beta-${RUN}`]);
        expect(await list.locator(`[data-choice-tree-row="number:${beta}"] mark`).innerText()).toBe(`beta-${RUN}`);
        await search.fill(`TEAM-${RUN}`);
        await list.locator(`[data-choice-tree-row="number:${team}"] mark`).waitFor({ timeout: 5_000 });
        expect(await runRows(list)).toEqual([`beta-${RUN}`, `team-${RUN}`]);
        expect(await nodeRow(list, team).getAttribute("aria-level")).toBe("2");
        await search.fill(`nowhere-${RUN}`);
        expect(await list.locator("[data-choice-sidebar-empty]").innerText({ timeout: 5_000 })).toBe(wording("organization.label.list_no_match"));
        await search.fill("");

        // Choosing a company stands in the address as a step of the history, and on a phone closes the drawer.
        await nodeRow(list, beta).locator("[data-choice-tree-row]").click();
        await companyIs(page, beta);
        await nodeIs(page, beta);
        if (width < 640) await page.getByRole("dialog").waitFor({ state: "detached", timeout: 10_000 });

        // A unit under it is chosen the same way, beside its company; the company above it stands open and marked.
        list = await organizationList(page, width);
        await nodeRow(list, team).locator("[data-choice-tree-row]").click();
        await page.waitForURL((url) => url.searchParams.get("unit") === String(team), { timeout: 15_000 });
        await nodeIs(page, team);
        expect(company(page)).toBe(String(beta));
        if (width < 640) {
          await page.getByRole("dialog").waitFor({ state: "detached", timeout: 10_000 });
          expect(await page.locator("[data-choice-sidebar-open]").innerText()).toBe(`team-${RUN}`);
          list = await organizationList(page, width);
        }
        expect(await nodeRow(list, team).getAttribute("aria-selected")).toBe("true");
        expect(await nodeRow(list, beta).getAttribute("aria-expanded")).toBe("true");
        expect(await nodeRow(list, beta).locator("[data-choice-tree-way]").count()).toBe(1);
        if (width < 640) {
          await page.goBack();
          await page.getByRole("dialog").waitFor({ state: "detached", timeout: 10_000 });
        }

        // Moving between tabs keeps the node chosen.
        await page.getByRole("tab", { name: wording("roster.label.tab"), exact: true }).click();
        await page.waitForURL((url) => url.searchParams.get("tab") === "people", { timeout: 15_000 });
        expect([company(page), unit(page)]).toEqual([String(beta), String(team)]);
        await page.getByRole("tab", { name: wording("supply.label.plans"), exact: true }).click();
        await page.waitForURL((url) => url.searchParams.get("tab") === "plans", { timeout: 15_000 });
        expect([company(page), unit(page)]).toEqual([String(beta), String(team)]);

        // Back walks the tabs and then each choice back, one step each.
        await page.goBack();
        await page.waitForURL((url) => url.searchParams.get("tab") === "people", { timeout: 15_000 });
        await page.goBack();
        await page.waitForURL((url) => url.searchParams.get("tab") === null, { timeout: 15_000 });
        await nodeIs(page, team);
        await page.goBack();
        await page.waitForURL((url) => url.searchParams.get("unit") === null, { timeout: 15_000 });
        await nodeIs(page, beta);
        await page.goBack();
        await companyIs(page, alpha);

        // On a phone Back closes the drawer and leaves the node where it is.
        if (width < 640) {
          list = await organizationList(page, width);
          await page.goBack();
          await page.getByRole("dialog").waitFor({ state: "detached", timeout: 10_000 });
          expect(company(page)).toBe(String(alpha));
        }

        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      } finally {
        await context.close();
      }
    }, 120_000);
  }

  test("lands a link made before the organisation came first in the organisation it named, and an address naming none in the first", async () => {
    const context = await contextFor(ADMINISTRATOR.name, 1280, 900);

    try {
      const page = await context.newPage();

      // The supply tab's own unit, as its links named it.
      await open(page, `/organization?tab=supply&unit=${beta}`);
      await companyIs(page, beta);

      // The chart's unit, below its company, chosen in the tree.
      await open(page, `/organization?unit=${team}`);
      await companyIs(page, beta);
      await nodeIs(page, team);
      await page.locator(`[data-unit-chosen="${team}"]`).waitFor({ timeout: 20_000 });

      // A unit the tree does not hold under the company named: the company itself, the unit gone from the address.
      await open(page, `/organization?company=${alpha}&unit=${team}`);
      await page.waitForURL((url) => url.searchParams.get("unit") === null, { timeout: 15_000 });
      await nodeIs(page, alpha);

      // No organisation named: the first is chosen and written into the address in place, with no step.
      await open(page, "/organization?tab=catalogue");
      await page.waitForURL((url) => url.searchParams.get("company") !== null, { timeout: 15_000 });

      const first = (await page.locator("[data-choice-tree-row]").first().getAttribute("data-choice-tree-row"))!;

      expect(`number:${company(page)}`).toBe(first);
      expect(new URL(page.url()).searchParams.get("tab")).toBe("catalogue");
    } finally {
      await context.close();
    }
  }, 120_000);

  for (const [width, height] of WIDTHS) {
    test(`keeps the administrator's add through an empty list, so the first company is made there, at ${width}px`, async () => {
      const context = await contextFor(ADMINISTRATOR.name, width, height);

      try {
        const page = await context.newPage();

        // A deployment holding no company yet, as the list's read answers it.
        await page.route(/\/api\/organization\/units$/, async (route) => (route.request().method() === "GET" ? await route.fulfill({ status: 200, contentType: "application/json", body: "[]" }) : await route.continue()));
        await open(page, "/organization");

        const none = page.locator("[data-organization-none]");

        expect(await none.innerText({ timeout: 20_000 })).toBe(wording("organization.label.list_none"));
        expect(await page.locator("[data-choice-sidebar-list], [data-choice-sidebar-open]").count()).toBe(0);
        expect(await none.locator("[data-organization-add]").count()).toBe(1);
        expect(await page.locator(`[aria-label="${wording("organization.aria.tabs")}"]`).count()).toBe(0);

        // Its add opens the form of one name, which closes untouched asking nothing.
        await none.locator("[data-organization-add]").click();
        await page.locator("[data-company-add-name]").waitFor({ timeout: 10_000 });
        await page.keyboard.press("Escape");
        await page.locator("[data-company-add-name]").waitFor({ state: "detached", timeout: 10_000 });
      } finally {
        await context.close();
      }
    }, 120_000);
  }

  for (const [width, height] of WIDTHS) {
    test(`holds a member the companies where they head a unit or hold a part of the supply, with no add, and none where they hold nothing, at ${width}px`, async () => {
      const context = await contextFor(MEMBER.name, width, height);

      try {
        const page = await context.newPage();

        await open(page, "/organization");
        expect(await page.locator("[data-organization-none]").innerText({ timeout: 20_000 })).toBe(wording("organization.label.list_none"));
        expect(await page.getByRole("tab").count()).toBe(0);

        await administer(`/api/organization/units/${team}/heads/${encodeURIComponent(member)}`, "PUT");
        await open(page, "/organization");
        await companyIs(page, beta);
        // The company, and under it the unit they head.
        expect(await runRows(await organizationList(page, width))).toEqual([`beta-${RUN}`, `team-${RUN}`]);
        expect(await page.locator("[data-organization-add]").count()).toBe(0);
        await administer(`/api/organization/units/${team}/heads/${encodeURIComponent(member)}`, "DELETE");

        // Heading nothing, the company whose plan they hold, as the account service's supply reach names it, stands
        // listed with its plans tab and no supply tab, and the tab reads the company's plans.
        const fresh = await context.newPage();

        await page.close();
        await fresh.route(/\/api\/supply\/units$/, async (route) => await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ id: alpha, name: `alpha-${RUN}`, parent: null, policy: false, plan: true }]) }));
        await plansStandIn(fresh, alpha);
        await open(fresh, "/organization?tab=plans");
        await companyIs(fresh, alpha);
        expect(await runRows(await organizationList(fresh, width))).toEqual([`alpha-${RUN}`]);
        if (width < 640) {
          await fresh.goBack();
          await fresh.getByRole("dialog").waitFor({ state: "detached", timeout: 10_000 });
        }
        await fresh.locator("[data-plans-applied-row]").waitFor({ timeout: 20_000 });
        expect((await fresh.locator(`[aria-label="${wording("organization.aria.tabs")}"]`).getByRole("tab").allInnerTexts()).map((one) => one.trim())).toEqual(["settings.label.invites", "settings.label.bmo", "apps.label.tab", "supply.label.plans"].map((key) => wording(key)));
      } finally {
        await context.close();
        await administer(`/api/organization/units/${team}/heads/${encodeURIComponent(member)}`, "DELETE").catch(() => null);
      }
    }, 120_000);
  }
});

// --- The plans tab, on a stand-in of the organisation's plans ---

interface Plan {
  id: number;
  name: string;
  price: number;
  scope: "organisation";
  period: string;
  includedCredits: number | null;
  creditsUsable: boolean;
  exposed: boolean;
}

// A plan as the applied plan's answer carries it whole, read off the subscription.
function planCard({ id: _, exposed: __, ...card }: Plan): Omit<Plan, "id" | "exposed"> {
  return card;
}

// The organisation's plans as the account service would hold them, answered and written on the page.
async function plansStandIn(page: Page, unit: number): Promise<{ writes: { path: string; body: unknown }[] }> {
  const catalogue: Plan[] = [
    { id: 9001, name: `starter-${RUN}`, price: 10_000, scope: "organisation", period: "month", includedCredits: 5_000, creditsUsable: true, exposed: true },
    { id: 9002, name: `growth-${RUN}`, price: 30_000, scope: "organisation", period: "month", includedCredits: 20_000, creditsUsable: false, exposed: false }
  ];
  let applied: number | null = 9001;
  const writes: { path: string; body: unknown }[] = [];
  const answer = () => ({
    exposed: catalogue.filter((one) => one.exposed).map(({ exposed: _, ...plan }) => plan),
    applied: applied === null ? null : { ...planCard(catalogue.find((one) => one.id === applied)!), plan: applied, since: Date.UTC(2026, 10, 1), periodEnd: Date.UTC(2026, 11, 1) },
    catalogue
  });

  await page.route(new RegExp(`/api/supply/org/${unit}/plans(/(exposed|applied))?$`), async (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;

    if (request.method() === "PUT") {
      const body = request.postDataJSON() as { plans?: number[]; plan?: number | null };

      writes.push({ path: path.replace(/^.*\/plans/, "plans"), body });
      if (path.endsWith("/exposed")) for (const one of catalogue) one.exposed = body.plans!.includes(one.id);
      else applied = body.plan ?? null;
    }

    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(answer()) });
  });

  return { writes };
}

describe.skipIf(!origin || !touchReady())("the plans tab", () => {
  for (const [width, height] of WIDTHS) {
    test(`applies one of the plans shown and switches which are shown, the applied one's switch held on, at ${width}px`, async () => {
      const context = await contextFor(ADMINISTRATOR.name, width, height);

      try {
        const page = await context.newPage();
        const { writes } = await plansStandIn(page, beta);

        await open(page, `/organization?company=${beta}&tab=plans`);

        const appliedRow = page.locator("[data-plans-applied-row]");

        await appliedRow.waitFor({ timeout: 20_000 });
        expect(await appliedRow.innerText()).toContain(`starter-${RUN}`);
        expect(await page.locator("[data-plans-term]").innerText()).toContain("2026-11-01");

        // The applied plan's switch stands on and cannot be thrown; its tooltip says why.
        const held = page.locator("[data-plans-applied-switch]");
        const heldSwitch = held.getByRole("switch");

        expect(await heldSwitch.getAttribute("aria-checked")).toBe("true");
        expect(await heldSwitch.isDisabled()).toBe(true);
        await held.hover();
        expect(await page.locator('[role="tooltip"]').first().innerText({ timeout: 5_000 })).toBe(wording("supply.label.plan_applied_locked"));
        await page.mouse.move(0, 0);

        // Another plan's switch shows it as it is thrown.
        const growth = page.locator('[data-plans-catalogue="9002"]').getByRole("switch");

        expect(await growth.getAttribute("aria-checked")).toBe("false");
        await growth.click();
        await page.waitForFunction(() => document.querySelector('[data-plans-catalogue="9002"] [role="switch"]')?.getAttribute("aria-checked") === "true", null, { timeout: 10_000 });
        expect(writes).toEqual([{ path: "plans/exposed", body: { plans: [9001, 9002] } }]);

        // The change dialog: opened and closed untouched it asks nothing; none first, the plan applied chosen, and its
        // way through open only once the choice differs.
        const change = page.locator("[data-plans-change]");

        await change.click();

        let dialog = page.getByRole("dialog").last();

        await dialog.locator("[data-plans-apply-choices]").waitFor({ timeout: 10_000 });
        expect((await dialog.getByRole("radio").evaluateAll((radios) => radios.map((one) => one.getAttribute("aria-checked"))))).toEqual(["false", "true", "false"]);
        expect(await dialog.getByRole("radio").first().locator("xpath=ancestor::*[2]").innerText()).toContain(wording("supply.label.plan_choice_none"));
        expect(await dialog.locator("[data-plans-apply]").isDisabled()).toBe(true);
        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "detached", timeout: 10_000 });

        await change.click();
        dialog = page.getByRole("dialog").last();
        await dialog.getByText(`growth-${RUN}`, { exact: true }).click();
        expect(await dialog.locator("[data-plans-apply]").isDisabled()).toBe(false);
        await dialog.locator("[data-plans-apply]").click();
        await dialog.waitFor({ state: "detached", timeout: 10_000 });
        await page.waitForFunction((name) => document.querySelector("[data-plans-applied-row]")?.textContent?.includes(name) === true, `growth-${RUN}`, { timeout: 10_000 });
        expect(writes.at(-1)).toEqual({ path: "plans/applied", body: { plan: 9002 } });

        // The plan now applied holds its switch, and the one before can be switched off again.
        expect(await page.locator('[data-plans-catalogue="9002"] [data-plans-applied-switch]').count()).toBe(1);
        expect(await page.locator('[data-plans-catalogue="9001"]').getByRole("switch").isDisabled()).toBe(false);
      } finally {
        await context.close();
      }
    }, 120_000);
  }
});

// --- The supply tab, on a stand-in of the organisation's supply ---

// An organisation's supply as the account service would answer it: no policy of its own, the platform's in force from
// above, and the platform making the person's own supply and the organisation's credits available, the global supply
// and the personal credits off and left to no person. A policy write naming a source the platform keeps off is
// refused as the service refuses it.
async function supplyStandIn(page: Page, unit: number): Promise<{ writes: unknown[]; refusals: unknown[] }> {
  const available = ["personal", "org_credits"];
  let view = { inherits: true, policy: { allowed: available, order: [...available, "stop"], memberCreditCredits: null as number | null, from: null }, plan: null, wallet: { balance: 0, reserved: 0, debt: 0 }, available, usage: [] };
  const writes: unknown[] = [];
  const refusals: unknown[] = [];

  await page.route(new RegExp(`/api/supply/org/${unit}$`), async (route: Route) => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON() as { allowed: string[]; order: string[]; memberCreditCredits: number | null };

      if (body.allowed.some((one) => !available.includes(one))) {
        refusals.push(body);

        return await route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ code: "source-not-allowed" }) });
      }

      writes.push(body);
      view = { ...view, inherits: false, policy: { allowed: body.allowed, order: body.order, memberCreditCredits: body.memberCreditCredits, from: null } };
    }

    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(view) });
  });

  return { writes, refusals };
}

describe.skipIf(!origin || !touchReady())("the supply tab", () => {
  for (const [width, height] of WIDTHS) {
    test(`stands a source the platform has off with its switch disabled and the words saying so, and saves the rest, at ${width}px`, async () => {
      const context = await contextFor(ADMINISTRATOR.name, width, height);

      try {
        const page = await context.newPage();
        const { writes, refusals } = await supplyStandIn(page, beta);

        await open(page, `/organization?company=${beta}&tab=supply`);
        await page.locator('[data-supply-policy="inherits"]').waitFor({ timeout: 20_000 });
        await page.getByRole("button", { name: wording("supply.action.policy_set"), exact: true }).click();

        const dialog = page.getByRole("dialog").last();
        const row = (source: string) => dialog.locator(`[data-supply-policy-row="${source}"]`);
        const toggle = (source: string) => row(source).getByRole("switch", { name: wording("supply.aria.source_switch", { name: wording(`supply.label.source_${source}`) }), exact: true });

        await row("personal").waitFor({ timeout: 10_000 });

        // The sources the platform keeps off: off, their switch disabled, and the words under their name.
        for (const source of ["global", "personal_credits"]) {
          expect({ source, checked: await toggle(source).getAttribute("aria-checked"), disabled: await toggle(source).isDisabled() }).toEqual({ source, checked: "false", disabled: true });
          expect(await row(source).locator("[data-supply-policy-platform-off]").innerText()).toBe(wording("supply.label.platform_off"));
        }
        // The sources it makes available stand as the policy in force has them, switched as the reader likes.
        for (const source of ["personal", "org_credits"]) {
          expect({ source, checked: await toggle(source).getAttribute("aria-checked"), disabled: await toggle(source).isDisabled() }).toEqual({ source, checked: "true", disabled: false });
          expect(await row(source).locator("[data-supply-policy-platform-off]").count()).toBe(0);
        }

        // A source switched off is saved, and the save is not refused for anything the platform keeps off.
        const save = dialog.getByRole("button", { name: wording("common.action.save"), exact: true });

        expect(await save.isDisabled()).toBe(true);
        await toggle("org_credits").click();
        await save.click();
        await dialog.waitFor({ state: "detached", timeout: 10_000 });
        expect({ refusals, writes }).toMatchObject({ refusals: [], writes: [{ allowed: ["personal"], order: ["personal", "stop"] }] });
        await page.locator('[data-supply-policy="own"]').waitFor({ timeout: 10_000 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      } finally {
        await context.close();
      }
    }, 120_000);
  }
});

// --- The providers tab's owners, on the agency stand-in's gateway members and Claude accounts ---

describe.skipIf(!origin || !touchReady())("the providers tab", () => {
  for (const [width, height] of WIDTHS) {
    test(`says whose a gateway road one person owns and whose each Claude account is, and nothing for a road of the platform's, at ${width}px`, async () => {
      const context = await contextFor(ADMINISTRATOR.name, width, height);

      try {
        const page = await context.newPage();
        // The person the stand-in's DeepSeek road and second Claude account belong to, by the name their account goes by.
        const users = await administer<{ name: string; fullName: string }[]>("/api/users", "GET");
        const owner = users.find((one) => one.name === "person-tabs-subject")!;
        const personal = wording("supply.label.owner_personal", { name: owner.fullName.trim() === "" ? owner.name : owner.fullName });

        await open(page, "/admin");

        const road = (name: string) => page.locator(`[data-provider="${name}"]`);

        await road("deepseek").locator("[data-provider-owner]").waitFor({ timeout: 20_000 });
        expect(await road("deepseek").locator("[data-provider-owner]").innerText()).toBe(personal);
        // A road of the platform's, and one with no gateway member at all, say nothing of whose they are.
        await road("registered").waitFor({ timeout: 10_000 });
        expect(await road("registered").locator("[data-provider-owner]").count()).toBe(0);
        expect(await road("claude-code").locator("[data-provider-owner]").count()).toBe(0);

        // The Claude accounts: the person's says so by their name, the platform's as shared.
        const account = (id: string) => page.locator(`[data-account="${id}"] [data-account-owner]`);

        await account("acct-b").waitFor({ timeout: 20_000 });
        expect(await account("acct-b").innerText()).toBe(personal);
        expect(await account("acct-a").innerText()).toBe(wording("supply.label.owner_shared"));
        expect(await account("acct-c").innerText()).toBe(wording("supply.label.owner_shared"));
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      } finally {
        await context.close();
      }
    }, 120_000);
  }
});

// --- The platform's policy form, on a stand-in of the platform's supply ---

describe.skipIf(!origin || !touchReady())("the platform's policy form", () => {
  for (const [width, height] of WIDTHS) {
    test(`says beside each source and the order whether a person's own setting may change it, at ${width}px`, async () => {
      const context = await contextFor(ADMINISTRATOR.name, width, height);

      try {
        const page = await context.newPage();
        let platform = { allowed: ["personal", "global"], order: ["personal", "global", "stop"], overridable: ["personal"], orderOverridable: true, creditsPerDollar: 1_500, reservationCredits: 200, enforce: false };
        const writes: unknown[] = [];

        await page.route(/\/api\/supply\/platform$/, async (route) => {
          if (route.request().method() === "PUT") {
            const body = route.request().postDataJSON() as Partial<typeof platform>;
            const next = { ...platform, ...body };
            // As the account service judges it: the order names every source the platform opens — on or left to a
            // person — each once and nothing else, `stop` allowed only trailing.
            const order = (next.order.at(-1) === "stop" ? next.order.slice(0, -1) : next.order).filter((one) => one !== undefined);
            const open = ["personal", "global", "org_credits", "personal_credits"].filter((one) => next.allowed.includes(one) || next.overridable.includes(one));

            if (body.order !== undefined && (order.includes("stop") || new Set(order).size !== order.length || order.length !== open.length || open.some((one) => !order.includes(one)))) {
              writes.push({ refused: body });

              return await route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ code: "bad-request" }) });
            }

            writes.push(body);
            platform = { ...next, order: [...order, "stop"] };
          }

          await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ policy: { allowed: platform.allowed, order: platform.order, memberCreditCredits: null }, overridable: platform.overridable, orderOverridable: platform.orderOverridable, creditsPerDollar: platform.creditsPerDollar, reservationCredits: platform.reservationCredits, enforce: platform.enforce }) });
        });

        await open(page, "/admin?tab=credits");

        const row = (source: string) => page.locator(`[data-platform-source="${source}"]`);

        await row("personal").waitFor({ timeout: 20_000 });
        expect(await row("personal").innerText()).toContain(wording("supply.label.overridable"));
        expect(await row("personal").innerText()).toContain(wording("supply.label.source_on"));
        expect(await row("global").innerText()).toContain(wording("supply.label.fixed"));
        expect(await row("org_credits").innerText()).toContain(wording("supply.label.source_off"));
        expect(await page.locator("[data-platform-order]").innerText()).toContain(wording("supply.label.overridable"));

        // The form carries the second switch beside each source and one for the order, and saves both.
        await page.locator("[data-platform-order]").locator("xpath=ancestor::section[1]").getByRole("button", { name: wording("common.action.edit"), exact: true }).click();

        const dialog = page.getByRole("dialog").last();
        const allow = dialog.locator("[data-supply-policy-overridable]");

        await allow.first().waitFor({ timeout: 10_000 });
        expect(await allow.count()).toBe(5);
        expect(await dialog.locator('[data-supply-policy-row="order"]').count()).toBe(1);

        const save = dialog.getByRole("button", { name: wording("common.action.save"), exact: true });

        expect(await save.isDisabled()).toBe(true);
        await dialog.getByRole("switch", { name: wording("supply.aria.source_overridable", { name: wording("supply.label.source_global") }), exact: true }).click();
        // A source off but left to a person stands in the order the platform writes.
        await dialog.getByRole("switch", { name: wording("supply.aria.source_overridable", { name: wording("supply.label.source_org_credits") }), exact: true }).click();
        await dialog.getByRole("switch", { name: wording("supply.aria.order_overridable"), exact: true }).click();
        expect(await save.isDisabled()).toBe(false);
        await save.click();
        await dialog.waitFor({ state: "detached", timeout: 10_000 });
        expect(writes).toEqual([{ allowed: ["personal", "global"], order: ["personal", "global", "org_credits", "stop"], overridable: ["personal", "global", "org_credits"], orderOverridable: false }]);
        await page.waitForFunction((words) => document.querySelector('[data-platform-source="global"]')?.textContent?.includes(words) === true, wording("supply.label.overridable"), { timeout: 10_000 });
        expect(await row("global").innerText()).toContain(wording("supply.label.overridable"));
        expect(await page.locator("[data-platform-order]").innerText()).toContain(wording("supply.label.fixed"));
      } finally {
        await context.close();
      }
    }, 120_000);
  }
});

// --- The settings' supply section, on a stand-in of the reader's own supply ---

interface MeSource {
  source: string;
  allowed: boolean;
  off: boolean;
  locked: boolean;
  own?: "on" | "off";
  reason?: string;
}

// A person's own write judged as the account service judges it (docs/accounts.md, 「How an order is resolved」;
// docs/boundary.md, 「Supply」): a source named both on and off is refused; a choice the person already holds passes as
// it stands, while one newly switched against a locked platform value, or newly switched on where a layer above
// closed it, is refused; while the order is read it names every source the layers above leave to the person, each
// once, `stop` allowed only trailing, and every open source switched off stands in it. The refusal, where there is
// one, is answered with its status and code; none is null.
function judgedWrite(sources: readonly MeSource[], orderLocked: boolean, body: { order: string[]; off: string[]; on: string[] }): { status: number; code: string } | null {
  const state = (key: string) => sources.find((one) => one.source === key);
  const payable = sources.filter((one) => one.source !== "stop");
  const allowed = payable.filter((one) => one.allowed).map((one) => one.source);

  if (body.on.some((one) => body.off.includes(one))) return { status: 400, code: "bad-request" };

  for (const [list, to] of [[body.on, true], [body.off, false]] as const) {
    for (const key of list) {
      const one = state(key);

      if (one === undefined || key === "stop") return { status: 400, code: "bad-request" };
      if (one.own === (to ? "on" : "off")) continue;
      if (one.locked && !one.off !== to) return { status: 403, code: "locked-by-platform" };
      if (to && !one.allowed) return { status: 403, code: one.reason ?? "source-not-allowed" };
    }
  }

  if (orderLocked) return null;

  const order = body.order.at(-1) === "stop" ? body.order.slice(0, -1) : body.order;

  if (order.includes("stop") || new Set(order).size !== order.length) return { status: 400, code: "bad-request" };
  if (order.some((one) => !allowed.includes(one)) || allowed.some((one) => !order.includes(one))) return { status: 400, code: "bad-request" };
  if (body.off.some((one) => allowed.includes(one) && !order.includes(one))) return { status: 400, code: "bad-request" };

  return null;
}

describe.skipIf(!origin || !touchReady())("the settings' supply order", () => {
  for (const [width, height] of WIDTHS) {
    test(`stands a source and an order the platform locks with their controls off and the words saying so, at ${width}px`, async () => {
      const context = await contextFor(MEMBER.name, width, height);

      try {
        const page = await context.newPage();
        const me = {
          order: ["personal", "org_credits", "stop"],
          orderLocked: true,
          sources: [
            { source: "personal", allowed: true, off: false, locked: true },
            { source: "global", allowed: false, off: true, locked: false, own: "on" as const, reason: "not-in-plan" },
            { source: "org_credits", allowed: true, off: false, locked: false },
            { source: "personal_credits", allowed: true, off: true, locked: false, own: "off" as const },
            { source: "stop", allowed: true, off: false, locked: true }
          ],
          personalCreditCredits: null,
          usage: [],
          globalRemaining: null,
          personalCredits: null
        };

        const writes: unknown[] = [];
        const refusals: unknown[] = [];

        await page.route(/\/api\/supply\/me$/, async (route) => {
          if (route.request().method() === "PUT") {
            const body = route.request().postDataJSON() as { order: string[]; off: string[]; on: string[] };
            const refused = judgedWrite(me.sources, me.orderLocked, body);

            if (refused !== null) {
              refusals.push({ body, refused });

              return await route.fulfill({ status: refused.status, contentType: "application/json", body: JSON.stringify({ code: refused.code }) });
            }

            writes.push(body);
          }

          await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(me) });
        });
        await page.route(/\/api\/supply\/logins$/, async (route) => await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ active: null, accounts: [] }) }));
        await page.route(/\/api\/supply\/personal$/, async (route) => await route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
        await open(page, "/organization?settings=supply");

        const source = (name: string) => page.locator(`[data-supply-source="${name}"]`);

        await source("personal").waitFor({ timeout: 20_000 });

        // The locked source: its switch on and disabled, and the words under it.
        expect(await source("personal").innerText()).toContain(wording("supply.label.locked"));
        expect(await source("personal").getByRole("switch").isDisabled()).toBe(true);
        expect(await source("personal").getByRole("switch").getAttribute("aria-checked")).toBe("true");
        // The others the reader still switches, the personal credits among them, off as they stand.
        expect(await source("org_credits").getByRole("switch").isDisabled()).toBe(false);
        expect(await source("personal_credits").getByRole("switch").getAttribute("aria-checked")).toBe("false");
        expect(await source("personal_credits").getByRole("switch").isDisabled()).toBe(false);
        // The monthly cap stands under the personal credits.
        const order = await page.locator("[data-supply-source], [data-supply-cap]").evaluateAll((rows) => rows.map((one) => one.getAttribute("data-supply-source") ?? "cap"));

        expect(order).toEqual(["personal", "org_credits", "personal_credits", "cap", "stop", "global"]);
        // The order locked: every arrow disabled, and one line under the group.
        const arrows = page.locator("[data-supply-source]").getByRole("button", { name: /./ });

        expect(await arrows.evaluateAll((buttons) => buttons.every((one) => (one as HTMLButtonElement).disabled))).toBe(true);
        expect(await page.locator("[data-supply-order-locked]").innerText()).toBe(wording("supply.label.order_locked"));
        // A source a layer below closed keeps its reason and no control.
        expect(await source("global").innerText()).toContain(wording("supply.label.reason_not_in_plan"));
        expect(await source("global").getByRole("switch").count()).toBe(0);

        // A switch thrown writes back every choice the reader holds and that one, so the rest keep the default.
        const written = page.waitForRequest((request) => request.url().endsWith("/api/supply/me") && request.method() === "PUT");

        await source("org_credits").getByRole("switch").click();
        await written;
        // The global supply's stored choice goes back as it stands while a layer above closes it, so it is not erased.
        expect({ refusals, writes }).toEqual({ refusals: [], writes: [{ order: ["personal", "org_credits", "personal_credits"], off: ["org_credits", "personal_credits"], on: ["global"], personalCreditCredits: null }] });

        // With the order the person's again, a move writes every source left to them, in the order moved.
        me.orderLocked = false;
        await open(page, "/organization?settings=supply");
        await source("personal").waitFor({ timeout: 20_000 });

        const moved = page.waitForRequest((request) => request.url().endsWith("/api/supply/me") && request.method() === "PUT");

        await source("personal").getByRole("button", { name: wording("common.aria.move_down_named", { name: wording("supply.label.source_personal") }), exact: true }).click();
        await moved;
        expect({ refusals, write: writes.at(-1) }).toEqual({ refusals: [], write: { order: ["org_credits", "personal", "personal_credits"], off: ["personal_credits"], on: ["global"], personalCreditCredits: null } });
      } finally {
        await context.close();
      }
    }, 120_000);
  }
});
