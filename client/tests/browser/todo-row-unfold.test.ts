import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";

import type { Browser, Page } from "playwright-core";
import type { ItemTestbedTurn, TodoBoard, TodoItem } from "../../apps/web/shared/types";

// A line a TODO row carries under its title comes and goes by its height (docs/web.md, 「Motion」): the lines are a
// moving list of their own inside the row, so one that comes unfolds under the title and one that goes folds, the row
// growing and shrinking with it, never fading and never jumping at the end. A reader who asked for less movement sees
// it stand and go at once. Every such line moves through the same list, so the testbed's line stands for them all: it
// is the one the page reads apart from the board, and it is read again in place through the page's own data refresh.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up, and
// serves the board and the queue through the page's own routes.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "todo-row-unfold", password: "fixture-password-2784" };
const ITEM = 1;
const NOW = Math.floor(Date.now() / 1000);
const COMMAND = "cargo test --workspace --all-targets";

function item(): TodoItem {
  return {
    id: ITEM,
    title: "unfold-fixture",
    instruction: "unfold-fixture-brief",
    requester: "Owner",
    requesterId: 42,
    chatId: 42,
    approved: true,
    awaitingApproval: false,
    recommended: false,
    done: false,
    running: true,
    liveState: "running",
    worker: "worker",
    priority: 1,
    status: "leased",
    model: null,
    agent: "agent-a",
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
    createdAt: NOW - 30,
    doneAt: null
  };
}

// One frame of the row while its line comes or goes: how tall the row stands, and how tall and how opaque its line
// is drawn, the line being null where it is not on the page.
interface Frame {
  row: number;
  line: number | null;
  opacity: number | null;
}

let browser: Browser | null = null;
let cookie = "";

beforeAll(async () => {
  if (!origin || !touchReady()) {
    return;
  }

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

// Opens the console with its row standing and the queue read once, and the app taken over the page.
async function opened(page: Page): Promise<void> {
  const read = page.waitForResponse((answer) => answer.url().includes("/api/todos/testbed"));

  await page.goto(`${origin}/`, { waitUntil: "load" });

  const row = page.locator(`li[data-todo-id="${ITEM}"]:visible`).first();

  if (!(await row.waitFor({ timeout: 10_000 }).then(() => true, () => false))) {
    await page.getByRole("button", { name: wording("todo.action.open_todo") }).click();
    await row.waitFor({ timeout: 10_000 });
  }

  await read;
  await page.waitForFunction(() => window.useNuxtApp?.().isHydrating === false, null, { timeout: 30_000 });
}

// Reads the queue again in place and writes down every frame of the row from just before until its line is there or
// gone as asked and nothing on the row moves any more.
async function watched(page: Page, there: boolean): Promise<Frame[]> {
  return await page.evaluate(
    async ([id, wanted]) => {
      const row = [...document.querySelectorAll<HTMLElement>(`li[data-todo-id="${id}"]`)].find((one) => one.offsetParent !== null)!;
      const frames: Frame[] = [];
      const look = (): void => {
        const line = row.querySelector<HTMLElement>("[data-item-testbed]");

        frames.push({
          row: row.getBoundingClientRect().height,
          line: line === null ? null : line.getBoundingClientRect().height,
          opacity: line === null ? null : Number(getComputedStyle(line).opacity)
        });
      };

      look();
      void window.useNuxtApp!().hooks.callHookParallel("app:data:refresh", ["todo-testbed"]);

      await new Promise<void>((resolve) => {
        const next = (): void => {
          look();

          const last = frames.slice(-4).map((one) => `${one.row}/${one.line}`);
          const arrived = (frames.at(-1)!.line !== null) === wanted;
          const still = last.length === 4 && new Set(last).size === 1 && row.getAnimations({ subtree: true }).length === 0;

          if ((arrived && still) || frames.length > 600) {
            resolve();
          } else {
            requestAnimationFrame(next);
          }
        };

        requestAnimationFrame(next);
      });

      return frames;
    },
    [ITEM, there] as const
  );
}

// The frames that stand strictly between where the row started and where it ended.
function between(frames: Frame[]): Frame[] {
  const [from, to] = [frames[0]!.row, frames.at(-1)!.row];
  const [low, high] = [Math.min(from, to), Math.max(from, to)];

  return frames.filter((one) => one.row > low + 0.5 && one.row < high - 0.5);
}

// Whether the row's height only ever moved one way.
function oneWay(frames: Frame[], growing: boolean): boolean {
  return frames.every((one, at) => at === 0 || (growing ? one.row >= frames[at - 1]!.row - 0.5 : one.row <= frames[at - 1]!.row + 0.5));
}

describe.skipIf(!origin || !touchReady())("a line a TODO row carries under its title", () => {
  for (const motion of ["no-preference", "reduce"] as const) {
    test(`unfolds as it comes and folds as it goes, with motion ${motion}`, async () => {
      const context = await browser!.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: "light", serviceWorkers: "block", reducedMotion: motion });
      let turns: ItemTestbedTurn[] = [];

      try {
        const at = cookie.indexOf("=");

        await context.addCookies([
          { name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! },
          { name: "nuxt-color-mode", value: "light", url: origin! }
        ]);
        await context.route(/\/api\/todos(\?|$)/, async (route) => {
          if (route.request().method() !== "GET") return await route.continue();

          const board = (await (await route.fetch()).json()) as TodoBoard;

          await route.fulfill({ json: { ...board, queue: [item()] } });
        });
        await context.route(/\/api\/todos\/testbed/, async (route) => await route.fulfill({ json: { items: turns } }));

        const page = await context.newPage();

        await opened(page);
        expect(await page.locator(`li[data-todo-id="${ITEM}"]:visible [data-item-testbed]`).count()).toBe(0);

        turns = [{ itemId: ITEM, command: COMMAND, place: null }];

        const coming = await watched(page, true);
        const [bare, grown] = [coming[0]!.row, coming.at(-1)!.row];
        const line = coming.at(-1)!.line!;

        // The row grew by the line and the space above it, which the line holds as its own, and by nothing more.
        expect(line).toBeGreaterThan(0);
        expect(Math.abs(grown - bare - line)).toBeLessThanOrEqual(0.5);
        // No line of a list fades.
        expect(coming.filter((one) => one.opacity !== null && one.opacity !== 1)).toEqual([]);

        turns = [];

        const going = await watched(page, false);

        expect(going[0]!.row).toBeCloseTo(grown, 0);
        expect(Math.abs(going.at(-1)!.row - bare)).toBeLessThanOrEqual(0.5);
        expect(going.filter((one) => one.opacity !== null && one.opacity !== 1)).toEqual([]);

        if (motion === "reduce") {
          // It stands and goes at once: no frame stands between the two heights.
          expect(between(coming)).toEqual([]);
          expect(between(going)).toEqual([]);
        } else {
          // It moves over several frames, one way, and ends where the line's own height puts it.
          expect(between(coming).length).toBeGreaterThanOrEqual(3);
          expect(between(going).length).toBeGreaterThanOrEqual(3);
          expect(oneWay(coming, true)).toBe(true);
          expect(oneWay(going, false)).toBe(true);
        }
      } finally {
        await context.close();
      }
    }, 60_000);
  }
});
