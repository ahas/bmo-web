import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, BrowserContext, Page } from "playwright-core";
import type { TodoBoard, TodoItem, TodoReport } from "../../apps/web/shared/types";

// The create button in the head of an item's dialog (docs/web.md, the add that belongs to a row, and the TODO
// panel's result tab): on an item carrying an unfinished note it stands in the head row, before the close mark, as
// the layer's contained create button, at a desktop width and a phone's, in light and dark. It never floats, so the
// screen's foot gains nothing as the dialog opens, and on a phone the drawer's head holds it where a finger presses
// it. A press brings the result forward, wherever the reader stood, with the raising form open under the note and
// its title box holding the typing; an item with no note stands no create button.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up, and
// serves the board and the item's reports through the page's own routes.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "todo-raise", password: "fixture-password-2871" };
// A desktop, and a Galaxy S25 held upright.
const WIDTHS = [{ width: 1280, height: 800, phone: false }, { width: 360, height: 780, phone: true }];
const SCHEMES = ["light", "dark"] as const;
const NOTED = 1;
const PLAIN = 2;
const NOW = Math.floor(Date.now() / 1000);

const REPORT: TodoReport = { id: 1, kind: "final", body: "report-body", actor: "agent-a", at: NOW - 60 };

function item(id: number, unfinished: string | null): TodoItem {
  return {
    id,
    title: `item-title-${id}`,
    instruction: "item-instruction",
    requester: "Owner",
    requesterId: 42,
    chatId: 42,
    approved: true,
    awaitingApproval: false,
    recommended: false,
    done: true,
    running: false,
    liveState: null,
    worker: "agent-a",
    priority: 1,
    status: "done",
    model: null,
    agent: null,
    ranOn: null,
    note: null,
    reports: [REPORT],
    unfinished,
    rejections: 0,
    unfinishedResolvedAt: null,
    unfinishedResolution: null,
    heldAt: null,
    heldReason: null,
    heldKind: null,
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
    doneAt: NOW - 60
  };
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

async function open(viewport: (typeof WIDTHS)[number], scheme: (typeof SCHEMES)[number]): Promise<BrowserContext> {
  const context = await browser!.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.phone,
    hasTouch: viewport.phone,
    colorScheme: scheme,
    serviceWorkers: "block",
    reducedMotion: "reduce"
  });
  const at = cookie.indexOf("=");

  await context.addCookies([
    { name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! },
    { name: "nuxt-color-mode", value: scheme, url: origin! }
  ]);
  await context.route(/\/api\/todos(\?|$)/, async (route) => {
    if (route.request().method() !== "GET") return await route.continue();

    const board = (await (await route.fetch()).json()) as TodoBoard;

    await route.fulfill({ json: { ...board, done: [item(NOTED, "unfinished-note"), item(PLAIN, null)], standing: { ...board.standing, done: 2 } } });
  });
  await context.route(/\/api\/todos\/\d+\/reports$/, (route) => route.fulfill({ json: [REPORT] }));

  return context;
}

// The page opened on the item's address and its dialog standing on the screen.
async function visit(page: Page, id: number): Promise<void> {
  await page.goto(`${origin}/?todo=${id}`, { waitUntil: "load" });
  await page.getByText(`item-title-${id}`).filter({ visible: true }).first().waitFor({ state: "visible", timeout: 30_000 });
}

// The open dialog on the screen, the one holding the item's title; a drawer standing the panel on a phone is a
// dialog too, and holds no title.
function dialog(page: Page, id: number) {
  return page.locator('[role="dialog"][data-state="open"]').filter({ hasText: `item-title-${id}` }).last();
}

describe.skipIf(!origin || !touchReady())("the create button in an item's head", () => {
  for (const viewport of WIDTHS) {
    for (const scheme of SCHEMES) {
      test(`stands contained in the head and opens the raising form at ${viewport.width}px in ${scheme}`, async () => {
        const context = await open(viewport, scheme);

        try {
          const page = await context.newPage();
          const feet = async () => await page.locator("[data-screen-foot]").count();

          await page.goto(`${origin}/`, { waitUntil: "load" });
          const before = await feet();

          await visit(page, NOTED);
          const sheet = dialog(page, NOTED);
          const create = sheet.getByRole("button", { name: wording("todo.action.create_item"), exact: true });
          const close = sheet.getByRole("button", { name: wording("common.action.close"), exact: true }).first();

          await create.waitFor({ state: "visible", timeout: 10_000 });
          // Nothing floats: the screen's foot holds what it held before the dialog opened.
          expect(await feet()).toBe(before);

          // In the head row, before the close mark, at the close mark's size and line, and pressable where it stands.
          const placed = await create.evaluate((button, closing) => {
            const box = button.getBoundingClientRect();
            const shut = (closing as HTMLElement).getBoundingClientRect();
            const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);

            return {
              width: Math.round(box.width),
              height: Math.round(box.height),
              shutWidth: Math.round(shut.width),
              shutHeight: Math.round(shut.height),
              before: box.right <= shut.left + 0.5,
              sameLine: Math.abs(box.top + box.height / 2 - (shut.top + shut.height / 2)) < 1,
              inside: box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight,
              pressable: hit !== null && button.contains(hit),
              fixed: getComputedStyle(button.parentElement!).position === "fixed"
            };
          }, await close.elementHandle());

          expect(placed).toEqual({
            width: placed.shutWidth,
            height: placed.shutHeight,
            shutWidth: placed.shutWidth,
            shutHeight: placed.shutHeight,
            before: true,
            sameLine: true,
            inside: true,
            pressable: true,
            fixed: false
          });

          // From another tab, a press brings the result forward with the form open and its title box focused.
          await sheet.getByRole("tab", { name: wording("todo.label.field_instruction") }).first().click();
          await sheet.getByText("unfinished-note").waitFor({ state: "hidden", timeout: 10_000 });
          if (viewport.phone) {
            await create.tap();
          } else {
            await create.click();
          }

          const title = sheet.getByRole("textbox", { name: wording("todo.label.new_title"), exact: true });

          await title.waitFor({ state: "visible", timeout: 10_000 });
          await page.waitForFunction((box) => box === document.activeElement, await title.elementHandle(), { timeout: 5_000 });
          expect(await sheet.getByText("unfinished-note").isVisible()).toBe(true);
          expect(await feet()).toBe(before);

          // An item with no note to raise from stands no create button.
          await visit(page, PLAIN);
          expect(await dialog(page, PLAIN).getByRole("button", { name: wording("todo.action.create_item"), exact: true }).count()).toBe(0);
        } finally {
          await context.close();
        }
      }, 120_000);
    }
  }
});
