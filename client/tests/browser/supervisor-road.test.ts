import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, BrowserContext } from "playwright-core";

// A supervisor's one road (docs/web.md, 「Agent management screen」 and 「Agent screen」): the supervisors' table stands
// each supervisor's road on one line, its cell opens the road's form, a road saved there is read back from the agency as
// saved, and a supervisor's screen marks a road that cannot take a turn now. A road on an outside engine warns where the
// supervisor runs as the owner's own user, and nowhere else. No call the screen makes names a route of the console's
// that reads a stand-in. It drives the console tests/support/browser-console.ts stands up, whose agency
// holds the road a test saves; the suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "supervisor-road", password: "fixture-password-2921" };
// The owner's account, the fixture's first (tests/support/browser-console.ts): a supervisor it adds is filed under it.
const OWNER = { name: "agent-topbar", password: "fixture-password-1558" };
// The default answerer's road as the agency stand-in serves it, put back once the file is done.
const ROAD_A = { provider: "claude-code", model: "claude-opus-5-5", effort: "high", thinking: null, answerTokens: null };

const CLAUDE = wording("agents.label.provider_claude_code");
const DEEPSEEK = wording("agents.label.provider_deepseek");

let browser: Browser | null = null;
let cookie = "";
let ownerCookie = "";

// What `read` answers once it holds, read again until it does or the time is up.
async function until<T>(read: () => Promise<T>, holds: (value: T) => boolean, ms = 10_000): Promise<T> {
  const end = Date.now() + ms;
  let value = await read();

  while (!holds(value) && Date.now() < end) {
    await new Promise((done) => setTimeout(done, 50));
    value = await read();
  }

  return value;
}

// Whether the screen made a call on the console's route ending in `route`, by that method.
const called = (asked: readonly string[], method: string, route: string): boolean => asked.some((one) => one.startsWith(`${method} `) && one.endsWith(route));

async function signedIn(as = cookie): Promise<{ context: BrowserContext; asked: string[] }> {
  const context = await browser!.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block", reducedMotion: "reduce" });
  const at = as.indexOf("=");
  const asked: string[] = [];

  await context.addCookies([{ name: as.slice(0, at), value: as.slice(at + 1), url: origin! }]);
  context.on("request", (request) => {
    const path = new URL(request.url()).pathname;

    if (path.includes("/api/")) asked.push(`${request.method()} ${path}`);
  });

  return { context, asked };
}

