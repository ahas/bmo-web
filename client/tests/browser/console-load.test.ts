import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, BrowserContext, Locator, Page } from "playwright-core";
import type { ListedRoom, RunProgress, TodoBoard, TodoBoardRow, TodoItem } from "../../apps/web/shared/types";

declare global {
  interface Window {
    // Each interaction the browser timed, as its Event Timing entries say: the interaction, its kind and how long from
    // the input to the frame that showed its answer.
    timedInteractions: Array<{ id: number; name: string; duration: number }>;
    // Each task that held the main thread past 50 ms, as the browser's Long Tasks timing reports it.
    longTasks: number[];
  }
}

// The console's budget under an administrator's stream (docs/web.md, 「What the stream costs a tab」): while five rounds
// work and the stream carries their pictures — each round's unchanged picture several times a second, the minutes a
// reopened stream missed at once, and the job service's and the agency's words beside them — no task the stream sets
// off holds the main thread past 50 ms, a character typed into a room's words box stands on screen within 50 ms of the
// key, and a press on another room in the sidebar is painted within 100 ms and stands the room within 400 ms, as the
// browser's own timing counts them: every task, and the middle of a typed phrase and of several room switches. The
// console holds about ninety rooms and a few hundred TODO lines. The stream is played into the page in place of the
// tab's one event stream, so every frame of it goes through the console's own reading. The page runs on a processor
// slowed to half its speed, standing in for a machine slower than this one.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up, and serves
// the room list and the TODO board through the page's own routes.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "console-load", password: "fixture-password-3127" };
const OWNER_CHAT = 42;
const PHRASE = "the quick brown fox";
const TYPED_MS = 50;
const PRESS_MS = 100;
const SWITCH_MS = 400;
// How much slower than this machine's the page's processor runs.
const SLOWER = 2;
// How long the stream runs with nothing else going on while its tasks are timed.
const QUIET_MS = 5_000;
const ROWS = 260;
const NOW = Math.floor(Date.now() / 1000);
// The rooms the console holds beside the stand-in's own, and the five a round works in.
const MORE_ROOMS = Array.from({ length: 85 }, (_, at) => 1_000 + at);
const WORKING = MORE_ROOMS.slice(0, 5);

// What a working round's picture says of itself, the same every time it is sent, at the size the receiver's carry.
const PROGRESS: RunProgress = {
  phase: "tool",
  tool: "Bash",
  thinkingTokens: 1_200,
  contextTokens: 84_000,
  cacheReadTokens: 80_000,
  requestId: "req-0001",
  spent: { inputTokens: 1_200, cacheReadTokens: 80_000, cacheWriteTokens: 4_000 },
  writtenTokens: 3_000,
  actions: Array.from({ length: 12 }, (_, at) => ({ kind: "tool" as const, name: "Bash", text: `cargo test --package crate-${at} -- --nocapture`, state: "succeeded" as const })),
  droppedActions: 4,
  droppedContext: 0,
  said: [{ text: "Reading the module before changing it, then running the narrow check.", before: 3 }],
  thinking: "The change touches the stream handler; the narrowest check is the typecheck of the app. ".repeat(3)
};

// An approved line waiting its turn in the queue.
function item(id: number): TodoItem {
  return {
    id, title: `item-title-${id}`, instruction: "item-instruction ".repeat(20), requester: "Owner", requesterId: 42, chatId: null,
    approved: true, awaitingApproval: false, recommended: false, done: false, running: false, liveState: null, worker: null,
    priority: id, status: "waiting", model: null, agent: null, ranOn: null, note: null, reports: [], unfinished: null, rejections: 0,
    unfinishedResolvedAt: null, unfinishedResolution: null, heldAt: null, heldReason: null, heldKind: null, noticesOff: null, mergedInto: null,
    mergedAt: null, mergedIntoTitle: null, mergedFrom: [], attempts: 0, progress: null, stopped: null, holding: null, waiting: null,
    deployWaits: false, closing: null, deployHeld: false, holdPending: false, orderActive: false, seconds: null, spans: [],
    createdAt: NOW - 120, doneAt: null
  };
}

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

