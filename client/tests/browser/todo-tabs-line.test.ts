import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";

import type { Browser, BrowserContext, Page } from "playwright-core";
import type { TodoBoard, TodoItem, TodoReview } from "../../apps/web/shared/types";

// The active line of the TODO modal's tab rows under the chosen tab once the item's review is read after the modal
// opened (docs/web.md, 「A row of the component library's tabs keeps its whole height」): the modal opens on the state
// tab, its review tab then comes in front of it, and every tab row the modal stands with draws its line under the tab
// it has chosen, at a desktop's width and in a phone's drawer. The review is held back until the modal stands drawn,
// so the tab comes only after the rows have measured their line once.
// It drives the console tests/support/browser-console.ts stands up, serving what each place reads through the page's
// own routes; the suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "todo-tabs-line", password: "fixture-password-3849" };
const ITEM = 3849;
const NOW = Math.floor(Date.now() / 1000);
const WIDTHS = [
  { width: 1280, height: 900, phone: false },
  { width: 360, height: 780, phone: true }
] as const;
// What a box's edge may stand off a whole pixel where the layout lands between two.
const SUBPIXEL = 0.5;
const TITLE = "item-title of a fairly ordinary length";

const REVIEWS: TodoReview[] = [
  { id: 1, kind: "opened", stage: 1, round: 1, body: "Stage one opened.", actor: "agent-a", check: null, at: NOW - 3_000 },
  { id: 2, kind: "rejection", stage: 1, round: 1, body: "Sent back.", actor: "agent-a", check: null, at: NOW - 2_000 }
];

function item(): TodoItem {
  return {
    id: ITEM, title: TITLE, instruction: "Do the thing.", requester: "requester-a", requesterId: null, chatId: null, approved: true,
    awaitingApproval: false, recommended: true, done: false, running: true, worker: "worker-b", priority: 3, status: "open", model: null, agent: "agent-a", ranOn: null, note: null,
    reports: [], unfinished: null, rejections: 1,
    unfinishedResolvedAt: null, unfinishedResolution: null, heldAt: null, heldReason: null, heldKind: null, noticesOff: null,
    mergedInto: null, mergedAt: null, mergedIntoTitle: null, mergedFrom: [], attempts: 1, progress: null, stopped: null, holding: null, waiting: null,
    deployWaits: false, closing: null, deployHeld: false, holdPending: false, orderActive: false, seconds: null, spans: [], createdAt: NOW - 4_000, doneAt: null
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

// A console whose board holds the one item, its review answered only once `release` is called.
async function consoleWithHeldReview(viewport: (typeof WIDTHS)[number]): Promise<{ context: BrowserContext; release: () => void }> {
  const context = await browser!.newContext({ viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.phone, hasTouch: viewport.phone, serviceWorkers: "block" });
  const at = cookie.indexOf("=");
  let release = (): void => undefined;
  const released = new Promise<void>((done) => (release = done));

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
  await context.route(/\/api\/todos(\?|$)/, async (route) => {
    if (route.request().method() !== "GET") return await route.continue();

    const board = (await (await route.fetch()).json()) as TodoBoard;

    await route.fulfill({ json: { ...board, queue: [item()] } });
  });
  await context.route(new RegExp(`/api/todos/${ITEM}$`), (route) => route.fulfill({ json: item() }));
  await context.route(new RegExp(`/api/todos/${ITEM}/reviews$`), async (route) => {
    await released;
    await route.fulfill({ json: REVIEWS });
  });
  await context.route(new RegExp(`/api/todos/${ITEM}/(notes|reports|approvals)$`), (route) => route.fulfill({ json: [] }));
  await context.route(new RegExp(`/api/todos/${ITEM}/talk$`), (route) => route.fulfill({ json: { turns: [], answering: false, unanswered: null } }));
  await context.route(new RegExp(`/api/todos/${ITEM}/work-order$`), (route) => route.fulfill({ json: null }));

  return { context, release };
}

// Opens the item from its row on the board, from the drawer where the panel stands in one.
async function openItem(page: Page): Promise<void> {
  await page.goto(`${origin}/`, { waitUntil: "load" });
  await page.waitForFunction(() => window.useNuxtApp?.().isHydrating === false, null, { timeout: 30_000 });

  const row = page.locator(`li[data-todo-id="${ITEM}"]:visible`).first();

  if (!(await row.waitFor({ timeout: 10_000 }).then(() => true, () => false))) {
    await page.getByRole("button", { name: wording("todo.action.open_todo") }).click();
    await row.waitFor({ timeout: 10_000 });
  }

  await row.getByText(TITLE).click();
}

interface Row {
  label: string | null;
  chosen: { left: number; width: number };
  line: { left: number; width: number };
}

// Every tab row the modal stands with, its chosen tab and the line under it, read once nothing in the modal moves
// any more: the modal's growing in and each line's slide to where it was last sent.
async function tabRows(page: Page): Promise<Row[]> {
  const dialog = page.getByRole("dialog").filter({ hasText: TITLE }).last();

  await dialog.evaluate(() => new Promise((settled) => requestAnimationFrame(() => requestAnimationFrame(settled))));
  await dialog.evaluate((root) => Promise.all(root.getAnimations({ subtree: true }).map((animation) => animation.finished)));

  return await dialog.evaluate((root) =>
    [...root.querySelectorAll<HTMLElement>("[role=tablist]")]
      .filter((list) => list.offsetParent !== null)
      .map((list) => {
        const span = (selector: string) => {
          const box = list.querySelector(selector)!.getBoundingClientRect();

          return { left: box.left, width: box.width };
        };

        return { label: list.closest("[aria-label]")?.getAttribute("aria-label") ?? null, chosen: span("[role=tab][data-state=active]"), line: span("[data-slot=indicator]") };
      })
  );
}

function expectUnderChosen(rows: Row[]): void {
  expect(rows.length).toBeGreaterThan(0);

  for (const { label, chosen, line } of rows) {
    expect({ label, left: Math.abs(line.left - chosen.left) <= SUBPIXEL, width: Math.abs(line.width - chosen.width) <= SUBPIXEL }).toEqual({ label, left: true, width: true });
  }
}

describe.skipIf(!origin || !touchReady())("the TODO modal's active tab line when its review comes in after it opened", () => {
  for (const viewport of WIDTHS) {
    test(`every tab row's line stays under its chosen tab, ${viewport.width}px wide`, async () => {
      const { context, release } = await consoleWithHeldReview(viewport);

      try {
        const page = await context.newPage();

        await openItem(page);

        const dialog = page.getByRole("dialog").filter({ hasText: TITLE }).last();

        await dialog.getByRole("tab", { name: wording("todo.label.field_state") }).waitFor({ timeout: 30_000 });

        const before = await tabRows(page);

        expectUnderChosen(before);

        release();
        await dialog.getByRole("tab", { name: wording("todo.label.review_turns") }).waitFor({ timeout: 30_000 });

        const after = await tabRows(page);
        const moved = after.find((row) => before.some((one) => one.label === row.label && one.chosen.left !== row.chosen.left));

        // The review tab came in front of the chosen one and moved it.
        expect(moved).toBeDefined();
        expectUnderChosen(after);
      } finally {
        await context.close();
      }
    }, 60_000);
  }
});
