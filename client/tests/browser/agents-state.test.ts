import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser } from "playwright-core";

// What each agent is doing now, on agent management's agents tab (docs/web.md, 「What each agent is doing now」): a
// role's agent reads idle or the run let in on it, with how long; pressing a working one opens its log; a run tied to an
// item is stopped from its row's more-menu and reads stopping after; a supervisor holds a dash until the stream has
// handed the bot's picture, and reads its turns from it after; the roles tab counts the slots a reservation keeps;
// and the old live address leads here. It drives the console tests/support/browser-console.ts stands up, whose agency
// lets the worker's first two agents in on a job of item 12 and on an ask naming its work, and keeps one worker slot by a
// reservation; the suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "agents-state", password: "fixture-password-3049" };

let browser: Browser | null = null;
let cookie = "";

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

describe.skipIf(!origin || !touchReady())("what each agent is doing now", () => {
  for (const [width, height, phone] of [[1280, 900, false], [360, 780, true]] as const) {
    test(`stands on each agent's row and stops a run through its item, ${width}px wide`, async () => {
      const context = await browser!.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, serviceWorkers: "block", reducedMotion: "reduce" });
      const at = cookie.indexOf("=");
      const stopped: unknown[] = [];

      await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
      // The bot's answer to a stop: asked, the run still going until the slots no longer hold it.
      await context.route(/\/api\/run-stop$/, async (route) => {
        stopped.push(route.request().postDataJSON());
        await route.fulfill({ json: { ok: true, target: { kind: "item", id: "12" }, state: "asked", runs: 1 } });
      });

      try {
        const page = await context.newPage();

        // The old live address lands on the organisation screen's supervisors tab at the platform node.
        await page.goto(`${origin}/live`, { waitUntil: "load" });
        await page.waitForURL(/\/organization\?company=platform&tab=supervisors$/, { timeout: 15_000 });

        const row = (name: string) => page.locator("[data-role-agents-table] tbody tr").filter({ hasText: name });
        const working = row("worker-01").locator('[data-agent-state="working"]');

        await working.waitFor({ timeout: 15_000 });

        // A job's run reads its source and its item's number with how long; an ask reads its line; an agent
        // with nothing let in on it reads idle.
        expect(await working.innerText()).toContain(`Job · ${wording("live.label.run_item", { id: 12 })}`);
        expect(await working.locator(".tabular-nums").count()).toBe(1);
        expect(await row("worker-02").locator('[data-agent-state="working"]').innerText()).toContain(`${wording("live.label.slot_source_ask")} · Look into a thing`);
        expect(await row("worker-03").locator('[data-agent-state="idle"]').innerText()).toContain(wording("live.label.agent_idle"));
        // The stand-in's stream hands no picture of the bot's turns, so no supervisor is said to be idle: each holds a
        // dash until the stream has answered.
        const supervisorStates = page.locator("[data-supervisors-table] [data-agent-state]");

        expect(await supervisorStates.count()).toBeGreaterThan(0);
        expect(await supervisorStates.evaluateAll((all) => all.map((one) => one.getAttribute("data-agent-state")))).toEqual(
          Array.from({ length: await supervisorStates.count() }, () => "unknown")
        );

        // Pressing a working cell opens its role's log.
        await working.click();
        await page.getByRole("dialog").first().waitFor({ timeout: 15_000 });
        await page.keyboard.press("Escape");
        await page.getByRole("dialog").first().waitFor({ state: "detached", timeout: 15_000 });

        // A run tied to no item carries no stop.
        await row("worker-02").getByRole("button", { name: wording("common.aria.menu_of", { name: "worker-02" }) }).click();
        expect(await page.getByRole("menuitem", { name: wording("live.action.stop") }).count()).toBe(0);
        await page.keyboard.press("Escape");

        // The job's run is stopped through its item, asked first, and its cell reads stopping after.
        await row("worker-01").getByRole("button", { name: wording("common.aria.menu_of", { name: "worker-01" }) }).click();
        await page.getByRole("menuitem", { name: wording("live.action.stop") }).click();

        const question = page.getByRole("dialog").filter({ hasText: wording("live.message.stop_confirm") });

        await question.waitFor({ timeout: 15_000 });
        await question.getByRole("button", { name: wording("live.action.stop") }).click();
        await working.getByText(wording("live.status.stopping")).waitFor({ timeout: 15_000 });
        expect(stopped).toEqual([{ target: { kind: "item", id: "12" } }]);

        // The roles tab counts the slot the worker's reservation keeps.
        await page.goto(`${origin}/organization?company=platform&tab=roles`, { waitUntil: "load" });
        await page.locator("#setting-role-worker").waitFor({ timeout: 15_000 });
        await page.locator("[data-settings-table] tbody tr").filter({ hasText: wording("agents.label.role_reserved", { n: "1" }) }).first().waitFor({ timeout: 15_000 });
      } finally {
        await context.close();
      }
    }, 120_000);
  }

  test("stands every run an agent carries, each with its log and its stop", async () => {
    const context = await browser!.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block", reducedMotion: "reduce" });
    const at = cookie.indexOf("=");
    const now = Date.now();
    const run = (itemId: number, since: number, title: string) => ({
      role: "worker", agent: "worker-01", place: "repo-a", path: "/srv/checkouts/repo-a", source: "Job", provider: null, model: null, since,
      title, itemId, log: `job-${itemId}`, session: null, stop: { kind: "item", id: String(itemId) }
    });
    // One agent carrying two jobs at once, as an agent does while a job of its waits in the machine's turn.
    const runs = { readAt: now, runs: [run(13, now - 20_000, "Second item"), run(12, now - 90_000, "First item")], reservations: [] };

    await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
    await context.route(/\/api\/agent-runs$/, (route) => route.fulfill({ json: runs }));

    try {
      const page = await context.newPage();
      const cell = page.locator("[data-role-agents-table] tbody tr").filter({ hasText: "worker-01" }).locator('[data-agent-state="working"]');
      const first = `Job · ${wording("live.label.run_item", { id: 12 })}`;
      const second = `Job · ${wording("live.label.run_item", { id: 13 })}`;

      await page.goto(`${origin}/organization?company=platform&tab=supervisors`, { waitUntil: "load" });
      await cell.waitFor({ timeout: 15_000 });

      // The earliest run stands on the line, with how many the agent carries beside it.
      expect(await cell.innerText()).toContain(first);
      expect(await cell.innerText()).toContain("2");

      // A press offers each run, and the one chosen opens the log.
      await cell.click();
      const entries = page.getByRole("menuitem");

      await entries.first().waitFor({ timeout: 15_000 });
      expect((await entries.allInnerTexts()).map((one) => one.split("\n")[0]!.trim())).toEqual([first, second]);
      await entries.nth(1).click();
      await page.getByRole("dialog").first().waitFor({ timeout: 15_000 });
      await page.keyboard.press("Escape");
      await page.getByRole("dialog").first().waitFor({ state: "detached", timeout: 15_000 });

      // The more-menu stops each run by name.
      await page.locator("[data-role-agents-table] tbody tr").filter({ hasText: "worker-01" }).getByRole("button", { name: wording("common.aria.menu_of", { name: "worker-01" }) }).click();
      await page.getByRole("menuitem", { name: wording("live.action.stop_run", { run: second }) }).waitFor({ timeout: 15_000 });
      expect(await page.getByRole("menuitem", { name: wording("live.action.stop_run", { run: first }) }).count()).toBe(1);
    } finally {
      await context.close();
    }
  }, 120_000);

  test("reads a supervisor's turns from the stream's picture once it has handed one", async () => {
    const context = await browser!.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block", reducedMotion: "reduce" });
    const at = cookie.indexOf("=");
    const rooms = (await (await fetch(`${origin}/api/rooms`, { headers: { cookie } })).json()) as { chatId: number; title: string }[];
    const now = Math.floor(Date.now() / 1000);
    // The default answerer's turn in the first room, a turn naming no speaker being its own; the other supervisor
    // has none.
    const live = { at: now, compacting: [], turns: [{ chatId: rooms[0]!.chatId, since: now - 75, messages: 1, instructions: 0, speaker: null }] };

    await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
    await context.route(/\/api\/events(\?.*)?$/, (route) =>
      route.fulfill({ status: 200, headers: { "content-type": "text/event-stream" }, body: `retry: 60000\nevent: live\ndata: ${JSON.stringify(live)}\n\n` })
    );

    try {
      const page = await context.newPage();
      const state = (name: string) => page.locator("[data-supervisors-table] tbody tr").filter({ hasText: name }).locator("[data-agent-state]");

      await page.goto(`${origin}/organization?company=platform&tab=supervisors`, { waitUntil: "load" });
      await state("agent-a").and(page.locator('[data-agent-state="working"]')).waitFor({ timeout: 15_000 });
      expect(await state("agent-a").innerText()).toContain(wording("live.label.answering", { rooms: rooms[0]!.title }));
      expect(await state("agent-c").getAttribute("data-agent-state")).toBe("idle");
    } finally {
      await context.close();
    }
  }, 120_000);
});
