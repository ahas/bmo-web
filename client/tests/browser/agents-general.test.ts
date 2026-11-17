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

  test("stand a role's agents as rows of the agents tab, their own settings saved from their cells, and change them in their role's dialog", async () => {
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

      // Its name opens its role's agents.
      await rows.first().locator("button", { hasText: "worker-01" }).click();

      const blocks = page.locator("[data-role-agents] li[data-agent]");

      await blocks.first().waitFor({ timeout: 15_000 });
      expect(await blocks.count()).toBe(3);

      // An agent that carries a run is not removed.
      expect(await page.locator(`li[data-agent="worker-01"] button[aria-label="${wording("agents.aria.agent_remove", { name: "worker-01" })}"]`).isDisabled()).toBe(true);

      // Switched off, the agent's change goes at once and stands as answered.
      await page.locator('li[data-agent="worker-03"] [role="switch"]').first().click();
      expect(await until(async () => sent.length, (count) => count === 1)).toBe(1);
      expect(sent[0]).toEqual({ method: "PATCH", name: "worker-03", body: { enabled: false } });

      // One more seat of the same kind is one press: it stands last on the road of the role's last agent.
      await page.getByRole("button", { name: wording("agents.action.agent_add") }).click();
      await blocks.nth(3).waitFor({ timeout: 10_000 });
      expect(sent[1]).toEqual({ method: "POST", name: null, body: { role: "worker", provider: "claude-code", model: "claude-opus-5-5", effort: "high" } });

      // No agent stands before another: a block carries no place and no button moving it.
      expect(await page.locator(`button[aria-label="${wording("common.aria.move_up_named", { name: "worker-04" })}"]`).count()).toBe(0);

      // Removed, it leaves the list.
      await page.locator(`li[data-agent="worker-04"] button[aria-label="${wording("agents.aria.agent_remove", { name: "worker-04" })}"]`).click();
      expect(await until(async () => await blocks.count(), (count) => count === 3)).toBe(3);
      expect(sent[2]).toEqual({ method: "DELETE", name: "worker-04", body: null });
    } finally {
      await context.close();
    }
  }, 90_000);

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
