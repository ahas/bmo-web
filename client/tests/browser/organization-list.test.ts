import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";

import type { Browser, BrowserContext, Locator, Page, Route } from "playwright-core";

// The organisation screen chooses an organisation first (docs/web.md, 「Organisation」): the organisations at its left,
// searched by name, each chosen as a step of the history that stands in the address, and on a phone the list rises as
// a bottom drawer from the button carrying the organisation's name; moving between tabs keeps the organisation. Its
// plans tab applies one of the plans shown and switches which are shown; the platform's policy form says what a
// person's own setting may change; and the settings' supply section stands what the platform locks. Each is read at a
// desk's width and a phone's.
//
// The account service's plan, platform and personal supply routes are answered by a stand-in on the page, so what
// they hold is the test's own; the organisations are the console's own, made for this run.
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

async function companyIs(page: Page, id: number): Promise<void> {
  await page.waitForURL((url) => url.searchParams.get("company") === String(id), { timeout: 15_000 });
  await page.locator(`[data-organization-chosen="${id}"]`).waitFor({ timeout: 15_000 });
}

// The organisation list where it stands: beside the organisation at a desk's width, in its drawer on a phone.
async function organizationList(page: Page, width: number): Promise<Locator> {
  if (width >= 640) return page.locator("[data-organization-list]");

  await page.locator("[data-organization-list-open]").click();

  const drawer = page.getByRole("dialog").last();

  await drawer.locator("[data-organization-list]").waitFor({ timeout: 10_000 });

  return drawer.locator("[data-organization-list]");
}

// The rows of this run's organisations the list shows.
async function runRows(list: Locator): Promise<string[]> {
  return (await list.locator("[data-organization-row]").allInnerTexts()).map((one) => one.trim()).filter((one) => one.endsWith(`-${RUN}`));
}

describe.skipIf(!origin || !touchReady())("the organisation list", () => {
  for (const [width, height] of WIDTHS) {
    test(`is searched, and choosing one is a step of the history that the tabs keep, at ${width}px`, async () => {
      const context = await contextFor(ADMINISTRATOR.name, width, height);

      try {
        const page = await context.newPage();

        await open(page, `/organization?company=${alpha}`);
        await companyIs(page, alpha);

        // On a phone the organisation's head carries its name, and the list is in the drawer it opens.
        if (width < 640) {
          expect(await page.locator("[data-organization-list]").count()).toBe(0);
          expect(await page.locator("[data-organization-name]").innerText()).toBe(`alpha-${RUN}`);
        }

        let list = await organizationList(page, width);

        expect(await runRows(list)).toEqual([`alpha-${RUN}`, `beta-${RUN}`]);
        expect(await list.locator(`[data-organization-row="${alpha}"]`).getAttribute("aria-current")).toBe("true");
        // The administrator adds a company from the list's head.
        expect(await list.locator("[data-organization-add]").count()).toBe(1);

        // The search narrows the rows as it is typed, marking where it matched, and says so where none matches.
        const search = list.getByRole("textbox", { name: wording("organization.label.list_search"), exact: true });

        await search.fill(`BETA-${RUN}`);
        await list.locator(`[data-organization-row="${alpha}"]`).waitFor({ state: "detached", timeout: 5_000 });
        expect(await list.locator("[data-organization-row]").count()).toBe(1);
        expect(await list.locator(`[data-organization-row="${beta}"] mark`).innerText()).toBe(`beta-${RUN}`);
        await search.fill(`nowhere-${RUN}`);
        expect(await list.locator("[data-organization-list-empty]").innerText({ timeout: 5_000 })).toBe(wording("organization.label.list_no_match"));
        await search.fill("");

        // Choosing one stands in the address as a step of the history, and on a phone closes the drawer.
        await list.locator(`[data-organization-row="${beta}"]`).click();
        await companyIs(page, beta);
        if (width < 640) await page.getByRole("dialog").waitFor({ state: "detached", timeout: 10_000 });

        // Moving between tabs keeps the organisation chosen.
        await page.getByRole("tab", { name: wording("roster.label.tab"), exact: true }).click();
        await page.waitForURL((url) => url.searchParams.get("tab") === "people", { timeout: 15_000 });
        expect(company(page)).toBe(String(beta));
        await page.getByRole("tab", { name: wording("supply.label.plans"), exact: true }).click();
        await page.waitForURL((url) => url.searchParams.get("tab") === "plans", { timeout: 15_000 });
        expect(company(page)).toBe(String(beta));

        // Back walks the tabs and then the choice back.
        await page.goBack();
        await page.waitForURL((url) => url.searchParams.get("tab") === "people", { timeout: 15_000 });
        await page.goBack();
        await page.waitForURL((url) => url.searchParams.get("tab") === null, { timeout: 15_000 });
        await companyIs(page, beta);
        await page.goBack();
        await companyIs(page, alpha);

        // On a phone Back closes the drawer and leaves the organisation where it is.
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

      // The chart's unit, below its company.
      await open(page, `/organization?unit=${team}`);
      await companyIs(page, beta);
      await page.locator(`[data-unit-chosen="${team}"]`).waitFor({ timeout: 20_000 });

      // No organisation named: the first is chosen and written into the address in place, with no step.
      await open(page, "/organization?tab=catalogue");
      await page.waitForURL((url) => url.searchParams.get("company") !== null, { timeout: 15_000 });

      const first = (await page.locator("[data-organization-row]").first().getAttribute("data-organization-row"))!;

      expect(company(page)).toBe(first);
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

        expect(await none.locator("[data-organization-list-empty]").innerText({ timeout: 20_000 })).toBe(wording("organization.label.list_none"));
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

  test("holds a member the companies where they head a unit, with no add, and none where they head nothing", async () => {
    const context = await contextFor(MEMBER.name, 1280, 900);

    try {
      const page = await context.newPage();

      await open(page, "/organization");
      expect(await page.locator("[data-organization-none]").innerText({ timeout: 20_000 })).toBe(wording("organization.label.list_none"));
      expect(await page.getByRole("tab").count()).toBe(0);

      await administer(`/api/organization/units/${team}/heads/${encodeURIComponent(member)}`, "PUT");
      await open(page, "/organization");
      await companyIs(page, beta);
      expect(await runRows(page.locator("[data-organization-list]"))).toEqual([`beta-${RUN}`]);
      expect(await page.locator("[data-organization-add]").count()).toBe(0);
    } finally {
      await context.close();
      await administer(`/api/organization/units/${team}/heads/${encodeURIComponent(member)}`, "DELETE").catch(() => null);
    }
  }, 120_000);
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
