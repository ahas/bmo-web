import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, BrowserContext, Page } from "playwright-core";
import type { TodoBoard, TodoItem } from "../../apps/web/shared/types";

// The TODO modal's state chip turning its mark while the item's run is under way and standing it still once the item
// is done (docs/web.md, 「Fonts」): bmo-ui's stylesheet turns no work-in-progress mark of its own accord, so the
// chip's own spin is the whole of what turns it, and less movement asked for stands it still. It drives the console
// tests/support/browser-console.ts stands up, serving the board and the item through the page's own routes; the
// suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "todo-state-spin", password: "fixture-password-3877" };
const ITEM = 3877;
const NOW = Math.floor(Date.now() / 1000);

function item(running: boolean): TodoItem {
  return {
    id: ITEM, title: "item-title", instruction: "item-instruction", requester: "Owner", requesterId: null, chatId: null, approved: true,
    awaitingApproval: false, recommended: false, done: !running, running, liveState: running ? "running" : null, worker: "worker-a", priority: 1,
    status: running ? "running" : "done", model: null, agent: null, ranOn: null, note: null, reports: [], unfinished: null, rejections: 0,
    unfinishedResolvedAt: null, unfinishedResolution: null, heldAt: null, heldReason: null, heldKind: null, noticesOff: null, mergedInto: null,
    mergedAt: null, mergedIntoTitle: null, mergedFrom: [], attempts: 1, progress: null, stopped: null, holding: null, waiting: null,
    deployWaits: false, closing: null, deployHeld: false, holdPending: false, orderActive: false, seconds: null,
    spans: [], createdAt: NOW - 7_200, doneAt: running ? null : NOW - 60
  };
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

async function open(running: boolean, reducedMotion: "reduce" | "no-preference"): Promise<BrowserContext> {
  const context = await browser!.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block", reducedMotion });
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
  await context.route(/\/api\/todos(\?|$)/, async (route) => {
    if (route.request().method() !== "GET") return await route.continue();

    const board = (await (await route.fetch()).json()) as TodoBoard;

    await route.fulfill({ json: running ? { ...board, queue: [item(true)] } : { ...board, done: [item(false)], doneTotal: 1 } });
  });
  await context.route(new RegExp(`/api/todos/${ITEM}$`), (route) => route.fulfill({ json: item(running) }));
  await context.route(new RegExp(`/api/todos/${ITEM}/runs(\\?|$)`), (route) => route.fulfill({ json: { attempts: 1, seconds: null, ranOn: null, plan: [], latest: null } }));
  await context.route(new RegExp(`/api/todos/${ITEM}/(notes|approvals|reports|reviews)$`), (route) => route.fulfill({ json: [] }));
  await context.route(new RegExp(`/api/todos/${ITEM}/talk$`), (route) => route.fulfill({ json: { turns: [], answering: false, unanswered: null } }));
  await context.route(new RegExp(`/api/todos/${ITEM}/work-order$`), (route) => route.fulfill({ status: 204, body: "" }));

  return context;
}

// The animation the dialog's state chip turns its mark by, once the chip stands; "none" for a mark standing still.
async function chipTurning(page: Page): Promise<string> {
  const mark = page.getByRole("dialog").locator("[data-item-state] [data-slot=leadingIcon]").first();

  await mark.waitFor({ timeout: 20_000 });

  return await mark.evaluate((node) => getComputedStyle(node).animationName);
}

describe.skipIf(!origin || !touchReady())("the TODO state chip's mark", () => {
  for (const [running, reducedMotion, turning] of [
    [true, "no-preference", "spin"],
    [true, "reduce", "none"],
    [false, "no-preference", "none"]
  ] as const) {
    test(`${running ? "a running" : "a done"} item's chip turns it by ${turning} where motion is ${reducedMotion}`, async () => {
      const context = await open(running, reducedMotion);

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/?todo=${ITEM}`, { waitUntil: "load" });
        // The item opens once the app stands, which a loaded machine's development server takes its time over.
        await page.waitForFunction(() => {
          const root: (Element & { __vue_app__?: { $nuxt?: { isHydrating?: boolean } } }) | null = document.querySelector("#__nuxt");

          return root?.__vue_app__?.$nuxt?.isHydrating === false;
        });

        expect(await chipTurning(page)).toBe(turning);
      } finally {
        await context.close();
      }
    }, 60_000);
  }
});
