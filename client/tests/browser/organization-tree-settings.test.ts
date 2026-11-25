import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, fingerOn, touchReady } from "./touch";

import type { Browser, BrowserContext, Locator, Page } from "playwright-core";
import type { SecretKind } from "../../apps/web/shared/secret-kinds";

// The settings the organisation screen's tree holds beside the apps, as a hand works them (docs/web.md,
// 「System and organisation」): the tree marking its top level alone, the secrets tab at each node — the platform's space at the platform node, a unit's own at a unit, the
// reader's own at their own node and the administrator's door from there to the platform's, the settings dialog's section a door
// to it — the org memory tab's base with its review and its read layers, the permissions tab where a head gives a
// person of their unit only a section they hold, and a unit's repository opened in agent management's dialog. Every
// press lands on what the browser draws at that point, a finger's tap at a phone's width and a mouse's click at a
// desk's, and nothing runs past the screen sideways.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up, whose
// brain stand-in holds the base with one candidate raised from `agent-a`.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ADMINISTRATOR = { name: "tree-admin", password: "fixture-password-4611" };
const HEAD = { name: "tree-head", password: "fixture-password-4612" };
const MEMBER = { name: "tree-member", password: "fixture-password-4613" };
const RUN = Date.now().toString(36);

const WIDTHS = [
  { width: 360, height: 740, phone: true },
  { width: 1280, height: 800, phone: false }
] as const;

let browser: Browser | null = null;
const cookies = new Map<string, string>();
const users = new Map<string, string>();
let company = 0;
let team = 0;
let apiKey: SecretKind | null = null;

async function login(account: { name: string; password: string }): Promise<string> {
  const answer = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(account) });

  expect(answer.ok).toBe(true);

  return answer.headers.get("set-cookie")!.split(";")[0]!;
}

