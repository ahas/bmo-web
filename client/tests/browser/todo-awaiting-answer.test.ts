import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { contrast } from "./contrast";
import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";

import type { Browser, BrowserContext, Locator, Page } from "playwright-core";
import type { JobQuestion, TodoBoard, TodoBoardRow, TodoItem, TodoModelPlan } from "../../apps/web/shared/types";

declare global {
  interface Window {
    // Hands the played stream one of bmo-job's events, as the console's relay writes it.
    playJob: (data: unknown) => void;
  }
}

// An item whose job waits on the owner's answer (docs/web.md, 「A job standing on a question says so where the owner
// looks」 and the TODO panel's question condition): its row wears the waiting-on-answer chip under the title, readable
// on the row's ground; pressing it opens the item at its state tab with the question's card in view, the opened item
// wearing the same chip; the head's count stands those items alone; and once bmo-job says the question settled, the
// chip leaves and the item leaves the narrowed list without a reload. At a desk's width and a phone's, in the light
// theme and the dark.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up, serves the
// board and the questions through the page's own routes, and plays the tab's event stream.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "todo-awaiting", password: "fixture-password-3826" };
const NOW = Math.floor(Date.now() / 1000);
const WIDTHS = [
  { width: 1280, height: 900, phone: false },
  { width: 360, height: 780, phone: true }
] as const;
const SCHEMES = ["light", "dark"] as const;
// How long a step the page takes on its own is waited for.
const STEP_MS = 30_000;

// One row as the panel draws it.
function item(id: number, over: Partial<TodoItem> = {}): TodoItem {
  return {
    id,
    title: `item-${id}`,
    instruction: `item-${id}`,
    requester: "Owner",
    requesterId: 42,
    chatId: 42,
    approved: true,
    awaitingApproval: false,
    recommended: false,
    done: false,
    running: false,
    worker: "bmo-a",
    priority: id,
    status: "waiting",
    model: null,
    agent: null,
    ranOn: null,
    note: null,
    reports: [],
    unfinished: null,
    rejections: 0,
    unfinishedResolvedAt: null,
    unfinishedResolution: null,
    heldAt: null,
    heldReason: null,
    dropReason: null,
    heldKind: null,
    noticesOff: null,
    mergedInto: null,
    mergedAt: null,
    mergedIntoTitle: null,
    mergedFrom: [],
    attempts: 1,
    progress: null,
    stopped: null,
    holding: null,
    waiting: null,
    deployWaits: false,
    closing: null,
    deployHeld: false,
    holdPending: false,
    orderActive: false,
    seconds: null,
    spans: [],
    createdAt: NOW - 120,
    doneAt: null,
    ...over
  };
}

// The items whose jobs ask, the first of which runs and left a note undone so it would open on its result tab, and
// one that asks nothing.
const ASKING = item(1, { unfinished: "left-over", running: true, status: "running", liveState: "running" });
const PLAIN = item(2);
const ASKING_TOO = item(3);
const ITEMS = [ASKING, PLAIN, ASKING_TOO];

const QUESTION: JobQuestion = {
  id: 71,
  todoId: ASKING.id,
  asker: "job-1",
  question: "Which way?",
  options: ["way-a", "way-b"],
  recommended: 0,
  recommendation: null,
  why: "Both work.",
  askedAt: NOW - 60,
  dueAt: NOW + 3_600,
  chosen: null,
  answer: null,
  pausedLeft: null,
  settledAt: null,
  settledBy: null
};
const QUESTIONS = [QUESTION, { ...QUESTION, id: 72, todoId: ASKING_TOO.id, asker: "job-3" }];

const PLAN: TodoModelPlan = { workers: {}, agents: {}, running: {}, chosenBy: {} };

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

interface Console {
  context: BrowserContext;
  // Whether the board was last read under the question condition.
  narrowed: () => boolean;
  // A question is settled: the routes answer without it from now on.
  settle: (id: number) => void;
}

