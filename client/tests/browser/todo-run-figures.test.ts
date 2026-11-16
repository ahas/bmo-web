import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";

import { spanClock } from "bmo-ui/app/domain/time";

import type { Browser, BrowserContext, Locator, Page } from "playwright-core";
import type { ItemRuns, JobLine, TodoBoard, TodoItem, TodoSpan } from "../../apps/web/shared/types";

// The TODO modal's state tab standing the item's last job (docs/web.md, the TODO modal's state tab): an item whose job
// has ended still stands that job's time, tool calls and tokens with when it started and when it ended, and a running
// item's figures move as its runs are read again, with no end yet; the run record's other parts — the line saying which
// run is going, the time record under the figures — stand where they stood, and nothing runs past the card's edge.
// It drives the console tests/support/browser-console.ts stands up, serving what the dialog reads through the page's
// own routes; the suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "todo-run-figures", password: "fixture-password-2826" };
const ITEM = 2826;
const NOW = Math.floor(Date.now() / 1000);
const WIDTHS = [
  { width: 1280, height: 900, phone: false },
  { width: 360, height: 780, phone: true }
] as const;

// Moments whose minutes and seconds are known, so a stamp is read in whichever zone the console shows.
const STARTED = Math.floor((NOW - 3_600) / 3_600) * 3_600 + 2 * 60 + 5;
const ENDED = STARTED + 12 * 60 + 34;

// The ended job's four phases, adding up to its time, so the time record under the figures draws its total and its bar.
const SPANS: TodoSpan[] = [["wait", 30], ["ready", 60], ["agent run", 600], ["finish", 64]].map(([name, seconds]) => ({
  kind: "phase", name: String(name), seconds: Number(seconds), times: 1, tokens: null
}));

function item(running: boolean): TodoItem {
  return {
    id: ITEM, title: "item-title", instruction: "item-instruction", requester: "Owner", requesterId: null, chatId: null, approved: true,
    awaitingApproval: false, recommended: false, done: !running, running, liveState: running ? "running" : null, worker: "worker-a", priority: 1,
    status: running ? "running" : "done", model: null, agent: null, ranOn: null, note: null, reports: [], unfinished: null, rejections: 0,
    unfinishedResolvedAt: null, unfinishedResolution: null, heldAt: null, heldReason: null, heldKind: null, mergedInto: null,
    mergedAt: null, mergedIntoTitle: null, mergedFrom: [], attempts: 1, progress: null, stopped: null, holding: null, waiting: null,
    deployWaits: false, closing: null, deployHeld: false, holdPending: false, orderActive: false, seconds: null,
    spans: running ? [] : SPANS, createdAt: NOW - 7_200, doneAt: running ? null : ENDED
  };
}

function job(finishedAt: number | null, tools: number, outputTokens: number): JobLine {
  return {
    run: "run-a", agent: "worker-a", todoId: ITEM, title: null, purpose: null, startedAt: STARTED, finishedAt, tools, models: [],
    spent: { inputTokens: 5, outputTokens, cacheReadTokens: 80_000, cacheWriteTokens: 900 }
  };
}

function runs(latest: JobLine): ItemRuns {
  return { attempts: 1, seconds: latest.finishedAt === null ? null : latest.finishedAt - latest.startedAt, ranOn: null, plan: [], latest };
}

let browser: Browser | null = null;
let cookie = "";

beforeAll(async () => {
  if (!origin || !touchReady()) return;

  const login = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ACCOUNT) });

  expect(login.ok).toBe(true);
  cookie = login.headers.get("set-cookie")!.split(";")[0]!;
  browser = await chromium.launch();
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();
}, BROWSER_HOOK_MS);

// A context whose item is `running` or done, its runs answered by `latest` on each read once `held` lets them go.
async function open(viewport: (typeof WIDTHS)[number], running: boolean, latest: () => JobLine, held: Promise<void> = Promise.resolve()): Promise<BrowserContext> {
  const context = await browser!.newContext({ viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.phone, hasTouch: viewport.phone, serviceWorkers: "block", reducedMotion: "reduce" });
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
  await context.route(/\/api\/todos(\?|$)/, async (route) => {
    if (route.request().method() !== "GET") return await route.continue();

    const board = (await (await route.fetch()).json()) as TodoBoard;

    await route.fulfill({ json: running ? { ...board, queue: [item(true)] } : { ...board, done: [item(false)], doneTotal: 1 } });
  });
  await context.route(new RegExp(`/api/todos/${ITEM}$`), (route) => route.fulfill({ json: item(running) }));
  await context.route(new RegExp(`/api/todos/${ITEM}/runs(\\?|$)`), async (route) => {
    await held;
    await route.fulfill({ json: runs(latest()) });
  });
  await context.route(new RegExp(`/api/todos/${ITEM}/(notes|approvals|reports|reviews)$`), (route) => route.fulfill({ json: [] }));
  await context.route(new RegExp(`/api/todos/${ITEM}/talk$`), (route) => route.fulfill({ json: { turns: [], answering: false, unanswered: null } }));
  await context.route(new RegExp(`/api/todos/${ITEM}/work-order$`), (route) => route.fulfill({ status: 204, body: "" }));

  return context;
}

// The stamp a label stands for a moment: the label's words around a full date and time ending in the moment's minutes
// and seconds, whichever zone the console reads it in.
function stampOf(key: string, unixSeconds: number): RegExp {
  const moment = new Date(unixSeconds * 1000);
  const tail = `${String(moment.getUTCMinutes()).padStart(2, "0")}:${String(moment.getUTCSeconds()).padStart(2, "0")}`;
  const [before, after] = wording(key, { time: "\u0000" }).split("\u0000");

  return new RegExp(`^${before}\\d{4}-\\d{2}-\\d{2} \\d{2}:${tail}${after}$`);
}

