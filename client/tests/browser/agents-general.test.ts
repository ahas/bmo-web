import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium, devices } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { carryByMouse, centre, rowMarks } from "./row-carry";
import { BROWSER_HOOK_MS, fingerOn, touchReady } from "./touch";

import type { Browser, BrowserContext, Locator, Page } from "playwright-core";

// The agent management screen's tabs (docs/web.md, 「Agent management screen」): the supervisors, the roles and the
// repositories each stand as one shared settings table with every row the agency answers, filling its box with the
// room its columns leave standing as one empty column at the right edge, and a column's width dragged moves that
// column alone — every other column keeps the width it stood at and the empty column gives or takes the difference.
// It drives the console tests/support/browser-console.ts stands up; the suite stands up no console, so there it
// skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "agents-general", password: "fixture-password-2301" };

// A supervisor's road on a model of a long name, whose cell makes its table wider than a phone and the panel beside the
// TODO list.
const LONG_ROAD = { provider: "openrouter", model: "openrouter-model-with-a-long-name-standing-wider-than-its-ceiling", effort: "high", thinking: null, answerTokens: null };

let browser: Browser | null = null;
let cookie = "";

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

beforeAll(async () => {
  if (!origin || !touchReady()) return;

  const login = await fetch(`${origin}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(ACCOUNT)
  });

  expect(login.ok).toBe(true);
  cookie = login.headers.get("set-cookie")!.split(";")[0]!;
  browser = await chromium.launch();
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();
}, BROWSER_HOOK_MS);

describe.skipIf(!origin || !touchReady())("the agent management screen's tabs", () => {
  for (const [width, height, phone] of [[1280, 900, false], [360, 780, true]] as const) {
    test(`stand every supervisor, role and repository as a row, ${width}px wide`, async () => {
      const context = await browser!.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, serviceWorkers: "block", reducedMotion: "reduce" });
      const at = cookie.indexOf("=");

      await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/agents?tab=supervisors`, { waitUntil: "load" });
        await page.locator("#setting-supervisor-agent-a").waitFor({ timeout: 15_000 });
        expect(await page.locator("#setting-supervisor-agent-c").count()).toBe(1);
        expect((await page.locator(`[aria-label="${wording("agents.aria.settings_sections")}"]`).getByRole("tab").allInnerTexts()).map((one) => one.trim())).toEqual(
          ["agents.label.tab_roles", "agents.label.tab_supervisors", "agents.label.tab_repositories", "agents.label.tab_models", "agents.label.tab_model_files"].map((key) => wording(key))
        );

        await page.goto(`${origin}/agents?tab=roles`, { waitUntil: "load" });
        await page.locator("#setting-role-worker").waitFor({ timeout: 15_000 });
        for (const name of ["seeker", "producer", "builder", "scout", "voyager"]) expect(await page.locator(`#setting-role-${name}`).count()).toBe(1);

        await page.goto(`${origin}/agents?tab=repositories`, { waitUntil: "load" });
        await page.locator("#setting-repository-repo-a").waitFor({ timeout: 15_000 });
        expect(await page.locator("#setting-repository-repo-c").count()).toBe(1);

        // The page itself never scrolls sideways; a wide table scrolls inside its own box.
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

        // Every table fills its box: at a phone's width its columns pass the box, the empty column stands at no width
        // and the table scrolls sideways; wider, the empty column takes what the columns leave.
        const filled = await page.locator("[data-settings-table]").first().evaluate(fillOf);

        expect(filled.table).toBeGreaterThanOrEqual(filled.box);
        expect(filled.drawn).toEqual({ head: true, rows: true, named: false });
        expect(filled.handles).toBe(filled.heads);
        if (phone) expect({ filler: filled.filler, scrolls: filled.scrolls, table: filled.table }).toEqual({ filler: 0, scrolls: true, table: filled.columns });
        else expect(filled.filler).toBe(Math.max(0, filled.box - filled.columns));
      } finally {
        await context.close();
      }
    }, 60_000);
  }

  test("move only the dragged column, every other one keeping its width", async () => {
    const context = await browser!.newContext({ viewport: { width: 1600, height: 900 }, serviceWorkers: "block", reducedMotion: "reduce" });
    const at = cookie.indexOf("=");

    await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

    try {
      const page = await context.newPage();

      await page.goto(`${origin}/agents?tab=supervisors`, { waitUntil: "load" });
      await page.locator("#setting-supervisor-agent-a").waitFor({ timeout: 15_000 });

      // The supervisors' own table, the first of the tab's; the draft tables under it are tables of their own.
      const heads = page.locator("[data-settings-table]").first().locator("thead > tr > th");
      const widths = async (): Promise<number[]> =>
        await heads.evaluateAll((cells) => cells.map((cell) => Math.round(cell.getBoundingClientRect().width)));
      // The widths as they stand once every cell's words have been read in.
      let before = await widths();

      for (let settled = false; !settled; ) {
        await page.waitForTimeout(300);

        const now = await widths();

        settled = JSON.stringify(now) === JSON.stringify(before);
        before = now;
      }
      // The table fills its box, its columns narrower than the box at this width and the room they leave the empty
      // column's, last in every row, with no name and no edge to drag.
      const filled = await page.locator("[data-settings-table]").first().evaluate(fillOf);

      expect(filled.columns).toBeLessThan(filled.box);
      expect(filled.table).toBe(filled.box);
      expect(filled.filler).toBe(filled.box - filled.columns);
      expect(filled.drawn).toEqual({ head: true, rows: true, named: false });
      expect(filled.handles).toBe(filled.heads);
      expect(filled.scrolls).toBe(false);

      const edge = heads.nth(2).getByRole("separator");
      const box = (await edge.boundingBox())!;

      // A first drag holds every width, then narrows the third column by 40 pixels.
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 - 40, box.y + box.height / 2, { steps: 5 });
      await page.mouse.up();

      const after = await widths();
      const moved = (await edge.boundingBox())!;

      // The edge follows the pointer: the column narrows by what the pointer moved, the title and every other column
      // standing as they stood.
      expect(after[2]).toBe(before[2]! - 40);
      expect(Math.round(moved.x - box.x)).toBe(-40);
      expect(after.filter((_, index) => index !== 2)).toEqual(before.filter((_, index) => index !== 2));

      // The table still fills its box: the empty column at its right edge took the 40 pixels the column gave up.
      const held = await page.locator("[data-settings-table]").first().evaluate(fillOf);

      expect(held.table).toBe(held.box);
      expect(held.filler).toBe(held.box - held.columns);
      expect(held.filler).toBe(filled.filler + 40);
    } finally {
      await context.close();
    }
  }, 60_000);

  for (const [width, height, phone] of [[1280, 260, false], [360, 400, true]] as const) {
    test(`scroll each tab up and down in one box, each supervisors' tab table sideways in its own with its head held at the tab's top, ${width}px wide`, async () => {
      const context = await browser!.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, serviceWorkers: "block", reducedMotion: "reduce" });
      const at = cookie.indexOf("=");

      await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
      await context.route(/\/api\/supervisors$/, async (route) => {
        const answer = await (await route.fetch()).json();

        answer[0].road = LONG_ROAD;
        await route.fulfill({ json: answer });
      });

      try {
        const page = await context.newPage();

        // A tab of one table scrolls in the table's own box alone; the body around it stands still.
        await page.goto(`${origin}/agents?tab=roles`, { waitUntil: "load" });
        await page.locator("#setting-role-worker").waitFor({ timeout: 15_000 });
        expect(await page.locator("[data-settings-table]").first().evaluate(scrollersAbove)).toEqual({ scrollers: 1, body: "hidden" });

        // The supervisors' tab scrolls up and down in its body, each table sideways in its own box, and each table's head
        // stands at the body's top as its rows pass, inside the panel's edge.
        await page.goto(`${origin}/agents?tab=supervisors`, { waitUntil: "load" });
        await page.locator("[data-role-agents-table] [data-settings-table] tbody tr").first().waitFor({ timeout: 15_000 });

        for (const table of ["[data-supervisors-table]", "[data-role-agents-table] [data-settings-table]"]) {
          const stuck = await page.locator(table).evaluate(async (root) => {
            let body = root.parentElement!;

            while (!["auto", "scroll"].includes(getComputedStyle(body).overflowY)) body = body.parentElement!;

            const head = root.querySelector("thead")!;

            // Scrolled a little way into the table, its head's own place gone past the body's top.
            body.scrollTop += root.getBoundingClientRect().top - body.getBoundingClientRect().top + 20;
            await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));

            // Scrolled sideways in its own box, the head goes with its columns and stays held.
            root.scrollLeft = 40;
            await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));

            return {
              sideways: getComputedStyle(root).overflowX,
              gap: Math.round(head.getBoundingClientRect().top - body.getBoundingClientRect().top),
              body: getComputedStyle(body).overflowY,
              inside: root.getBoundingClientRect().right <= body.getBoundingClientRect().right + 0.5 && body.scrollWidth <= body.clientWidth,
              aligned: Math.round(head.getBoundingClientRect().left - root.querySelector("tbody")!.getBoundingClientRect().left)
            };
          });

          expect({ table, ...stuck }).toEqual({ table, sideways: "auto", gap: 0, body: "auto", inside: true, aligned: 0 });
        }

        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      } finally {
        await context.close();
      }
    }, 60_000);

    test(`drop a cell's dropdown as wide as what it holds and inside the screen, ${width}px wide`, async () => {
      const context = await browser!.newContext({ viewport: { width, height: 800 }, isMobile: phone, hasTouch: phone, serviceWorkers: "block", reducedMotion: "reduce" });
      const at = cookie.indexOf("=");
      const name = wording("agents.aria.threshold_of", { name: "" }).trim();

      await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/agents?tab=supervisors`, { waitUntil: "load" });

        const cell = page.locator(`button[aria-label$="${name}"]`).first();

        await cell.waitFor({ timeout: 15_000 });
        await cell.click();

        const drop = page.locator(`[role="group"][aria-label$="${name}"]`);

        await drop.waitFor();

        const measured = await drop.evaluate((box) => {
          const shown = box.getBoundingClientRect();
          // The same box laid out at its content's own width, with no floor and no ceiling.
          const copy = box.cloneNode(true) as HTMLElement;

          copy.style.cssText = "position: fixed; visibility: hidden; min-width: 0; max-width: none; width: max-content";
          document.body.append(copy);

          const own = copy.getBoundingClientRect().width;

          copy.remove();

          return { width: shown.width, left: shown.left, right: shown.right, own, cut: box.scrollWidth - box.clientWidth, screen: innerWidth };
        });
        const floor = (await cell.boundingBox())!.width;

        expect(measured.cut).toBeLessThanOrEqual(0);
        expect(measured.left).toBeGreaterThanOrEqual(0);
        expect(measured.right).toBeLessThanOrEqual(measured.screen);
        expect(Math.abs(measured.width - Math.min(Math.max(measured.own, floor), measured.screen - 16))).toBeLessThanOrEqual(1);
      } finally {
        await context.close();
      }
    }, 60_000);
  }

  test("stand a role's agents as rows of the agents tab, their own settings saved from their cells", async () => {
    const context = await browser!.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block", reducedMotion: "reduce" });
    const at = cookie.indexOf("=");
    // One role of three agents on one road, the first carrying a run, as the console's own route answers it.
    const seat = (index: number, extra: Record<string, unknown> = {}) => ({
      name: `worker-0${index}`, role: "worker", provider: "claude-code", model: "claude-opus-5-5", effort: "high", thinking: null, answerTokens: null,
      enabled: true, position: index, keepsCache: false, sessions: "keep", foldRatio: null, prompt: null, bundles: null, skills: null,
      followsSupervisor: false, carries: index === 1, ...extra
    });
    let agents = [seat(1), seat(2), seat(3)];
    const view = () => ({
      roles: [{
        name: "worker", label: "Worker", description: null, prompt: null, providerPrompts: {}, bundles: [{ name: "web.read", label: "Web reading" }], skills: null, line: "worker", agents,
        roads: [{ provider: "claude-code", model: "claude-opus-5-5", effort: "high", thinking: null, answerTokens: null }],
        maxConcurrent: agents.filter((one) => one.enabled).length, running: 1, waiting: 0, provider: "claude-code", waitingFor: null
      }],
      bundles: [{ name: "web.read", label: "Web reading" }],
      lines: ["worker"]
    });
    const sent: { method: string; name: string | null; body: unknown }[] = [];

    await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
    await context.route(/\/api\/roles$/, (route) => route.fulfill({ json: view() }));
    await context.route(/\/api\/role-agents(\/[^/]+)?$/, async (route) => {
      const request = route.request();
      const name = /\/role-agents\/([^/]+)$/.exec(new URL(request.url()).pathname)?.[1] ?? null;
      const body = request.method() === "DELETE" ? null : (request.postDataJSON() as Record<string, unknown>);

      sent.push({ method: request.method(), name, body });

      if (request.method() === "POST") {
        const added = seat(agents.length + 1, { ...body, carries: false });

        agents = [...agents, added];

        return await route.fulfill({ json: added });
      }

      if (request.method() === "DELETE") {
        agents = agents.filter((one) => one.name !== name);

        return await route.fulfill({ json: null });
      }

      agents = agents.map((one) => (one.name === name ? { ...one, ...body } : one)).sort((a, b) => a.position - b.position);

      return await route.fulfill({ json: agents.find((one) => one.name === name) });
    });

    try {
      const page = await context.newPage();

      // The roles tab stands the role as its preset, with how many of its agents go.
      await page.goto(`${origin}/agents?tab=roles`, { waitUntil: "load" });
      await page.locator("#setting-role-worker").waitFor({ timeout: 15_000 });
      expect(await page.locator("[data-settings-table] tbody tr").first().innerText()).toContain(wording("agents.label.role_running", { running: "1", cap: "3" }));

      // The agents tab stands each agent as a row, on its road.
      await page.goto(`${origin}/agents?tab=supervisors`, { waitUntil: "load" });

      // Each agent's row carries its name; the table's own measuring row carries none.
      const rows = page.locator("[data-role-agents-table] tbody tr").filter({ hasText: /worker-0\d/ });

      await rows.first().waitFor({ timeout: 15_000 });
      expect(await rows.count()).toBe(3);
      expect(await rows.first().innerText()).toContain("worker-01");
      expect(await rows.first().innerText()).toContain("claude-opus-5-5 · high");

      // Whether its last session is kept warm is its own switch, saved as it is thrown.
      await rows.nth(1).locator(`[role="switch"][aria-label="${wording("agents.aria.agent_keeps_cache_of", { name: "worker-02" })}"]`).click();
      expect(await until(async () => sent.length, (count) => count === 1)).toBe(1);
      expect(sent[0]).toEqual({ method: "PATCH", name: "worker-02", body: { keepsCache: true } });
      sent.length = 0;
    } finally {
      await context.close();
    }
  }, 90_000);

  for (const [width, height, phone] of [[1280, 900, false], [360, 780, true]] as const) {
    test(`open one agent's own settings in tabs, saved once from the foot, its role's texts read with the way to the role, ${width}px wide`, async () => {
      const context = await browser!.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, serviceWorkers: "block", reducedMotion: "reduce" });
      const at = cookie.indexOf("=");
      // One role of three agents: one on a provider that takes an advisor, one on a provider that takes none and one
      // that follows the supervisor that asks it.
      const seat = (index: number, extra: Record<string, unknown> = {}) => ({
        name: `worker-0${index}`, role: "worker", provider: "claude-code", model: "claude-opus-5-5", effort: "high", thinking: null, answerTokens: null, advisor: null,
        enabled: true, position: index, keepsCache: false, sessions: "keep", foldRatio: null, prompt: null, bundles: null, skills: null,
        followsSupervisor: false, carries: false, ...extra
      });
      let agents = [
        seat(1),
        seat(2, { provider: "deepseek", model: "deepseek-v4-pro", effort: null }),
        seat(3, { provider: null, model: null, effort: null, followsSupervisor: true })
      ];
      const view = () => ({
        roles: [{
          name: "worker", label: "Worker", description: null, prompt: ROLE_TEXT, providerPrompts: { "claude-code": "provider-text-a" }, bundles: [], skills: null, line: "worker", agents,
          roads: [], maxConcurrent: agents.length, running: 0, waiting: 0, provider: "claude-code", waitingFor: null
        }],
        bundles: [{ name: "web.read", label: "Web reading" }],
        skills: ["skill-a"],
        lines: ["worker"]
      });
      // A role prompt longer than the dialog's body, which scrolls under the tab row and beside the side list.
      const ROLE_TEXT = ["role-text-a", ...Array.from({ length: 120 }, (_, at) => `line-${at}`)].join("\n");
      const sent: { method: string; name: string | null; body: unknown }[] = [];

      await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
      await context.route(/\/api\/roles$/, (route) => route.fulfill({ json: view() }));
      await context.route(/\/api\/roles\/worker\/sessions/, (route) => route.fulfill({ json: { items: [], more: false } }));
      await context.route(/\/api\/role-agents(\/[^/]+)?$/, async (route) => {
        const request = route.request();
        const name = /\/role-agents\/([^/]+)$/.exec(new URL(request.url()).pathname)?.[1] ?? null;
        const body = request.postDataJSON() as Record<string, unknown>;

        sent.push({ method: request.method(), name, body });

        if (request.method() === "POST") {
          const added = seat(agents.length + 1, body);

          agents = [...agents, added];

          return await route.fulfill({ json: added });
        }

        agents = agents.map((one) => (one.name === name ? { ...one, ...body } : one));

        return await route.fulfill({ json: agents.find((one) => one.name === name) });
      });

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/agents?tab=supervisors`, { waitUntil: "load" });

        const rows = page.locator("[data-role-agents-table] tbody tr").filter({ hasText: /worker-0\d/ });
        const open = async (name: string): Promise<Locator> => {
          await rows.locator("button", { hasText: name }).click();
          await page.locator("[data-agent-settings]").waitFor({ timeout: 15_000 });

          return page.getByRole("dialog");
        };
        const save = () => page.getByRole("dialog").getByRole("button", { name: wording("common.action.save"), exact: true });
        const discard = () => page.getByRole("button", { name: wording("common.action.discard"), exact: true });

        await rows.first().waitFor({ timeout: 15_000 });

        // The dialog holds the one agent pressed, none of its role's others, its fields in four tabs.
        let dialog = await open("worker-01");

        expect(await dialog.getByRole("heading", { name: "worker-01", exact: true }).count()).toBe(1);
        expect(await dialog.innerText()).not.toContain("worker-02");
        expect((await dialog.locator("[data-agent-tabs]").getByRole("tab").allInnerTexts()).map((one) => one.trim())).toEqual(
          ["agents.label.agent_tab_general", "agents.label.column_sessions", "agents.label.agent_prompt", "agents.label.agent_tab_features"].map((key) => wording(key))
        );

        // On a provider that takes one, the advisor stands plainly beside the provider; picked, it waits for the save.
        const advisor = dialog.locator("[data-road-advisor]");

        expect(await advisor.isVisible()).toBe(true);
        expect(await dialog.locator("[data-road-provider]").innerText()).not.toContain(wording("agents.message.advisor_only_on", { providers: "Claude Code" }));
        expect(await save().isDisabled()).toBe(true);
        await advisor.getByRole("button").click();
        await page.getByRole("option", { name: "opus", exact: true }).click();
        await page.getByRole("listbox").waitFor({ state: "detached", timeout: 10_000 });
        expect(sent).toEqual([]);
        // Closed with the change, it asks; Back on the question keeps the dialog and its change.
        await page.keyboard.press("Escape");
        await discard().waitFor({ timeout: 10_000 });
        await page.goBack();
        await discard().waitFor({ state: "detached", timeout: 10_000 });
        expect((await advisor.getByRole("button").innerText()).trim()).toBe("opus");

        // The one save sends the road whole and the dialog closes.
        await save().click();
        await page.locator("[data-agent-settings]").waitFor({ state: "detached", timeout: 10_000 });
        expect(sent).toEqual([{ method: "PATCH", name: "worker-01", body: { provider: "claude-code", model: "claude-opus-5-5", effort: "high", thinking: null, answerTokens: null, advisor: "opus" } }]);

        // On a provider that takes none, the line under the provider says why no advisor stands; opened and closed
        // untouched, the dialog asks nothing, on Back as on Esc.
        dialog = await open("worker-02");
        expect(await dialog.locator("[data-road-advisor]").count()).toBe(0);
        expect(await dialog.locator("[data-road-provider]").innerText()).toContain(wording("agents.message.advisor_only_on", { providers: "Claude Code" }));
        await page.goBack();
        await page.locator("[data-agent-settings]").waitFor({ state: "detached", timeout: 10_000 });
        expect(await discard().count()).toBe(0);

        // A value changed and changed back is no change: the save stays off and closing asks nothing.
        dialog = await open("worker-02");
        await dialog.locator("[data-agent-enabled]").click();
        expect(await save().isDisabled()).toBe(false);
        await dialog.locator("[data-agent-enabled]").click();
        expect(await save().isDisabled()).toBe(true);
        await page.keyboard.press("Escape");
        await page.locator("[data-agent-settings]").waitFor({ state: "detached", timeout: 10_000 });
        expect(await discard().count()).toBe(0);

        // One that follows its supervisor uses the asking supervisor's advisor, which the line under the provider says.
        dialog = await open("worker-03");
        expect(await dialog.locator("[data-road-provider]").innerText()).toContain(wording("agents.message.advisor_follows"));

        // The system prompt's texts: a side list beside the text, a select over it on a phone; the role's are read,
        // said to be the role's, with the way to the role's dialog.
        await dialog.locator("[data-agent-tabs]").getByRole("tab", { name: wording("agents.label.agent_prompt") }).click();
        expect(await dialog.locator("[data-agent-prompt-section='own'] textarea").count()).toBe(1);

        const pick = async (label: string): Promise<void> => {
          if (phone) {
            await dialog.locator("[data-agent-prompt-select]").click();
            await page.getByRole("option", { name: label, exact: true }).click();
            await page.getByRole("listbox").waitFor({ state: "detached", timeout: 10_000 });
          } else {
            await dialog.locator("[data-agent-prompt-list]").getByText(label, { exact: true }).click();
          }
        };

        expect(await dialog.locator("[data-agent-prompt-list]").isVisible()).toBe(!phone);
        expect(await dialog.locator("[data-agent-prompt-select]").isVisible()).toBe(phone);
        await pick(wording("agents.aria.provider_prompt_of", { provider: "Claude Code" }));
        expect((await dialog.locator("[data-role-text]").innerText()).trim()).toBe("provider-text-a");
        await pick(wording("agents.label.role_prompt"));
        expect((await dialog.locator("[data-role-text]").innerText()).trim()).toBe(ROLE_TEXT);

        // Scrolled to its end, the text leaves the tab row at the body's top and the side list under it.
        const body = dialog.locator("[data-slot=body]");

        await body.evaluate((box) => box.scrollTo({ top: box.scrollHeight }));

        const shown = (await body.boundingBox())!;
        const tabRow = (await dialog.locator("[data-agent-tabs]").boundingBox())!;

        expect(await body.evaluate((box) => box.scrollTop)).toBeGreaterThan(0);
        expect(Math.abs(tabRow.y - shown.y)).toBeLessThanOrEqual(1);

        // The tab row runs from one side of the dialog to the other, its line with it.
        const row = (await dialog.locator("[data-agent-tabs]").locator("xpath=..").boundingBox())!;

        expect(Math.abs(row.x - shown.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(row.width - (await body.evaluate((box) => box.clientWidth)))).toBeLessThanOrEqual(1);
        if (!phone) {
          const list = (await dialog.locator("[data-agent-prompt-list]").boundingBox())!;

          expect(list.y).toBeGreaterThanOrEqual(tabRow.y + tabRow.height);
          expect(list.y + list.height).toBeLessThanOrEqual(shown.y + shown.height);
        }
        expect(await dialog.locator("[data-role-shared]").innerText()).toContain(wording("agents.message.role_shared"));

        // The role's dialog opens over this one, and Back closes it alone.
        await dialog.locator("[data-role-open]").click();
        await page.getByRole("dialog", { name: "worker", exact: true }).waitFor({ timeout: 10_000 });
        await page.goBack();
        await page.getByRole("dialog", { name: "worker", exact: true }).waitFor({ state: "detached", timeout: 10_000 });
        expect(await page.locator("[data-agent-settings]").count()).toBe(1);
        await page.keyboard.press("Escape");
        await page.locator("[data-agent-settings]").waitFor({ state: "detached", timeout: 10_000 });

        // An agent added from the table's head opens its own settings.
        sent.length = 0;
        await page.locator("[data-agent-add]").click();
        await page.getByRole("menuitem", { name: "worker", exact: true }).click();
        await page.locator("[data-agent-settings]").waitFor({ timeout: 10_000 });
        expect(await page.getByRole("dialog").getByRole("heading", { name: "worker-04", exact: true }).count()).toBe(1);
      } finally {
        await context.close();
      }
    }, 90_000);
  }

  for (const [width, height, phone] of [[1280, 900, false], [360, 780, true]] as const) {
    test(`hold a role's provider prompts in its dialog, a box for each provider of its line and for one it still holds, ${width}px wide`, async () => {
      const context = await browser!.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, serviceWorkers: "block", reducedMotion: "reduce" });
      const at = cookie.indexOf("=");
      // A role on the search line holding a text for a provider whose program no longer carries that line.
      const held = {
        name: "voyager", label: "Voyager", description: null, prompt: null, bundles: [], skills: null, line: "search", agents: [], roads: [],
        maxConcurrent: 0, running: 0, waiting: 0, provider: null, waitingFor: null, providerPrompts: { registered: "text-held" }
      };
      const sent: unknown[] = [];

      await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
      await context.route(/\/api\/roles$/, (route) => route.fulfill({ json: { roles: [held], bundles: [], skills: [], lines: ["worker", "search"] } }));
      await context.route(/\/api\/roles\/voyager$/, async (route) => {
        sent.push(route.request().postDataJSON());

        await route.fulfill({ json: held });
      });

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/agents?tab=roles`, { waitUntil: "load" });
        await page.locator("#setting-role-voyager").click({ timeout: 15_000 });

        const dialog = page.getByRole("dialog");
        const boxes = dialog.locator("[data-provider-prompts] textarea");

        // The providers whose program carries the search line, in the agency's order, then the one the role still holds.
        await boxes.nth(2).waitFor({ timeout: 10_000 });
        expect(await boxes.evaluateAll((all) => all.map((one) => one.closest("[data-provider-prompt]")?.getAttribute("data-provider-prompt")))).toEqual([
          "claude-code",
          "deepseek",
          "registered"
        ]);
        // Each box is named by its provider's word, the one its field's label shows, and the held text stands in its own.
        const word = (await dialog.locator(`label[for="${await boxes.nth(2).getAttribute("id")}"]`).innerText()).trim();

        expect(await dialog.getByRole("textbox", { name: wording("agents.aria.provider_prompt_of", { provider: word }) }).inputValue()).toBe("text-held");

        // Every box stands inside the dialog's width.
        const inside = await dialog.locator("[data-provider-prompts]").evaluate((list) => {
          const frame = list.closest("[role=dialog]")!.getBoundingClientRect();

          return [...list.querySelectorAll("textarea")].every((one) => {
            const box = one.getBoundingClientRect();

            return box.left >= frame.left && box.right <= frame.right;
          });
        });

        expect(inside).toBe(true);

        // A box opened and left empty is no change; a text written and one emptied are, and go in one save.
        const save = dialog.getByRole("button", { name: wording("common.action.save") });

        await boxes.nth(1).fill("");
        expect(await save.isDisabled()).toBe(true);
        await boxes.nth(0).fill("text-a");
        await boxes.nth(2).fill("");
        await save.click();
        expect(await until(async () => sent.length, (count) => count === 1)).toBe(1);
        expect(sent[0]).toEqual({ providerPrompts: { "claude-code": "text-a", registered: null } });
      } finally {
        await context.close();
      }
    }, 60_000);

    test(`choose under an agent's road whether it follows its asker, its role's setting marked as the default, and switch the role's, ${width}px wide`, async () => {
      const context = await browser!.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, serviceWorkers: "block", reducedMotion: "reduce" });
      const at = cookie.indexOf("=");
      // A role whose agents follow their asker: one agent on a road of its own going by the role's setting, and one
      // naming no road, which follows always.
      const seat = (index: number, extra: Record<string, unknown> = {}) => ({
        name: `voice-0${index}`, role: "voice", provider: "deepseek", model: "deepseek-v4-pro", effort: null, thinking: null, answerTokens: null, advisor: null,
        enabled: true, keepsCache: false, sessions: "keep", foldRatio: null, prompt: null, bundles: null, skills: null,
        followsAsker: null, followsSupervisor: true, carries: false, ...extra
      });
      let agents = [seat(1), seat(2, { provider: null, model: null })];
      let followsAsker = true;
      const role = () => ({
        name: "voice", label: "Voice", description: null, prompt: null, providerPrompts: {}, bundles: [], skills: null, line: "worker", agents, roads: [],
        maxConcurrent: agents.length, followsAsker, running: 0, waiting: 0, provider: null, waitingFor: null
      });
      const sent: { path: string; body: unknown }[] = [];

      await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
      await context.route(/\/api\/roles$/, (route) => route.fulfill({ json: { roles: [role()], bundles: [], skills: [], lines: ["worker"] } }));
      await context.route(/\/api\/roles\/voice\/sessions/, (route) => route.fulfill({ json: { items: [], more: false } }));
      await context.route(/\/api\/roles\/voice$/, async (route) => {
        const body = route.request().postDataJSON() as { followsAsker?: boolean };

        sent.push({ path: "role", body });
        followsAsker = body.followsAsker ?? followsAsker;
        await route.fulfill({ json: role() });
      });
      await context.route(/\/api\/role-agents\/[^/]+$/, async (route) => {
        const name = /\/role-agents\/([^/]+)$/.exec(new URL(route.request().url()).pathname)?.[1] ?? "";
        const body = route.request().postDataJSON() as Record<string, unknown>;

        sent.push({ path: name, body });
        agents = agents.map((one) => (one.name === name ? { ...one, ...body } : one));
        await route.fulfill({ json: agents.find((one) => one.name === name) });
      });

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/agents?tab=supervisors`, { waitUntil: "load" });

        const rows = page.locator("[data-role-agents-table] tbody tr").filter({ hasText: /voice-0\d/ });
        const open = async (name: string): Promise<Locator> => {
          await rows.locator("button", { hasText: name }).click();
          await page.locator("[data-agent-settings]").waitFor({ timeout: 15_000 });

          return page.getByRole("dialog");
        };
        const pick = async (dialog: Locator, label: string) => {
          await dialog.locator("[data-agent-follows]").click();
          await page.getByRole("option", { name: label, exact: true }).click();
          await page.getByRole("listbox").waitFor({ state: "detached", timeout: 10_000 });
        };
        const on = wording("agents.label.default_marked", { value: wording("agents.label.switch_on") });
        const off = wording("agents.label.switch_off");
        const discard = () => page.getByRole("button", { name: wording("common.action.discard"), exact: true });

        await rows.first().waitFor({ timeout: 15_000 });

        // An agent on a road of its own going by its role stands on the role's choice, marked as the default.
        let dialog = await open("voice-01");
        const save = () => dialog.getByRole("button", { name: wording("common.action.save"), exact: true });

        expect((await dialog.locator("[data-agent-follows]").innerText()).trim()).toBe(on);
        expect(await dialog.locator("[data-agent-follows]").evaluate((one) => one.getBoundingClientRect().right <= one.closest("[role=dialog]")!.getBoundingClientRect().right)).toBe(true);

        // Changed and closed, it asks; Back on the question leaves it open with the change kept.
        await pick(dialog, off);
        await page.keyboard.press("Escape");
        await discard().waitFor({ timeout: 10_000 });
        await page.keyboard.press("Escape");
        await discard().waitFor({ state: "detached", timeout: 10_000 });
        expect((await dialog.locator("[data-agent-follows]").innerText()).trim()).toBe(off);

        // Chosen back on, it is no change.
        await pick(dialog, on);
        expect(await save().isDisabled()).toBe(true);

        // Off is its own setting, sent as false.
        await pick(dialog, off);
        await save().click();
        await dialog.waitFor({ state: "detached", timeout: 10_000 });
        expect(sent.at(-1)).toEqual({ path: "voice-01", body: { followsAsker: false } });

        // The role's choice chosen again is the role's own, sent as none.
        dialog = await open("voice-01");
        expect((await dialog.locator("[data-agent-follows]").innerText()).trim()).toBe(off);
        await pick(dialog, on);
        await save().click();
        await dialog.waitFor({ state: "detached", timeout: 10_000 });
        expect(sent.at(-1)).toEqual({ path: "voice-01", body: { followsAsker: null } });

        // An agent naming no road follows always, and is offered no choice.
        dialog = await open("voice-02");
        expect(await dialog.locator("[data-agent-follows]").count()).toBe(0);
        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "detached", timeout: 10_000 });

        // The role's dialog holds the role's own switch, its change sent alone.
        await page.goto(`${origin}/agents?tab=roles`, { waitUntil: "load" });
        await page.locator("#setting-role-voice").click({ timeout: 15_000 });

        const roleDialog = page.getByRole("dialog");
        const follows = roleDialog.getByRole("switch", { name: wording("agents.label.agent_follows"), exact: true });

        await follows.waitFor({ timeout: 10_000 });
        expect(await follows.getAttribute("aria-checked")).toBe("true");
        await follows.click();
        // Switched and closed, it asks; Back on the question leaves the switch as it was turned.
        await page.keyboard.press("Escape");
        await discard().waitFor({ timeout: 10_000 });
        await page.keyboard.press("Escape");
        await discard().waitFor({ state: "detached", timeout: 10_000 });
        expect(await follows.getAttribute("aria-checked")).toBe("false");
        await roleDialog.getByRole("button", { name: wording("common.action.save"), exact: true }).click();
        expect(await until(async () => sent.at(-1)?.path, (path) => path === "role")).toBe("role");
        expect(sent.at(-1)).toEqual({ path: "role", body: { followsAsker: false } });
      } finally {
        await context.close();
      }
    }, 60_000);
  }

  test("stand every column of the agents tab's tables at its own width, the room left over one empty column at the table's edge", async () => {
    const context = await browser!.newContext({ viewport: { width: 1600, height: 900 }, serviceWorkers: "block", reducedMotion: "reduce" });
    const at = cookie.indexOf("=");

    await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

    try {
      const page = await context.newPage();

      await page.goto(`${origin}/agents?tab=supervisors`, { waitUntil: "load" });
      await page.locator("[data-role-agents-table] [data-settings-table] tbody tr").first().waitFor({ timeout: 15_000 });
      await page.waitForTimeout(500);

      for (const [table, title] of [["[data-supervisors-table]", 0], ["[data-role-agents-table] [data-settings-table]", 0]] as const) {
        // The widths as the table stands, then as it stands while its content is measured, every column at what its
        // name and widest cell take whole: no column stands wider than its content, the title's included, a column
        // under a ceiling stands narrower only where its content passes it, and the table is as wide as its columns or
        // its box, whichever is wider. The empty column is not drawn while the content is measured.
        const widths = await page.locator(table).evaluate((root) => {
          const heads = [...root.querySelectorAll<HTMLElement>(":scope > table > thead > tr > th")];
          const read = () => heads.map((head) => Math.round(head.getBoundingClientRect().width));
          const standing = read();

          root.setAttribute("data-measuring", "");

          const own = read();
          const measuredFiller = getComputedStyle(heads[0]!.parentElement!, "::after").display;

          root.removeAttribute("data-measuring");

          return { standing, own, measuredFiller, box: root.clientWidth, table: Math.round(root.querySelector("table")!.getBoundingClientRect().width) };
        });
        const sum = widths.standing.reduce((all, one) => all + one, 0);

        expect({ table, width: Math.abs(widths.table - Math.max(sum, widths.box)) <= widths.standing.length }).toEqual({ table, width: true });
        expect({ table, measuredFiller: widths.measuredFiller }).toEqual({ table, measuredFiller: "none" });
        expect({ table, title: Math.abs(widths.standing[title]! - widths.own[title]!) <= 1 }).toEqual({ table, title: true });
        for (const [index, width] of widths.standing.entries()) {
          expect({ table, index, fits: width <= widths.own[index]! + 1 && width >= Math.min(widths.own[index]!, 240) }).toEqual({ table, index, fits: true });
        }
      }
    } finally {
      await context.close();
    }
  }, 60_000);
});

// How a settings table fills its box, in whole pixels: the box's inner width, the table's, its columns' together, and
// the empty column's, the room between the last column's right edge and the table's; whether that column is drawn in
// the head's row and every body row and holds no words; how many names and edges to drag the head carries; and
// whether the box scrolls sideways.
function fillOf(root: Element): {
  box: number;
  table: number;
  columns: number;
  filler: number;
  drawn: { head: boolean; rows: boolean; named: boolean };
  heads: number;
  handles: number;
  scrolls: boolean;
} {
  const table = root.querySelector(":scope > table")!;
  const heads = [...table.querySelectorAll<HTMLElement>(":scope > thead > tr > th")];
  const rows = [...table.querySelectorAll<HTMLElement>(":scope > tbody > tr")];
  const edge = table.getBoundingClientRect();
  const last = heads.at(-1)!.getBoundingClientRect();
  const filler = (row: Element) => getComputedStyle(row, "::after");

  return {
    box: root.clientWidth,
    table: Math.round(edge.width),
    columns: Math.round(last.right - heads[0]!.getBoundingClientRect().left),
    filler: Math.round(edge.right - last.right),
    drawn: {
      head: filler(heads[0]!.parentElement!).display === "table-cell",
      rows: rows.length > 0 && rows.every((row) => filler(row).display === "table-cell"),
      named: [heads[0]!.parentElement!, ...rows].some((row) => filler(row).content !== '""')
    },
    heads: heads.length,
    handles: table.querySelectorAll('thead [role="separator"]').length,
    scrolls: root.scrollWidth > root.clientWidth
  };
}

// Which scrolling boxes stand between a table's first row and the page: the table's own alone, the body around it
// not scrolling.
function scrollersAbove(root: Element): { scrollers: number; body: string } {
  let scrollers = 0;

  for (let at: Element | null = root.querySelector("tbody tr"); at !== null; at = at.parentElement) {
    const style = getComputedStyle(at);

    if ((style.overflowY === "auto" || style.overflowY === "scroll") && at.scrollHeight > at.clientHeight) scrollers += 1;
  }

  return { scrollers, body: getComputedStyle(root.closest("section")!.parentElement!).overflowY };
}

// The repositories as the agency would keep them, `repo-a` holding the prefix documents a save last sent, so the
// order a drag saved is the order a reload reads again.
async function keptPrefixDocuments(context: BrowserContext, documents: string[]): Promise<{ saves: Record<string, unknown>[] }> {
  let kept = documents;
  const saves: Record<string, unknown>[] = [];
  const withKept = (repository: Record<string, unknown>) => (repository.name === "repo-a" ? { ...repository, prefixDocuments: kept } : repository);

  await context.route(/\/api\/repositories(\/repo-a)?$/, async (route) => {
    const answer = await route.fetch({ method: "GET", url: route.request().url().replace(/\/repo-a$/, "") });
    const listed = ((await answer.json()) as Record<string, unknown>[]).map(withKept);

    if (route.request().method() !== "PATCH") return await route.fulfill({ json: listed });

    const body = route.request().postDataJSON() as Record<string, unknown>;

    saves.push(body);
    kept = (body.prefixDocuments as string[] | undefined) ?? kept;
    await route.fulfill({ json: listed.map(withKept).find((one) => one.name === "repo-a") });
  });

  return { saves };
}

// `repo-a`'s dialog opened from its row, and its list of prefix documents.
async function openPrefixDocuments(page: Page): Promise<Locator> {
  await page.goto(`${origin}/agents?tab=repositories`, { waitUntil: "load" });
  await page.locator("#setting-repository-repo-a").click({ timeout: 15_000 });

  const first = page.getByRole("dialog").locator("[data-prefix-document]").first();

  await first.waitFor({ timeout: 15_000 });

  return first.locator("..");
}

async function prefixOrder(list: Locator): Promise<string[]> {
  return await list.locator("[data-prefix-document]").evaluateAll((rows) => rows.map((row) => row.querySelector(".font-mono")!.textContent!.trim()));
}

function prefixHandle(list: Locator, at: number): Locator {
  return list.locator("[data-prefix-document]").nth(at).getByRole("img", { name: wording("agents.aria.drag_reorder") });
}

// Saved with the dialog's one save, the dialog closes and the screen loaded afresh reads the list again.
async function savedAndReread(page: Page, saves: Record<string, unknown>[]): Promise<Locator> {
  await page.getByRole("dialog").getByRole("button", { name: wording("common.action.save"), exact: true }).click();
  await until(async () => saves.length, (count) => count > 0);
  await page.getByRole("dialog").waitFor({ state: "detached", timeout: 15_000 });
  await page.reload({ waitUntil: "load" });

  return await openPrefixDocuments(page);
}

describe.skipIf(!origin || !touchReady())("a repository's prefix document carried by its handle", () => {
  const DOCUMENTS = ["docs/a.md", "docs/b.md", "docs/c.md"];

  test("with the mouse lands where its row is lit, and the order saved stands after a reload", async () => {
    const context = await browser!.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block", reducedMotion: "reduce" });
    const at = cookie.indexOf("=");

    await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

    const { saves } = await keptPrefixDocuments(context, DOCUMENTS);

    try {
      const page = await context.newPage();
      let list = await openPrefixDocuments(page);

      expect(await prefixOrder(list)).toEqual(DOCUMENTS);

      // The last carried up onto the first: while held it stands marked and the first's row is lit where it lands.
      const marks = await carryByMouse(page, await centre(prefixHandle(list, 2)), await centre(list.locator("[data-prefix-document]").first()), async () => await rowMarks(list));

      expect(marks).toEqual({ held: [2], over: [0] });
      expect(await prefixOrder(list)).toEqual(["docs/c.md", "docs/a.md", "docs/b.md"]);
      expect(await rowMarks(list)).toEqual({ held: [], over: [] });

      list = await savedAndReread(page, saves);
      expect(saves).toEqual([{ prefixDocuments: ["docs/c.md", "docs/a.md", "docs/b.md"] }]);
      expect(await prefixOrder(list)).toEqual(["docs/c.md", "docs/a.md", "docs/b.md"]);
    } finally {
      await context.close();
    }
  }, 120_000);

  test("with a finger on a phone lands where it is let go, and the order saved stands after a reload", async () => {
    const context = await browser!.newContext({ ...devices["Pixel 5"], serviceWorkers: "block", reducedMotion: "reduce" });
    const at = cookie.indexOf("=");

    await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

    const { saves } = await keptPrefixDocuments(context, DOCUMENTS);

    try {
      const page = await context.newPage();
      const finger = await fingerOn(page);
      let list = await openPrefixDocuments(page);

      // A finger on the handle carries the row rather than scrolling the dialog.
      await prefixHandle(list, 0).scrollIntoViewIfNeeded();
      await finger.swipe(await centre(prefixHandle(list, 0)), await centre(list.locator("[data-prefix-document]").nth(2)), { steps: 12 });
      expect(await prefixOrder(list)).toEqual(["docs/b.md", "docs/c.md", "docs/a.md"]);

      list = await savedAndReread(page, saves);
      expect(saves).toEqual([{ prefixDocuments: ["docs/b.md", "docs/c.md", "docs/a.md"] }]);
      expect(await prefixOrder(list)).toEqual(["docs/b.md", "docs/c.md", "docs/a.md"]);
    } finally {
      await context.close();
    }
  }, 120_000);
});

// An umbrella repository (docs/web.md, the repositories tab): its row says it is one in place of a support count, and
// its dialog's switch locks the count at 0 and offers no node checkout, the agency's refusal of one left standing said
// under the switch in the dialog's own words.
describe.skipIf(!origin || !touchReady())("an umbrella repository", () => {
  for (const [width, height, phone] of [[1280, 900, false], [360, 780, true]] as const) {
    test(`stands as one on its row and is set in its dialog, ${width}px wide`, async () => {
      const context = await browser!.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, serviceWorkers: "block", reducedMotion: "reduce" });
      const at = cookie.indexOf("=");

      await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

      try {
        const page = await context.newPage();
        const rowOf = (name: string): Locator => page.locator("tr", { has: page.locator(`#setting-repository-${name}`) });

        await page.goto(`${origin}/agents?tab=repositories`, { waitUntil: "load" });
        await page.locator("#setting-repository-repo-u").waitFor({ timeout: 15_000 });
        expect(await rowOf("repo-u").innerText()).toContain(wording("agents.label.checkouts_value_umbrella", { held: "0", all: "1" }));

        await page.locator("#setting-repository-repo-a").click();

        const dialog = page.getByRole("dialog");
        const umbrella = dialog.locator("[data-repository-umbrella]");
        const support = dialog.locator("[data-repository-support]");
        const count = support.locator("[data-support-count]");
        const shown = async (): Promise<string> => ((await count.textContent().catch(() => "")) ?? "").trim();
        const locked = async (): Promise<boolean> => await count.evaluate((select) => select.matches(":disabled") || select.hasAttribute("data-disabled"));
        const nodes = dialog.locator("[data-repository-node-checkouts]");
        const addNode = nodes.getByRole("button", { name: wording("agents.action.node_checkout_add"), exact: true });

        expect(await until(shown, (value) => value === "2", 15_000)).toBe("2");
        expect(await addNode.count()).toBe(1);

        // Turned on, the count stands locked at 0 and no node checkout is added; the one standing stays listed.
        await umbrella.getByRole("switch").click();
        expect(await shown()).toBe("0");
        expect(await locked()).toBe(true);
        expect(await support.innerText()).toContain(wording("agents.message.umbrella_no_support"));
        expect(await addNode.count()).toBe(0);
        expect(await nodes.innerText()).toContain(wording("agents.message.umbrella_no_node_checkouts"));
        expect(await nodes.locator("[data-node-checkout]").count()).toBe(1);

        // Saved with the node checkout still standing, the agency refuses, and the dialog says why under the switch.
        const sent = page.waitForRequest((request) => request.method() === "PATCH" && new URL(request.url()).pathname.endsWith("/api/repositories/repo-a"));

        await dialog.getByRole("button", { name: wording("common.action.save"), exact: true }).click();
        expect((await sent).postDataJSON()).toEqual({ umbrella: true, supportCount: 0 });
        await umbrella.getByText(wording("agents.error.umbrella_refused"), { exact: true }).waitFor({ timeout: 15_000 });
        expect(await umbrella.getByRole("switch").getAttribute("aria-checked")).toBe("true");

        // Turned off again, the count stands as it did.
        await umbrella.getByRole("switch").click();
        expect(await shown()).toBe("2");
        expect(await locked()).toBe(false);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

        // Changed back, the dialog closes asking nothing; turned on and left, it asks before the change is thrown away.
        const discard = page.getByRole("button", { name: wording("common.action.discard"), exact: true });

        await page.keyboard.press("Escape");
        await umbrella.waitFor({ state: "detached", timeout: 10_000 });
        expect(await discard.count()).toBe(0);
        await page.locator("#setting-repository-repo-a").click();
        await until(shown, (value) => value === "2", 15_000);
        await umbrella.getByRole("switch").click();
        await page.keyboard.press("Escape");
        await discard.click({ timeout: 10_000 });
        await umbrella.waitFor({ state: "detached", timeout: 10_000 });
      } finally {
        await context.close();
      }
    }, 60_000);
  }
});