// The session cookie of a login.
async function signIn(account: { name: string; password: string }): Promise<string> {
  const login = await fetch(`${origin}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(account)
  });

  expect(login.ok).toBe(true);

  return login.headers.get("set-cookie")!.split(";")[0]!;
}

beforeAll(async () => {
  if (!origin || !touchReady()) return;

  cookie = await signIn(ACCOUNT);
  ownerCookie = await signIn(OWNER);
  browser = await chromium.launch();
}, BROWSER_HOOK_MS);

// Agent A's road put back to what the stand-in served, which the first test changes.
async function roadAPutBack(): Promise<void> {
  await fetch(`${origin}/api/supervisors/agent-a`, { method: "PATCH", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ road: ROAD_A }) });
}

afterAll(async () => {
  // The stand-in's road goes back to what it served, so a file run after this one reads it as it was.
  if (origin && cookie !== "") await roadAPutBack();

  await browser?.close();
}, BROWSER_HOOK_MS);

describe.skipIf(!origin || !touchReady())("a supervisor's road", () => {
  test("stands in the supervisors' table on one line, is changed in its form and read back as changed", async () => {
    const { context, asked } = await signedIn();

    try {
      const page = await context.newPage();
      const cellA = page.getByRole("button", { name: wording("agents.aria.road_of", { name: "Agent A" }), exact: true });
      const cellC = page.getByRole("button", { name: wording("agents.aria.road_of", { name: "Agent C" }), exact: true });

      await page.goto(`${origin}/agents?tab=supervisors`, { waitUntil: "load" });
      await cellA.waitFor({ timeout: 15_000 });
      expect((await cellA.innerText()).trim()).toBe(`${CLAUDE} · claude-opus-5-5 · high`);
      expect((await cellC.innerText()).trim()).toBe(`${DEEPSEEK} · deepseek-v4-pro`);

      // The form holds the road whole; a provider picked stands on the first model its catalogue serves.
      await cellA.click();

      const form = page.getByRole("dialog");

      await form.getByRole("combobox", { name: wording("agents.label.agent_provider"), exact: true }).click();
      await page.getByRole("option", { name: DEEPSEEK }).click();

      const model = form.getByRole("combobox", { name: wording("common.label.model"), exact: true });

      expect(await until(async () => (await model.innerText()).trim(), (text) => text.includes("deepseek-v4-pro"))).toContain("deepseek-v4-pro");
      await form.getByRole("button", { name: wording("common.action.save"), exact: true }).click();
      await form.waitFor({ state: "hidden", timeout: 10_000 });
      expect(await until(async () => (await cellA.innerText()).trim(), (text) => text === `${DEEPSEEK} · deepseek-v4-pro`)).toBe(`${DEEPSEEK} · deepseek-v4-pro`);

      // Read again from the agency, the road stands as saved.
      await page.reload({ waitUntil: "load" });
      await cellA.waitFor({ timeout: 15_000 });
      expect(await until(async () => (await cellA.innerText()).trim(), (text) => text === `${DEEPSEEK} · deepseek-v4-pro`)).toBe(`${DEEPSEEK} · deepseek-v4-pro`);

      expect(called(asked, "PATCH", "/api/supervisors/agent-a")).toBe(true);
      expect(asked.filter((one) => one.includes("stand-in"))).toEqual([]);
    } finally {
      await context.close();
    }
  }, 60_000);

  test("is marked on a supervisor's screen while it cannot take a turn now, and not while it can", async () => {
    const { context, asked } = await signedIn();

    try {
      const page = await context.newPage();

      await page.goto(`${origin}/agents/agent-c`, { waitUntil: "load" });
      await page.locator("[data-road-closed]").waitFor({ timeout: 15_000 });
      expect((await page.locator("[data-road-closed]").innerText()).trim()).toBe(wording("agents.status.road_closed"));
      // Why it cannot is the agency's sentence, read in the shared tooltip.
      await page.locator("[data-road-closed]").hover();
      await page.locator("[data-reka-popper-content-wrapper]").filter({ hasText: "The provider's quota is spent." }).first().waitFor({ timeout: 5_000 });

      await page.goto(`${origin}/agents/agent-a`, { waitUntil: "load" });
      expect(await until(async () => called(asked, "GET", "/api/supervisors/agent-a/road"), (seen) => seen, 15_000)).toBe(true);
      expect(await page.locator("[data-road-closed]").count()).toBe(0);
      expect(asked.filter((one) => one.includes("stand-in"))).toEqual([]);
    } finally {
      await context.close();
    }
  }, 60_000);

  test("warns on an outside engine for a supervisor of no account, and not on the owner's own engine", async () => {
    await roadAPutBack();

    const { context } = await signedIn();

    try {
      const page = await context.newPage();
      const warning = page.getByRole("dialog").getByRole("note");

      await page.goto(`${origin}/agents?tab=supervisors`, { waitUntil: "load" });

      // Agent C, filed under no account, stands on DeepSeek, which the agency's gateway serves.
      const cellC = page.getByRole("button", { name: wording("agents.aria.road_of", { name: "Agent C" }), exact: true });

      await cellC.waitFor({ timeout: 15_000 });
      await cellC.click();
      await warning.waitFor({ timeout: 10_000 });
      expect((await warning.innerText()).trim()).toBe(wording("agents.message.road_outside_owner", { provider: DEEPSEEK }));
      // The accessibility tree names it a note, holding the warning's words.
      const snapshot = await page.getByRole("dialog").ariaSnapshot();

      expect(snapshot).toContain("- note");
      expect(snapshot).toContain(wording("agents.message.road_outside_owner", { provider: DEEPSEEK }).split("\n")[0]!);
      await page.keyboard.press("Escape");
      await page.getByRole("dialog").waitFor({ state: "hidden", timeout: 10_000 });

      // Agent A stands on Claude Code, the owner's own; the warning follows the provider as it is picked.
      await page.getByRole("button", { name: wording("agents.aria.road_of", { name: "Agent A" }), exact: true }).click();

      const form = page.getByRole("dialog");
      const provider = form.getByRole("combobox", { name: wording("agents.label.agent_provider"), exact: true });

      await provider.waitFor({ timeout: 10_000 });
      expect(await warning.count()).toBe(0);
      await provider.click();
      await page.getByRole("option", { name: DEEPSEEK }).click();
      await warning.waitFor({ timeout: 10_000 });
      await provider.click();
      await page.getByRole("option", { name: CLAUDE }).click();
      await warning.waitFor({ state: "detached", timeout: 10_000 });
    } finally {
      await context.close();
    }
  }, 60_000);

  test("warns in the add dialog for the owner's login alone, whose new supervisor runs as the owner's user", async () => {
    // The dialog opens on the default answerer's road, Agent A's, which the first test changes.
    await roadAPutBack();

    // What the add dialog shows once DeepSeek is picked, for a login: whether the warning stands.
    const warnsFor = async (as: string): Promise<boolean> => {
      const { context } = await signedIn(as);

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/agents?tab=supervisors`, { waitUntil: "load" });
        await page.getByRole("button", { name: wording("agents.title.supervisor_add"), exact: true }).click();

        const form = page.getByRole("dialog");
        const provider = form.getByRole("combobox", { name: wording("agents.label.agent_provider"), exact: true });

        // The dialog opens on the default answerer's road, Claude Code, which never warns.
        await provider.waitFor({ timeout: 15_000 });
        expect(await until(async () => (await provider.innerText()).trim(), (text) => text === CLAUDE)).toBe(CLAUDE);
        expect(await form.getByRole("note").count()).toBe(0);
        await provider.click();
        await page.getByRole("option", { name: DEEPSEEK }).click();

        const model = form.getByRole("combobox", { name: wording("common.label.model"), exact: true });

        await until(async () => (await model.innerText()).trim(), (text) => text.includes("deepseek-v4-pro"));

        return (await form.getByRole("note").count()) === 1;
      } finally {
        await context.close();
      }
    };

    expect(await warnsFor(ownerCookie)).toBe(true);
    // Another administrator's supervisor is filed under their own account, which works on its own node.
    expect(await warnsFor(cookie)).toBe(false);
  }, 90_000);
});