// What a figure reads: its text as one line, since a turning number stands each character in a window of its own.
async function textOf(figure: Locator): Promise<string> {
  return ((await figure.textContent()) ?? "").replace(/\s+/g, " ").trim();
}

async function figuresOf(page: Page) {
  const figures = page.getByRole("dialog").locator("[data-item-job]:visible").first();

  await figures.waitFor({ timeout: 20_000 });

  return figures;
}

// The run record's card the figures stand in, read as its parts in order — each part's first line, the figures named
// as such —, whether anything in it runs past the card's own edge, and whether a dot between the figures stands at a
// line's start or end rather than between two parts on its own line.
async function cardOf(figures: Locator): Promise<{ parts: string[]; overflows: boolean; loneDots: number }> {
  return await figures.evaluate((node) => {
    const card = node.parentElement!;
    const edge = card.getBoundingClientRect().right;
    const parts = [...card.children].map((part) => (part.hasAttribute("data-item-job") ? "figures" : (part as HTMLElement).innerText.split("\n")[0]!.trim()));
    const overflows = card.scrollWidth > card.clientWidth || [...card.querySelectorAll("*")].some((one) => one.getBoundingClientRect().right > edge + 0.5);
    const shown = (one: Element | null): DOMRect | null => {
      const box = one?.getBoundingClientRect();

      return box === undefined || box.width === 0 ? null : box;
    };
    const dots = [...node.querySelectorAll("[aria-hidden=true]")].filter((one) => one.textContent?.trim() === "·" && shown(one) !== null);
    const loneDots = dots.filter((dot) => {
      const middle = shown(dot)!.top + shown(dot)!.height / 2;
      const beside = (one: Element | null) => {
        const box = shown(one);

        return box !== null && box.top <= middle && middle <= box.bottom;
      };

      return !beside(dot.previousElementSibling) || !beside(dot.nextElementSibling);
    }).length;

    return { parts, overflows, loneDots };
  });
}

describe.skipIf(!origin || !touchReady())("the state tab's last job", () => {
  for (const viewport of WIDTHS) {
    test(`an ended item still stands its last job's figures and both stamps, ${viewport.width}px wide`, async () => {
      let letGo = () => {};
      const held = new Promise<void>((resolve) => {
        letGo = resolve;
      });
      const context = await open(viewport, false, () => job(ENDED, 1_234, 52_000), held);

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/?todo=${ITEM}`, { waitUntil: "load" });

        // Until its runs are read, a done item keeps the place its figures and both stamps take, at their height.
        const waiting = page.getByRole("dialog").locator("[data-item-job-waiting]:visible").first();

        await waiting.waitFor({ timeout: 20_000 });
        const kept = (await waiting.boundingBox())!.height;

        letGo();

        const figures = await figuresOf(page);

        expect((await figures.boundingBox())!.height).toBe(kept);

        expect(await textOf(figures.locator("[data-job-time]"))).toBe(wording("agents.label.job_took", { time: wording("common.label.minutes_seconds", { m: 12, s: 34 }) }));
        expect(await textOf(figures.locator("[data-job-tools]"))).toBe(wording("agents.label.job_tools", { n: "1,234" }));
        expect(await textOf(figures.locator("[data-job-written]"))).toBe("52K");
        expect(await figures.locator("[data-job-started]").innerText()).toMatch(stampOf("todo.label.job_started_at", STARTED));
        expect(await figures.locator("[data-job-ended]").innerText()).toMatch(stampOf("todo.label.job_ended_at", ENDED));

        // The time record stands under the figures as it did: the total of the item's time over its phase bar.
        const card = await cardOf(figures);

        expect(card.parts).toEqual([wording("todo.title.run_log"), "figures", wording("todo.label.time_total", { time: spanClock(wording, 754) })]);
        expect(await figures.locator("xpath=following-sibling::div").first().innerText()).toContain(wording("todo.title.time_phases"));
        expect([card.overflows, card.loneDots]).toEqual([false, 0]);
      } finally {
        await context.close();
      }
    }, 60_000);

    test(`a running item's figures move as its runs are read again, with no end yet, ${viewport.width}px wide`, async () => {
      let tools = 3;
      const context = await open(viewport, true, () => job(null, tools, 1_200));

      try {
        const page = await context.newPage();

        await page.clock.install();
        await page.goto(`${origin}/?todo=${ITEM}`, { waitUntil: "load" });

        const figures = await figuresOf(page);
        const toolsText = figures.locator("[data-job-tools]");

        expect(await textOf(toolsText)).toBe(wording("agents.label.job_tools", { n: "3" }));
        expect(await figures.locator("[data-job-started]").innerText()).toMatch(stampOf("todo.label.job_started_at", STARTED));
        expect(await figures.locator("[data-job-ended]").count()).toBe(0);
        // Under the line saying which run is going, as the run record says it; no time is summed until a job ends.
        expect(await cardOf(figures)).toEqual({ parts: [wording("todo.title.run_log"), wording("todo.status.running_attempt", { n: 1 }), "figures"], overflows: false, loneDots: 0 });

        const ticking = await textOf(figures.locator("[data-job-time]"));

        tools = 7;
        await page.clock.runFor(3_000);
        await figures.locator("[data-job-tools]", { hasText: wording("agents.label.job_tools", { n: "7" }) }).waitFor({ timeout: 10_000 });
        expect(await textOf(figures.locator("[data-job-time]"))).not.toBe(ticking);
      } finally {
        await context.close();
      }
    }, 60_000);
  }
});