async function call(account: string, path: string, method: string, body?: unknown): Promise<Response> {
  return await fetch(`${origin}${path}`, {
    method,
    headers: { cookie: cookies.get(account)!, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

async function administer<T>(path: string, method: string, body?: unknown): Promise<T> {
  const answer = await call(ADMINISTRATOR.name, path, method, body);

  expect({ path, status: answer.status, ok: answer.ok }).toMatchObject({ path, ok: true });

  return (answer.status === 204 ? null : await answer.json().catch(() => null)) as T;
}

beforeAll(async () => {
  if (!origin || !touchReady()) return;

  for (const account of [ADMINISTRATOR, HEAD, MEMBER]) cookies.set(account.name, await login(account));

  // A company of this run's and a team under it, the head heading the team and the member standing in it.
  company = (await administer<{ id: number }>("/api/organization/units", "POST", { name: `tree-company-${RUN}`, parent: null })).id;
  team = (await administer<{ id: number }>("/api/organization/units", "POST", { name: `tree-team-${RUN}`, parent: company })).id;

  for (const one of await administer<{ user: string; name: string }[]>("/api/users", "GET")) users.set(one.name, one.user);

  for (const account of [HEAD, MEMBER]) await administer(`/api/organization/users/${encodeURIComponent(users.get(account.name)!)}/unit`, "PUT", { unit: team });

  await administer(`/api/organization/units/${team}/heads/${encodeURIComponent(users.get(HEAD.name)!)}`, "PUT");

  apiKey = (await administer<{ kinds: SecretKind[] }>("/api/secret-kinds", "GET")).kinds.find((kind) => kind.key === "api-key") ?? null;
  browser = await chromium.launch();
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();
}, BROWSER_HOOK_MS);

async function contextFor(account: string, width: number, height: number, phone: boolean): Promise<BrowserContext> {
  const context = await browser!.newContext({ viewport: { width, height }, hasTouch: phone, isMobile: phone, serviceWorkers: "block", reducedMotion: "reduce" });
  const cookie = cookies.get(account)!;
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

  return context;
}

async function standing(page: Page): Promise<void> {
  await page.waitForFunction(() => window.useNuxtApp?.().isHydrating === false, null, { timeout: 30_000 });
}

async function visit(page: Page, path: string): Promise<void> {
  await page.goto(`${origin}${path}`, { waitUntil: "load" });
  await standing(page);
}

// A press where the browser draws the control once it stands still: scrolled into view, the topmost thing at its centre
// is the control or stands inside it, so nothing stands over what is pressed; then a finger's tap on a phone and a
// click on a desk.
async function press(page: Page, target: Locator, phone: boolean): Promise<void> {
  await target.scrollIntoViewIfNeeded();

  let box = (await target.boundingBox())!;

  for (let tries = 0; tries < 20; tries += 1) {
    await page.waitForTimeout(100);

    const now = (await target.boundingBox())!;

    if (now.x === box.x && now.y === box.y) break;
    box = now;
  }

  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const reached = await target.evaluate((element, at) => {
    const top = document.elementFromPoint(at.x, at.y);

    return top !== null && (element === top || element.contains(top));
  }, centre);

  expect(reached).toBe(true);

  if (phone) await (await fingerOn(page)).tap(centre);
  else await page.mouse.click(centre.x, centre.y);
}

// A value read again until it is the one expected, as a write reaches what the page or the service shows.
async function settles<T>(read: () => Promise<T>, expected: T): Promise<void> {
  const until = Date.now() + 10_000;
  let now = await read();

  while (Date.now() < until && now !== expected) {
    await new Promise((done) => setTimeout(done, 200));
    now = await read();
  }

  expect(now as unknown).toBe(expected as unknown);
}

async function overflow(page: Page): Promise<number> {
  return await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

// The question a delete asks, answered by its way through.
async function confirmDelete(page: Page, phone: boolean): Promise<void> {
  const asking = page.getByRole("alertdialog").or(page.getByRole("dialog").filter({ hasText: wording("secrets.message.delete_confirm") }));

  await asking.first().waitFor({ timeout: 10_000 });
  await press(page, asking.first().getByRole("button", { name: wording("common.action.delete"), exact: true }), phone);
}

describe.skipIf(!origin || !touchReady())("the organisation screen's tree settings", () => {
  for (const { width, height, phone } of WIDTHS) {
    test(`keeps the platform's secrets at the platform node and leads the administrator there from their own, at ${width}px`, async () => {
      const context = await contextFor(ADMINISTRATOR.name, width, height, phone);
      const name = `TREE_KEY_${RUN}_${width}`;

      try {
        const page = await context.newPage();

        // The secret form opened at the platform's node from an address, as the platform settings' key setting opens it.
        await visit(page, `/organization?company=platform&tab=secrets&secret=${name}&kind=api-key`);
        await page.locator("[data-secret-form]").waitFor({ timeout: 20_000 });
        await page.locator('[data-secret-field="API_KEY"] input').fill(`value-${RUN}`);
        await press(page, page.locator("[data-secret-save]"), phone);
        await page.locator("[data-secret-form]").waitFor({ state: "detached", timeout: 10_000 });

        const row = page.locator(`[data-secret-space="own"] [data-secret="${name}"]`);

        await row.waitFor({ timeout: 10_000 });
        expect(await page.locator("[data-secret-space-note]").innerText()).toBe(wording("secrets.label.platform_note"));
        expect(await page.content()).not.toContain(`value-${RUN}`);
        expect(await overflow(page)).toBeLessThanOrEqual(0);

        // Deleted, asked first.
        await press(page, row.locator("[data-secret-delete]"), phone);
        await confirmDelete(page, phone);
        await row.waitFor({ state: "detached", timeout: 10_000 });

        // At their own node the administrator is led to the platform's space.
        await visit(page, "/organization?company=me&tab=secrets");

        const door = page.locator("[data-secrets-platform-door] a");

        await door.waitFor({ timeout: 20_000 });
        await press(page, door, phone);
        await page.waitForURL((url) => url.searchParams.get("company") === "platform" && url.searchParams.get("tab") === "secrets", { timeout: 10_000 });
        await page.locator('[data-secret-space="own"]').waitFor({ timeout: 10_000 });
      } finally {
        await context.close();
      }
    }, 120_000);

    test(`keeps a unit's own secrets at its node, added from the tab row, at ${width}px`, async () => {
      const context = await contextFor(ADMINISTRATOR.name, width, height, phone);
      const name = `TREE_UNIT_${RUN}_${width}`;

      try {
        const page = await context.newPage();

        await visit(page, `/organization?company=${company}&unit=${team}&tab=secrets`);
        await page.locator(`[data-secret-space="${team}"] [data-secrets-none], [data-secret-space="${team}"] [data-secret]`).first().waitFor({ timeout: 20_000 });

        // In the tree only the top level carries a mark: the company leads with its building, the team under it stands
        // as its name alone.
        if (phone) await page.locator("[data-choice-sidebar-open]").click();

        const companyRow = page.locator(`[role=treeitem]:has([data-choice-tree-row="number:${company}"])`).first();
        const teamRow = page.locator(`[role=treeitem]:has([data-choice-tree-row="number:${team}"])`).last();

        await teamRow.waitFor({ timeout: 20_000 });
        expect(await companyRow.locator("[data-choice-tree-icon]").count()).toBeGreaterThanOrEqual(1);
        expect(await teamRow.locator("[data-choice-tree-icon]").count()).toBe(0);

        if (phone) {
          await page.keyboard.press("Escape");
          await page.locator("[data-choice-tree-row]").first().waitFor({ state: "hidden", timeout: 10_000 });
        }

        await press(page, page.locator("[data-tab-add]"), phone);
        await page.locator("[data-secret-form]").waitFor({ timeout: 10_000 });
        await page.locator("[data-secret-kind]").click();
        await page.getByRole("option", { name: apiKey!.name, exact: true }).click();
        await page.getByRole("listbox").waitFor({ state: "detached", timeout: 10_000 });
        await page.locator("[data-secret-name]").fill(name);
        await page.locator('[data-secret-field="API_KEY"] input').fill(`unit-value-${RUN}`);
        await press(page, page.locator("[data-secret-save]"), phone);
        await page.locator("[data-secret-form]").waitFor({ state: "detached", timeout: 10_000 });
        await page.locator(`[data-secret-space="${team}"] [data-secret="${name}"]`).waitFor({ timeout: 10_000 });
        expect(await overflow(page)).toBeLessThanOrEqual(0);

        // Kept in the unit's space, and nowhere in the reader's own.
        const unitList = await administer<{ secrets: { name: string }[] }>(`/api/organization/units/${team}/secrets`, "GET");
        const own = await administer<{ secrets: { name: string }[] }>("/api/secrets", "GET");

        expect(unitList.secrets.map((one) => one.name)).toContain(name);
        expect(own.secrets.map((one) => one.name)).not.toContain(name);
      } finally {
        await context.close();
      }
    }, 120_000);

    test(`shows a head their unit's secrets and a member their own at their own node, at ${width}px`, async () => {
      const head = await contextFor(HEAD.name, width, height, phone);
      const member = await contextFor(MEMBER.name, width, height, phone);

      try {
        const page = await head.newPage();

        await visit(page, `/organization?company=${company}&unit=${team}&tab=secrets`);
        await page.locator(`[data-secret-space="${team}"] [data-secrets-none], [data-secret-space="${team}"] [data-secret]`).first().waitFor({ timeout: 20_000 });

        // The company above the team is no space of theirs.
        await visit(page, `/organization?company=${company}&tab=secrets`);
        await page.locator("[data-secret-space-forbidden]").waitFor({ timeout: 20_000 });

        const own = await member.newPage();

        // Their own space stands at their own link of the chain, which the sidebar's organisation entry leads a
        // reader to.
        await visit(own, "/organization?company=me&tab=secrets");
        await own.locator('[data-secret-space="own"]').waitFor({ timeout: 10_000 });
        expect(await own.locator("[data-secret-space-note]").innerText()).toBe(wording("secrets.label.note"));
        expect(await overflow(own)).toBeLessThanOrEqual(0);
      } finally {
        await head.close();
        await member.close();
      }
    }, 120_000);

    test(`lets a head give a person of their unit only a section they hold, at ${width}px`, async () => {
      const context = await contextFor(HEAD.name, width, height, phone);
      const memberId = users.get(MEMBER.name)!;

      try {
        const page = await context.newPage();

        await visit(page, `/organization?company=${company}&unit=${team}&tab=permissions`);

        const person = page.locator(`[data-org-permission-person="${memberId}"]`);

        await person.waitFor({ timeout: 20_000 });
        await press(page, person.locator("button").first(), phone);
        await page.waitForURL((url) => url.searchParams.get("user") === memberId, { timeout: 10_000 });

        const table = person.locator("[data-person-permissions]");
        const research = table.getByRole("switch", { name: wording("permissions.aria.read_of", { name: wording("screens.label.research") }) });
        const monitor = table.getByRole("switch", { name: wording("permissions.aria.read_of", { name: wording("screens.label.monitor") }) });

        await research.waitFor({ timeout: 20_000 });
        await settles(async () => await research.isDisabled(), false);
        expect(await monitor.isDisabled()).toBe(true);
        expect(await overflow(page)).toBeLessThanOrEqual(0);

        // The research read the head holds, given and taken back.
        await press(page, research, phone);
        await settles(async () => (await administer<{ section: string; read: boolean }[]>(`/api/users/${memberId}/sections`, "GET")).find((one) => one.section === "research")?.read, true);
        await settles(async () => await research.isDisabled(), false);
        await press(page, research, phone);
        await settles(async () => (await administer<{ section: string; read: boolean }[]>(`/api/users/${memberId}/sections`, "GET")).find((one) => one.section === "research")?.read, false);
      } finally {
        await context.close();
      }
    }, 120_000);

    test(`holds the base and its review at the platform node and the read layers at every node, at ${width}px`, async () => {
      const context = await contextFor(ADMINISTRATOR.name, width, height, phone);

      try {
        const page = await context.newPage();

        await visit(page, "/organization?company=platform&tab=memory");
        await page.locator("[data-org-memory-base]").waitFor({ timeout: 20_000 });

        const review = page.locator("[data-org-memory-review]");
        const candidate = review.locator("[data-org-memory-candidate]").first();

        if (phone) {
          // The keep is asked first, its way out given the keyboard's place, and nothing is written on the way out.
          await candidate.waitFor({ timeout: 10_000 });
          expect(await candidate.locator("[data-org-memory-source]").innerText()).toContain("agent-a");
          await press(page, candidate.locator("[data-decide='keep']"), phone);
          await candidate.locator("[data-asking]").waitFor({ timeout: 10_000 });
          await press(page, candidate.locator("[data-asking-cancel]"), phone);
          await candidate.locator("[data-asking]").waitFor({ state: "detached", timeout: 10_000 });
          await candidate.waitFor({ timeout: 10_000 });
        } else {
          // Raised: it leaves the review and stands among the base's memories.
          await candidate.waitFor({ timeout: 10_000 });

          const text = await candidate.locator("p").first().innerText();

          await press(page, candidate.locator("[data-decide='raise']"), phone);
          await review.locator("[data-org-memory-candidate]").first().waitFor({ state: "detached", timeout: 10_000 });
          await page.locator("[data-org-memory-base] [data-org-memory-row]").filter({ hasText: text }).waitFor({ timeout: 10_000 });
        }

        // The platform's read layers, the base's read turned off and on again.
        const layer = page.locator("[data-brain-layers] [data-brain-layer='global'] [data-brain-layer-switch]");

        await layer.waitFor({ timeout: 10_000 });
        await press(page, layer, phone);
        await settles(async () => await layer.getAttribute("aria-checked"), "false");
        await settles(async () => await layer.isDisabled(), false);
        await press(page, layer, phone);
        await settles(async () => await layer.getAttribute("aria-checked"), "true");
        expect(await overflow(page)).toBeLessThanOrEqual(0);

        // A team stands with its own read layers.
        await visit(page, `/organization?company=${company}&unit=${team}&tab=memory`);
        await page.locator("[data-brain-layers] [data-brain-layer='organisation']").waitFor({ timeout: 20_000 });
      } finally {
        await context.close();
      }
    }, 120_000);

    test(`opens a unit's repository in agent management's dialog from the agents tab, at ${width}px`, async () => {
      const context = await contextFor(ADMINISTRATOR.name, width, height, phone);
      const name = `tree-repo-${RUN}-${width}`;

      await administer(`/api/organization/units/${team}/repositories`, "POST", { name, label: `Tree repo ${width}`, path: `/srv/${name}` });

      try {
        const page = await context.newPage();

        await visit(page, `/organization?company=${company}&unit=${team}&tab=agents`);

        const settings = page.locator(`[data-org-repository="${name}"] [data-org-repository-settings]`);

        await settings.waitFor({ timeout: 20_000 });
        await press(page, settings, phone);

        const dialog = page.getByRole("dialog").filter({ hasText: `Tree repo ${width}` });

        await dialog.waitFor({ timeout: 10_000 });
        await settles(async () => await dialog.getByRole("textbox", { name: wording("common.label.path"), exact: true }).first().inputValue(), `/srv/${name}`);
        expect(await overflow(page)).toBeLessThanOrEqual(0);
      } finally {
        await context.close();
      }
    }, 120_000);
  }
});
