import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { platformTabs } from "./platform-tabs";
import { wording } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, Page } from "playwright-core";

// The agent tabs' four reaches on the organisation screen (docs/web.md, 「System and organisation」, the agent tabs; the
// agency's `docs/api.md`, 「Who a caller acts for」): a unit's head sees its own unit and the units under it, a person
// sees their own rows at their own node, a reader outside a company is handed none of its rows, and the platform's
// node keeps the whole for the administrator. A tab stands where the reader may read its part; a row added at a node
// is filed under it. The agency stand-in of tests/support/browser-console.ts answers the owner parameters as the
// agency does, so what each reader is shown is the reach and nothing the screen filtered by hand.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const RUN = Date.now().toString(36);
const ADMINISTRATOR = { name: "org-agents", password: "fixture-password-3901" };
const HEAD = { name: "reach-head", password: "fixture-password-4620" };
const PERSON = { name: "reach-person", password: "fixture-password-4621" };
const OUTSIDER = { name: "tree-member", password: "fixture-password-4613" };

const COMPANY = `reach-beta-${RUN}`;
const TEAM = `reach-team-${RUN}`;
const OTHER = `reach-alpha-${RUN}`;
const TEAM_REPO = `reach-repo-${RUN}`;
const OTHER_REPO = `other-repo-${RUN}`;
const FILED = `filed-${RUN}`;
const MODEL = `reach-model-${RUN}`;

const SUPERVISORS = wording("agents.label.tab_supervisors");
const REPOS = wording("agents.label.tab_repositories");
const MODELS = wording("agents.label.tab_models");
const AGENT_TABS = [SUPERVISORS, wording("agents.label.tab_roles"), REPOS, MODELS, wording("agents.label.tab_model_files")];

let browser: Browser | null = null;
const cookies = new Map<string, string>();
let company = 0;
let team = 0;
let other = 0;

async function login(account: { name: string; password: string }): Promise<string> {
  const answer = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(account) });

  expect(answer.ok).toBe(true);

  return answer.headers.get("set-cookie")!.split(";")[0]!;
}

async function administer<T>(path: string, method: "GET" | "POST" | "PUT" | "DELETE", body?: unknown): Promise<T> {
  const answer = await fetch(`${origin}${path}`, {
    method,
    headers: { cookie: cookies.get(ADMINISTRATOR.name)!, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });

  expect(answer.ok).toBe(true);

  // A write that answers nothing is read as nothing; the row it changed is read back off the screen.
  if (answer.status === 204) return undefined as T;

  return (await answer.json()) as T;
}

beforeAll(async () => {
  if (!origin || !touchReady()) return;

  for (const account of [ADMINISTRATOR, HEAD, PERSON, OUTSIDER]) cookies.set(account.name, await login(account));

  const users = await administer<{ user: string; name: string }[]>("/api/users", "GET");
  const userId = (name: string): string => users.find((one) => one.name === name)!.user;

  company = (await administer<{ id: number }>("/api/organization/units", "POST", { name: COMPANY, parent: null })).id;
  team = (await administer<{ id: number }>("/api/organization/units", "POST", { name: TEAM, parent: company })).id;
  other = (await administer<{ id: number }>("/api/organization/units", "POST", { name: OTHER, parent: null })).id;

  // The head heads the company and stands in its unit; the person stands in the unit and heads nothing.
  await administer(`/api/organization/units/${company}/heads/${encodeURIComponent(userId(HEAD.name))}`, "PUT");
  await administer(`/api/organization/users/${encodeURIComponent(userId(HEAD.name))}/unit`, "PUT", { unit: team });
  await administer(`/api/organization/users/${encodeURIComponent(userId(PERSON.name))}/unit`, "PUT", { unit: team });

  // A repository under the unit, one under the other company, and a model filed under the unit — the rows each reach
  // must tell apart.
  await administer(`/api/organization/units/${team}/repositories`, "POST", { name: TEAM_REPO, path: `/work/${TEAM_REPO}` });
  await administer(`/api/organization/units/${other}/repositories`, "POST", { name: OTHER_REPO, path: `/work/${OTHER_REPO}` });
  await administer("/api/models", "POST", { key: `registered::${MODEL}`, model: `${MODEL}-7b`, unit: team });

  browser = await chromium.launch();
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();

  if (origin === undefined || !touchReady()) return;

  // The run's own rows go back; the units stand on, as other files' run-named units do.
  await administer(`/api/models/registered%3A%3A${MODEL}`, "DELETE").catch(() => null);
  for (const name of [TEAM_REPO, OTHER_REPO, FILED]) await administer(`/api/repositories/${encodeURIComponent(name)}`, "DELETE").catch(() => null);
}, BROWSER_HOOK_MS);

// Waits out the clock for a value to read as asked: the screen answers its scoped reads and settles its address at
// its own speed.
async function until<T>(ask: () => Promise<T>, settled: (value: T) => boolean, limitMs = 20_000): Promise<T> {
  const stop = Date.now() + limitMs;

  for (;;) {
    const value = await ask();

    if (settled(value)) return value;
    if (Date.now() > stop) throw new Error("the screen did not settle as asked in time");

    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

async function opened(account: { name: string; password: string }, address: string): Promise<Page> {
  const context = await browser!.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block", reducedMotion: "reduce" });
  const cookie = cookies.get(account.name)!;
  const split = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, split), value: cookie.slice(split + 1), url: origin! }]);

  const page = await context.newPage();

  await page.goto(`${origin}${address}`, { waitUntil: "load" });
  await page.waitForFunction(() => window.useNuxtApp?.().isHydrating === false, null, { timeout: 30_000 });

  return page;
}

