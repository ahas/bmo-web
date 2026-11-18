import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";

import type { Browser, BrowserContext, Locator, Page } from "playwright-core";
import type { TodoBoard, TodoItem } from "../../apps/web/shared/types";

// A value is chosen from a list in bmo-ui's one select (docs/web.md, 「Dropdowns」): a list of more than seven choices
// opens with a search field above them, and one of seven or fewer opens with none. Read off a TODO item's agent
// chooser, which lists every agent the agency registers, and the TODO panel's filter of whether an item's unfinished
// strands remain, which holds three choices. Opened by a pointer the search field takes the focus at once; opened by a
// finger it does not, so the phone's keyboard covers nothing until the field is pressed. A desktop's width and a
// phone's.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up, whose
// agency stand-in lists `worker-01` to `worker-03` and `builder-01` to `builder-08`, and serves the board through the
// page's own route.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "choice-select", password: "fixture-password-3413" };
const NOW = Math.floor(Date.now() / 1000);
const WIDTHS = [
  { width: 1280, height: 900, phone: false },
  { width: 360, height: 780, phone: true }
];

const ITEM: TodoItem = {
  id: 1, title: "item-1", instruction: "item-1", requester: "Owner", requesterId: 42, chatId: 42,
  approved: true, awaitingApproval: false, recommended: false, done: false, running: false, worker: "bmo-a",
  priority: 1, status: "waiting", model: null, role: null, agent: null, jobAgent: null, ranOn: null, note: null,
  reports: [], unfinished: null, rejections: 0, unfinishedResolvedAt: null, unfinishedResolution: null,
  heldAt: null, heldReason: null, heldKind: null, mergedInto: null, mergedAt: null, mergedIntoTitle: null,
  mergedFrom: [], attempts: 0, progress: null, stopped: null, holding: null, waiting: null, deployWaits: false,
  closing: null, deployHeld: false, holdPending: false, orderActive: false, seconds: null, spans: [],
  createdAt: NOW - 120, doneAt: null
};

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

async function opened(width: (typeof WIDTHS)[number]): Promise<BrowserContext> {
  const context = await browser!.newContext({
    viewport: { width: width.width, height: width.height },
    isMobile: width.phone,
    hasTouch: width.phone,
    serviceWorkers: "block",
    reducedMotion: "reduce"
  });
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
  await context.route(/\/api\/todos(\?|$)/, async (route) => {
    if (route.request().method() !== "GET") return await route.fulfill({ json: { ok: true } });

    const board = (await (await route.fetch()).json()) as TodoBoard;

    await route.fulfill({ json: { ...board, pending: [], queue: [ITEM], held: [], merged: [], done: [], standing: { ...board.standing, queue: 1, running: 0, waiting: 0 } } });
  });
  await context.route(/\/api\/todos\/\d+\/work-order$/, (route) => route.fulfill({ status: 204, body: "" }));

  return context;
}

// A control pressed the way the width's reader presses it: a finger on a phone, a pointer elsewhere.
async function press(target: Locator, phone: boolean): Promise<void> {
  if (phone) await target.tap();
  else await target.click();
}

// The opened list's own search field, where it has one.
function searchOf(page: Page): Locator {
  return page.locator("[data-reka-popper-content-wrapper]").getByPlaceholder(wording("common.placeholder.search"), { exact: true });
}

describe("a list searches once it holds more than seven choices, and only then", () => {
  for (const width of WIDTHS) {
    test(`the agent chooser's long list opens with its search field above the choices, at ${width.width}px`, async () => {
      if (!browser) return;

      const context = await opened(width);

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/?todo=${ITEM.id}`, { waitUntil: "load" });

        const chooser = page.locator("[data-item-agent]:visible").first();

        await chooser.waitFor({ timeout: 30_000 });
        await press(chooser, width.phone);

        const search = searchOf(page);
        const options = page.getByRole("option");

        await search.waitFor({ timeout: 10_000 });
        await options.first().waitFor({ timeout: 10_000 });
        expect((await search.boundingBox())!.y).toBeLessThan((await options.first().boundingBox())!.y);
        // A pointer types into the field at once; a finger presses it first.
        expect(await search.evaluate((field) => field === document.activeElement)).toBe(!width.phone);
        expect(await options.filter({ hasText: "builder-01" }).count()).toBeGreaterThan(0);

        if (width.phone) await search.tap();
        await page.keyboard.type("worker-03");
        await options.filter({ hasText: "builder-01" }).first().waitFor({ state: "detached", timeout: 10_000 });
        expect(await options.filter({ hasText: "worker-03" }).count()).toBeGreaterThan(0);

        await page.keyboard.type("-none");
        await page.locator("[data-reka-popper-content-wrapper]").getByText(wording("common.status.no_match"), { exact: true }).waitFor({ timeout: 10_000 });
      } finally {
        // A poll of the board still in flight would otherwise fail on a closed context.
        await context.unrouteAll({ behavior: "ignoreErrors" });
        await context.close();
      }
    }, 120_000);

    test(`the unfinished filter's three choices open with no search field, at ${width.width}px`, async () => {
      if (!browser) return;

      const context = await opened(width);

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/`, { waitUntil: "load" });

        // The panel's row stands once the board has landed, beside the page or behind the drawer its top bar opens.
        const row = page.locator(`li[data-todo-id="${ITEM.id}"]:visible`).first();
        const opener = page.getByRole("button", { name: wording("todo.action.open_todo") });

        await row.or(opener).first().waitFor({ timeout: 30_000 });
        if (!(await row.isVisible())) {
          await press(opener, width.phone);
          await row.waitFor({ timeout: 10_000 });
        }
        await press(page.getByRole("button", { name: wording("todo.label.filter"), exact: true }).locator("visible=true").first(), width.phone);

        const unfinished = page.getByRole("button", { name: wording("todo.aria.filter_of", { name: wording("todo.label.field_unfinished") }), exact: true });

        await unfinished.waitFor({ timeout: 10_000 });
        await press(unfinished, width.phone);

        const options = page.getByRole("option");

        await options.first().waitFor({ timeout: 10_000 });
        expect(await options.count()).toBe(3);
        expect(await searchOf(page).count()).toBe(0);
      } finally {
        // A poll of the board still in flight would otherwise fail on a closed context.
        await context.unrouteAll({ behavior: "ignoreErrors" });
        await context.close();
      }
    }, 120_000);
  }
});