async function open(): Promise<BrowserContext> {
  const context = await browser!.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: "block", reducedMotion: "reduce" });
  const at = cookie.indexOf("=");
  let rowReads = 0;

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
  await context.route(/\/api\/rooms(\?|$)/, async (route) => {
    if (route.request().method() !== "GET") return await route.continue();

    const rooms = (await (await route.fetch()).json()) as ListedRoom[];
    const model = rooms.find((room) => room.chatId === OWNER_CHAT) ?? rooms[0]!;
    const more = MORE_ROOMS.map((chatId, place) => ({ ...model, chatId, title: `room-${place}`, ownerRoom: false, lastMessageAt: NOW - place * 60 }));

    await route.fulfill({ json: [...rooms, ...more] });
  });
  await context.route(/\/api\/todos(\?|$)/, async (route) => {
    if (route.request().method() !== "GET") return await route.continue();

    const board = (await (await route.fetch()).json()) as TodoBoard;

    await route.fulfill({ json: { ...board, queue: Array.from({ length: ROWS }, (_, place) => item(place + 1)), standing: { ...board.standing, queue: ROWS } } });
  });
  // A line the job service's words name, its job starting and stopping in turn.
  await context.route(/\/api\/todos\/rows(\?|$)/, async (route) => {
    const ids = (new URL(route.request().url()).searchParams.get("ids") ?? "").split(",").map(Number);
    const rows: TodoBoardRow[] = ids.map((id) => ({ list: "queue", item: { ...item(id), liveState: rowReads % 2 === 0 ? "running" : null } }));

    rowReads += 1;
    await route.fulfill({ json: rows });
  });
  await context.addInitScript(({ progress, working }) => {
    const Real = window.EventSource;
    let id = 0;
    let jobId = 0;

    window.timedInteractions = [];
    window.longTasks = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.longTasks.push(entry.duration);
    }).observe({ type: "longtask", buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEventTiming & { interactionId: number })[]) {
        if (entry.interactionId > 0) window.timedInteractions.push({ id: entry.interactionId, name: entry.name, duration: entry.duration });
      }
    }).observe({ type: "event", durationThreshold: 16, buffered: true } as PerformanceObserverInit);

    // The tab's one event stream, in the frames the console's relay writes.
    class Played extends EventTarget {
      readonly url: string;
      readyState = 0;
      private readonly clocks: ReturnType<typeof setInterval>[] = [];
      private closed = false;

      constructor(url: string) {
        super();
        this.url = url;
        setTimeout(() => this.start(), 50);
      }

      close(): void {
        this.closed = true;
        this.readyState = 2;
        this.clocks.forEach(clearInterval);
      }

      private send(name: string, data: unknown): void {
        if (!this.closed) this.dispatchEvent(new MessageEvent(name, { data: JSON.stringify(data) }));
      }

      private picture(chatId: number): void {
        id += 1;
        this.send("bot", { id, at: Math.floor(Date.now() / 1000), type: "run-progress", chatId, messageId: null, speaker: null, progress });
      }

      private start(): void {
        const now = Math.floor(Date.now() / 1000);

        this.readyState = 1;
        this.dispatchEvent(new Event("open"));
        this.send("run", { run: "run-a" });
        this.send("job-run", { run: "job-run-a" });
        this.send("live", { at: now, compacting: [], runs: [], turns: working.map((chatId) => ({ chatId, since: now - 60, messages: 3, instructions: 1, messageId: null, speaker: null })) });

        // The minutes the stream missed, at once.
        for (let sent = 0; sent < 300; sent += 1) this.picture(working[sent % working.length]!);

        this.clocks.push(
          setInterval(() => working.forEach((chatId) => this.picture(chatId)), 300),
          setInterval(() => {
            jobId += 1;
            this.send("job", { id: jobId, at: Date.now(), kind: "item.changed", data: { id: 1 + (jobId % 20) } });
          }, 400),
          setInterval(() => this.send("agency", { kind: "job.changed", data: { roomId: working[0], itemId: 7, startedAt: now } }), 700),
          setInterval(() => {
            id += 1;
            this.send("bot", { id, at: Math.floor(Date.now() / 1000), type: "message", chatId: working[id % working.length], messageId: String(id) });
          }, 3_000),
          setInterval(() => this.send("keep", {}), 5_000)
        );
      }
    }

    window.EventSource = new Proxy(Real, {
      construct: (target, [url, init]: [string | URL, EventSourceInit?]) => (String(url).includes("/api/events") ? new Played(String(url)) : new target(url, init))
    });
  }, { progress: PROGRESS, working: WORKING });

  return context;
}