async function open(viewport: (typeof WIDTHS)[number], scheme: (typeof SCHEMES)[number]): Promise<Console> {
  const context = await browser!.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.phone,
    hasTouch: viewport.phone,
    colorScheme: scheme,
    serviceWorkers: "block",
    reducedMotion: "reduce"
  });
  const at = cookie.indexOf("=");
  const settled = new Set<number>();
  let narrowed = false;
  const waiting = () => QUESTIONS.filter((one) => !settled.has(one.id));

  await context.addCookies([
    { name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! },
    { name: "console_auto_translate", value: "false", url: origin! },
    { name: "nuxt-color-mode", value: scheme, url: origin! }
  ]);
  await context.route(/\/api\/todos\/model-plan/, (route) => route.fulfill({ json: PLAN }));
  await context.route(/\/api\/questions(\?|$)/, async (route) => {
    if (route.request().method() !== "GET") return await route.continue();

    await route.fulfill({ json: waiting() });
  });
  await context.route(/\/api\/todos\/rows/, (route) => {
    const ids = new URL(route.request().url()).searchParams.get("ids")?.split(",").map(Number) ?? [];
    const rows: TodoBoardRow[] = ITEMS.filter((one) => ids.includes(one.id)).map((one) => ({ list: "queue", item: one }));

    return route.fulfill({ json: rows });
  });
  await context.route(/\/api\/todos(\?|$)/, async (route) => {
    if (route.request().method() !== "GET") return await route.continue();

    const board = (await (await route.fetch()).json()) as TodoBoard;

    narrowed = new URL(route.request().url()).searchParams.get("question") === "awaiting";

    const queue = narrowed ? ITEMS.filter((one) => waiting().some((question) => question.todoId === one.id)) : ITEMS;

    await route.fulfill({
      json: { ...board, pending: [], queue, held: [], merged: [], done: [], doneTotal: 0, dropped: [], droppedTotal: 0, standing: { ...board.standing, queue: queue.length, running: 0 } }
    });
  });
  await context.addInitScript(() => {
    const Real = window.EventSource;

    // The tab's one event stream, in the frames the console's relay writes.
    class Played extends EventTarget {
      readonly url: string;
      readyState = 0;

      constructor(url: string) {
        super();
        this.url = url;
        setTimeout(() => {
          this.readyState = 1;
          this.dispatchEvent(new Event("open"));
          setInterval(() => this.dispatchEvent(new MessageEvent("keep", { data: "{}" })), 5_000);
        }, 50);
        window.playJob = (data) => this.dispatchEvent(new MessageEvent("job", { data: JSON.stringify(data) }));
      }

      close(): void {
        this.readyState = 2;
      }
    }

    window.EventSource = new Proxy(Real, {
      construct: (target, [url, init]: [string | URL, EventSourceInit?]) => (String(url).includes("/api/events") ? new Played(String(url)) : new target(url, init))
    });
  });

  return {
    context,
    narrowed: () => narrowed,
    settle: (id) => void settled.add(id)
  };
}

// The TODO panel as the width draws it: beside the page, or the drawer its top bar opens. A press made before the
// page's handlers land is lost, so the drawer is asked for again a bounded number of times.
async function panel(page: Page, phone: boolean): Promise<void> {
  const row = page.locator(`[data-todo-id="${ASKING.id}"]:visible`);

  if (phone) {
    const opener = page.getByRole("button", { name: wording("todo.action.open_todo") });

    await opener.waitFor({ timeout: STEP_MS });

    for (let tries = 0; tries < 3 && !(await row.isVisible()); tries += 1) {
      await opener.click();
      await row.waitFor({ timeout: 5_000 }).catch(() => undefined);
    }
  }

  await row.waitFor({ timeout: STEP_MS });
}

// A chip's shape as it is drawn: its height, its padding and its corners.
async function shapeOf(chip: Locator): Promise<string> {
  return await chip.evaluate((one) => {
    const style = getComputedStyle(one);

    return `${one.getBoundingClientRect().height} ${style.padding} ${style.borderRadius}`;
  });
}

// The colour a chip is filled with.
async function groundOf(chip: Locator): Promise<string> {
  return await chip.evaluate((one) => getComputedStyle(one).backgroundColor);
}

// A press that brings what it asks for, made again a bounded number of times where the page had not yet taken it.
async function pressFor(press: Locator, shown: Locator): Promise<void> {
  for (let tries = 0; tries < 3 && !(await shown.isVisible()); tries += 1) {
    await press.click();
    await shown.waitFor({ timeout: 5_000 }).catch(() => undefined);
  }

  await shown.waitFor({ timeout: STEP_MS });
}