async function moved(page: Page, address: string): Promise<void> {
  await page.goto(`${origin}${address}`, { waitUntil: "load" });
  await page.waitForFunction(() => window.useNuxtApp?.().isHydrating === false, null, { timeout: 30_000 });
}

const address = (node: Record<string, string | number>, tab: string): string => `/organization?${new URLSearchParams(Object.fromEntries([["tab", tab], ...Object.entries(node).map(([key, value]) => [key, String(value)])])).toString()}`;

async function tabRow(page: Page): Promise<string[]> {
  return await platformTabs(page);
}

async function supervisorsText(page: Page): Promise<string> {
  return (await page.locator("[data-supervisors-table] tbody tr").allInnerTexts()).join("\n");
}

const urlTab = (page: Page): Promise<string | null> => Promise.resolve(new URL(page.url()).searchParams.get("tab"));

describe.skipIf(!origin || !touchReady())("the agent tabs follow the chain", () => {
  test("the platform's node keeps the whole for the administrator: every tab, every row of every unit", async () => {
    const page = await opened(ADMINISTRATOR, address({ company: "platform" }, "supervisors"));

    try {
      await page.locator("#setting-supervisor-agent-a").waitFor({ timeout: 20_000 });
      const row = await tabRow(page);

      for (const label of AGENT_TABS) expect(row).toContain(label);

      await moved(page, address({ company: "platform" }, "repositories"));
      await page.locator(`#setting-repository-${TEAM_REPO}`).waitFor({ timeout: 20_000 });
      expect(await page.locator(`#setting-repository-${OTHER_REPO}`).count()).toBe(1);
      expect(await page.locator("#setting-repository-repo-a").count()).toBe(1);

      await moved(page, address({ company: "platform" }, "models"));
      await page.locator(`[data-registration="${MODEL}"]`).waitFor({ timeout: 20_000 });
      expect(await page.locator('[data-registration="model-a"]').count()).toBe(1);
    } finally {
      await page.context().close();
    }
  }, 120_000);

  test("a head sees its unit and the units under it, the platform's presets standing at the platform node alone", async () => {
    const page = await opened(HEAD, address({ company }, "supervisors"));

    try {
      // The row completes once the reads have said the reader heads this company: the agent-settings tab, which
      // stands for no one who heads nothing, says the row has settled; the scoped answers stand in an empty table.
      await until(() => tabRow(page), (row) => row.includes(SUPERVISORS) && row.includes(wording("org_agents.label.tab")));

      const row = await tabRow(page);

      expect(row).toContain(SUPERVISORS);
      expect(row).toContain(REPOS);
      // The roles and the model files are the platform's presets and files: no head reads a tab of them at a company.
      expect(row).not.toContain(wording("agents.label.tab_roles"));
      expect(row).not.toContain(wording("agents.label.tab_model_files"));

      // The deployment's own supervisors stand at the platform's node, not under a company.
      expect(await until(() => supervisorsText(page), (text) => text === "" || text.length >= 0)).not.toContain("agent-a");

      // A tab the reader may not open at the node lands on the first one they may.
      await moved(page, address({ company }, "roles"));
      await until(() => urlTab(page), (tab) => tab !== null && tab !== "roles");

      // The unit's repository reads at the company, the subtree ask carrying the unit below it.
      await moved(page, address({ company }, "repositories"));
      await page.locator(`#setting-repository-${TEAM_REPO}`).waitFor({ timeout: 20_000 });
      expect(await page.locator(`#setting-repository-${OTHER_REPO}`).count()).toBe(0);
      expect(await page.locator("#setting-repository-repo-a").count()).toBe(0);

      // And at the unit itself, where the model filed under it stands too.
      await moved(page, address({ company, unit: team }, "repositories"));
      await page.locator(`#setting-repository-${TEAM_REPO}`).waitFor({ timeout: 20_000 });

      await moved(page, address({ company, unit: team }, "models"));
      await page.locator(`[data-registration="${MODEL}"]`).waitFor({ timeout: 20_000 });
      expect(await page.locator('[data-registration="model-a"]').count()).toBe(0);
    } finally {
      await page.context().close();
    }
  }, 120_000);

  test("a person reads their own rows at their own node, and none of the unit's anywhere else", async () => {
    const page = await opened(PERSON, address({ company: "me" }, "supervisors"));

    try {
      // The person's section opens the supervisors tab at their own link, and their own BMO is the one row it answers.
      const text = await until(() => supervisorsText(page), (held) => held.includes("reach-bmo"));

      expect(text).toContain("reach-bmo");
      expect(text).not.toContain("agent-a");

      // The repositories and the models are no sections they read: the tabs stand nowhere for them.
      const row = await tabRow(page);

      expect(row).toContain(SUPERVISORS);
      expect(row).not.toContain(REPOS);
      expect(row).not.toContain(MODELS);

      // A company they head not hands them none of its rows: wherever the screen lands them, the deployment's
      // supervisors never show there.
      await moved(page, address({ company }, "supervisors"));
      expect(await until(() => page.locator("[data-supervisors-table]").filter({ hasText: "agent-a" }).count(), (count) => count === 0)).toBe(0);
    } finally {
      await page.context().close();
    }
  }, 120_000);

  test("a reader who holds no agent section is handed none of the tabs", async () => {
    const page = await opened(OUTSIDER, address({ company: "me" }, "supervisors"));

    try {
      // The address naming a tab they may not open is taken to the first one they may.
      await until(() => urlTab(page), (tab) => tab !== null && tab !== "supervisors");

      const row = await tabRow(page);

      for (const label of AGENT_TABS) expect(row).not.toContain(label);
    } finally {
      await page.context().close();
    }
  }, 120_000);

  test("a repository added at a node is filed under it, and reads back at that node's own reach", async () => {
    const page = await opened(ADMINISTRATOR, address({ company }, "repositories"));

    try {
      await page.locator(`#setting-repository-${TEAM_REPO}`).waitFor({ timeout: 20_000 });
      await page.locator("[data-tab-add]").click();

      const dialog = page.getByRole("dialog");

      await dialog.getByLabel(wording("common.label.name"), { exact: true }).fill(FILED);
      await dialog.getByLabel(wording("common.label.path"), { exact: true }).fill(`/work/${FILED}`);

      const sent = page.waitForRequest((request) => request.method() === "POST" && new URL(request.url()).pathname.endsWith("/api/repositories"));

      await dialog.getByRole("button", { name: wording("common.action.add"), exact: true }).click();
      // The add carries the node's own unit; the agency files the row there.
      expect(((await sent).postDataJSON() as Record<string, unknown>).ownerUnit).toBe(company);

      await page.locator(`#setting-repository-${FILED}`).waitFor({ timeout: 20_000 });

      // The filing stands at the company it was made under, not among the rows of the unit below it.
      await moved(page, address({ company, unit: team }, "repositories"));
      await page.locator(`#setting-repository-${TEAM_REPO}`).waitFor({ timeout: 20_000 });
      expect(await page.locator(`#setting-repository-${FILED}`).count()).toBe(0);
    } finally {
      await page.context().close();
    }
  }, 120_000);
});