// The longest each interaction took, the slowest of its events.
async function interactions(page: Page, names: readonly string[]): Promise<number[]> {
  const timed = await page.evaluate(() => window.timedInteractions);
  const longest = new Map<number, number>();

  for (const entry of timed.filter((one) => names.includes(one.name))) longest.set(entry.id, Math.max(longest.get(entry.id) ?? 0, entry.duration));

  return [...longest.values()];
}

// The middle of several timings: the budget is what an interaction typically takes, a browser sharing the machine with
// other test files now and then drawing one frame late, while no task past 50 ms is allowed at all.
function median(values: readonly number[]): number {
  const sorted = [...values].sort((one, other) => one - other);

  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

// A press on a room in the sidebar, and how long from the press until that room's words box stands.
async function switchTo(page: Page, rooms: Locator, href: string): Promise<number> {
  const pressedAt = Date.now();

  await rooms.locator(`a[href="${href}"]`).first().click();
  await page.waitForURL((url) => url.pathname === href, { timeout: 20_000 });
  await page.locator("form textarea").first().waitFor({ timeout: 20_000 });

  return Date.now() - pressedAt;
}

async function forget(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.timedInteractions = [];
    window.longTasks = [];
  });
}

describe.skipIf(!origin || !touchReady())("the console under an administrator's stream", () => {
  test(`the stream holds no task past 50 ms, a typed character stands within ${TYPED_MS} ms and a room switch within ${SWITCH_MS} ms`, async () => {
    const context = await open();

    try {
      const page = await context.newPage();
      const rooms = page.locator("nav", { has: page.locator(`a[href$="/rooms/${OWNER_CHAT}"]`) }).first();

      await page.goto(`${origin}/rooms/${OWNER_CHAT}`, { waitUntil: "load" });
      await page.locator(`a[href$="/rooms/${MORE_ROOMS.at(-1)}"]`).first().waitFor({ state: "attached", timeout: 60_000 });
      await page.locator("form textarea").first().waitFor({ timeout: 60_000 });

      const others = (await rooms.locator('a[href*="/rooms/"]').evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? "")))
        .filter((href) => !/\/rooms\/1\d{3}$/.test(href) && !href.endsWith(`/rooms/${OWNER_CHAT}`))
        .slice(0, 3);
      const home = (await rooms.locator(`a[href$="/rooms/${OWNER_CHAT}"]`).first().getAttribute("href"))!;

      expect(others.length).toBeGreaterThan(0);

      // Each room is opened once untimed first: the development console builds a screen's parts on its first visit,
      // which is no cost of the stream's and none the deployed console pays.
      for (const href of [...others, home]) await switchTo(page, rooms, href);

      // The backlog read and the first reads of the board settle before anything is timed.
      await page.waitForTimeout(3_000);
      await (await context.newCDPSession(page)).send("Emulation.setCPUThrottlingRate", { rate: SLOWER });
      await forget(page);
      await page.waitForTimeout(QUIET_MS);

      expect(await page.evaluate(() => window.longTasks)).toEqual([]);

      const box = page.locator("form textarea").first();

      await box.click();
      await forget(page);
      await page.keyboard.type(PHRASE, { delay: 120 });
      await page.waitForTimeout(500);

      // A key answered within a frame leaves no entry, the browser timing only what took 16 ms or more.
      const typed = await interactions(page, ["keydown", "keypress", "beforeinput", "input", "keyup"]);

      expect(median([...typed, ...Array<number>(Math.max(0, PHRASE.length - typed.length)).fill(0)])).toBeLessThanOrEqual(TYPED_MS);
      await box.fill("");

      const pressed: number[] = [];
      const stood: number[] = [];

      for (const href of [...others, home]) {
        await forget(page);
        stood.push(await switchTo(page, rooms, href));
        await page.waitForTimeout(300);
        pressed.push(Math.max(0, ...(await interactions(page, ["pointerdown", "pointerup", "mousedown", "mouseup", "click"]))));
      }

      expect(median(pressed)).toBeLessThanOrEqual(PRESS_MS);
      expect(median(stood)).toBeLessThanOrEqual(SWITCH_MS);
    } finally {
      await context.close();
    }
  }, 120_000);
});