describe.skipIf(!origin || !touchReady())("an item whose job waits on the owner's answer", () => {
  for (const viewport of WIDTHS) {
    for (const scheme of SCHEMES) {
      test(`wears the chip, opens at its card, stands alone under the condition and leaves once settled at ${viewport.width} in ${scheme}`, async () => {
        const opened = await open(viewport, scheme);
        const page = await opened.context.newPage();

        try {
          await page.goto(`${origin}/`, { waitUntil: "domcontentloaded" });
          await panel(page, viewport.phone);

          // The chip stands on the asking row alone, in its chips under the title, readable on the row's ground.
          const chip = page.locator(`[data-todo-id="${ASKING.id}"] [data-awaiting-question]:visible`);

          await chip.waitFor({ timeout: STEP_MS });
          expect((await chip.innerText()).trim()).toBe(wording("todo.label.awaiting_question"));
          expect(await page.locator(`[data-todo-id="${PLAIN.id}"] [data-awaiting-question]:visible`).count()).toBe(0);

          const title = (await page.locator(`[data-todo-id="${ASKING.id}"]:visible > button`).first().boundingBox())!;
          const mark = (await chip.boundingBox())!;

          expect(mark.y).toBeGreaterThanOrEqual(title.y + title.height - 0.5);

          for (const one of await contrast(page, `[data-todo-id="${ASKING.id}"] [data-awaiting-question]:visible`)) {
            expect(one.ratio).toBeGreaterThanOrEqual(4.5);
          }

          // It is one of the row's chips: the state badge's height, padding and corners.
          const state = chip.locator("xpath=../*[1]");

          expect(await shapeOf(chip)).toEqual(await shapeOf(state));

          // A pointer changes its colour on hover and again on press, and its words still read on the hovered row.
          if (!viewport.phone) {
            const rest = await groundOf(chip);

            await page.locator(`[data-todo-id="${ASKING.id}"]:visible > button`).first().hover();

            for (const one of await contrast(page, `[data-todo-id="${ASKING.id}"] [data-awaiting-question]:visible`)) {
              expect(one.ratio).toBeGreaterThanOrEqual(4.5);
            }

            await chip.hover();

            const hovered = await groundOf(chip);

            expect(hovered).not.toBe(rest);

            for (const one of await contrast(page, `[data-todo-id="${ASKING.id}"] [data-awaiting-question]:visible`)) {
              expect(one.ratio).toBeGreaterThanOrEqual(4.5);
            }

            await page.mouse.down();

            const pressed = await groundOf(chip);

            await page.mouse.move(0, 0);
            await page.mouse.up();
            expect(pressed).not.toBe(rest);
          }

          // Pressed, it opens the item at its state tab, the card in view, the item wearing the chip.
          const card = page.locator("[data-item-question]:visible");

          await pressFor(chip, card);
          expect(await card.locator("section").count()).toBe(1);

          // A phone's sheet rises into place, so the card is in view once it has settled.
          await card.evaluate(
            (place) =>
              new Promise<void>((done, failed) => {
                const until = Date.now() + 10_000;
                const look = () => {
                  const box = place.getBoundingClientRect();

                  if (box.top >= 0 && box.top < window.innerHeight) return done();
                  if (Date.now() > until) return failed(new Error(`the card stands at ${box.top}, out of view`));

                  requestAnimationFrame(look);
                };

                look();
              })
          );
          expect(await page.locator("[data-item-state] [data-awaiting-question]:visible").count()).toBe(1);
          // Beside the running state, which is pressed for the job's log, it is one chip of the same shape.
          expect(await shapeOf(page.locator("[data-item-state] [data-awaiting-question]:visible"))).toEqual(
            await shapeOf(page.locator("[data-item-state] [data-item-state-log]:visible"))
          );

          await page.locator("[data-item-close]:visible").first().click();
          await card.waitFor({ state: "hidden", timeout: STEP_MS });

          // Opened by its title it stands its result; the opened item's own chip stands the card.
          await pressFor(page.locator(`[data-todo-id="${ASKING.id}"]:visible > button`).first(), page.locator("[data-item-state]:visible"));
          expect(await card.count()).toBe(0);
          await pressFor(page.locator("[data-item-state] [data-awaiting-question]:visible"), card);

          await page.locator("[data-item-close]:visible").first().click();
          await card.waitFor({ state: "hidden", timeout: STEP_MS });

          // bmo-job says the first question settled: its chip leaves, the row stays, and the other asking row keeps its chip.
          opened.settle(QUESTION.id);
          await page.evaluate(() => window.playJob({ id: 1_000_000, at: Date.now(), kind: "question.changed", data: { id: 71, itemId: 1 } }));
          await chip.waitFor({ state: "hidden", timeout: STEP_MS });
          expect(await page.locator(`[data-todo-id="${ASKING.id}"]:visible`).count()).toBe(1);
          expect(await page.locator(`[data-todo-id="${ASKING_TOO.id}"] [data-awaiting-question]:visible`).count()).toBe(1);

          // The head's count stands the items still waiting on his answer alone.
          const count = page.locator("[data-awaiting-count]:visible");
          const asking = page.locator(`[data-todo-id="${ASKING_TOO.id}"]:visible`);

          await count.click();
          await page.locator(`[data-todo-id="${PLAIN.id}"]:visible`).waitFor({ state: "hidden", timeout: STEP_MS });
          await page.locator(`[data-todo-id="${ASKING.id}"]:visible`).waitFor({ state: "hidden", timeout: STEP_MS });
          expect(await asking.count()).toBe(1);
          expect(opened.narrowed()).toBe(true);

          // bmo-job says the last question settled: the item leaves the narrowed list, and the count leaves the head.
          opened.settle(72);
          await page.evaluate(() => window.playJob({ id: 1_000_001, at: Date.now(), kind: "question.changed", data: { id: 72, itemId: 3 } }));
          await asking.waitFor({ state: "hidden", timeout: STEP_MS });
          await count.waitFor({ state: "hidden", timeout: STEP_MS });
        } finally {
          await opened.context.close();
        }
      }, 120_000);
    }
  }
});
