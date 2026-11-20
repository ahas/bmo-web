import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { contrast } from "./contrast";
import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";

import type { Browser, BrowserContext, Page } from "playwright-core";
import type { TodoApproval, TodoBoard, TodoItem } from "../../apps/web/shared/types";

// The TODO modal as an approval document, as the browser lays it out (docs/web.md, 「The modal is built as an approval
// document to read one item」): the state on a line of its own under the title, never beside it; on a wide dialog the
// form block at the head's top right with the approval line and the assignment, the close mark centred on its first
// row and the head no taller than the box; on a narrow one the box under the state with its approval line alone and
// the assignment heading the manage tab; at both widths every word of the box readable on its cells, and the
// content taking most of the dialog's height. What each approval cell says is the domain's own test; here it is only
// seen drawn.
// It drives the console tests/support/browser-console.ts stands up, serving what each place reads through the page's
// own routes; the suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "todo-form-box", password: "fixture-password-3767" };
const ITEM = 3767;
const NOW = Math.floor(Date.now() / 1000);
// The share of the dialog's height the content keeps at least, at each width: a head of rows of names leaves it
// near 63% on a wide dialog and 32% on a phone's sheet.
const WIDTHS = [
  { width: 1280, height: 900, phone: false, content: 0.7 },
  { width: 360, height: 780, phone: true, content: 0.6 }
] as const;

const BRIEF = ["Fix the layout of the modal.", "", ...Array.from({ length: 60 }, (_, index) => `- Line ${index + 1} of the brief.`)].join("\n");
const APPROVALS: TodoApproval[] = [
  { id: 2, kind: "approval", caller: "agent-a", at: NOW - 3_000 },
  { id: 1, kind: "recommendation", caller: "agent-b", at: NOW - 3_500 }
];

function item(): TodoItem {
  return {
    id: ITEM, title: "item-title of a fairly ordinary length for a request", instruction: BRIEF, requester: "requester-a", requesterId: null, chatId: null, approved: true,
    awaitingApproval: false, recommended: true, done: false, running: false, worker: "worker-b", priority: 3, status: "open", model: null, agent: "agent-a", ranOn: null, note: null,
    reports: [], unfinished: null, rejections: 0,
    unfinishedResolvedAt: null, unfinishedResolution: null, heldAt: null, heldReason: null, heldKind: null,
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

async function open(viewport: (typeof WIDTHS)[number]): Promise<BrowserContext> {
  const context = await browser!.newContext({ viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.phone, hasTouch: viewport.phone, serviceWorkers: "block", reducedMotion: "reduce" });
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
  await context.route(/\/api\/todos(\?|$)/, async (route) => {
    if (route.request().method() !== "GET") return await route.continue();

    const board = (await (await route.fetch()).json()) as TodoBoard;

    await route.fulfill({ json: { ...board, queue: [item()] } });
  });
  await context.route(new RegExp(`/api/todos/${ITEM}$`), (route) => route.fulfill({ json: item() }));
  await context.route(new RegExp(`/api/todos/${ITEM}/approvals$`), (route) => route.fulfill({ json: APPROVALS }));
  await context.route(new RegExp(`/api/todos/${ITEM}/(notes|reports|reviews)$`), (route) => route.fulfill({ json: [] }));
  await context.route(new RegExp(`/api/todos/${ITEM}/talk$`), (route) => route.fulfill({ json: { turns: [], answering: false, unanswered: null } }));
  await context.route(new RegExp(`/api/todos/${ITEM}/work-order$`), (route) => route.fulfill({ json: null }));

  return context;
}

// The boxes the layout is read from, each as the browser drew it.
async function boxes(page: Page) {
  const dialog = page.getByRole("dialog").filter({ hasText: "item-title" }).last();

  // The approval line stands once the approvals are read: no cell waits as a bar any more.
  await dialog.locator('[data-approval-cell="approve"]').getByText("agent-a").waitFor({ timeout: 30_000 });

  return await dialog.evaluate((root) => {
    const rect = (selector: string) => {
      const found = [...root.querySelectorAll(selector)].find((one) => (one as HTMLElement).offsetParent !== null);
      const box = found?.getBoundingClientRect();

      return box === undefined ? null : { top: box.top, bottom: box.bottom, left: box.left, right: box.right, height: box.height };
    };
    const closeBox = rect("[data-item-close]");

    return {
      dialog: root.getBoundingClientRect().height,
      head: rect("[data-item-head]")!,
      title: rect("[data-item-title]")!,
      state: rect("[data-item-state]")!,
      form: rect("[data-item-form]")!,
      firstCell: rect("[data-approval-cell] > span")!,
      close: closeBox,
      body: (root.querySelector("[data-item-body]") as HTMLElement).clientHeight,
      formFields: root.querySelectorAll("[data-item-form] [data-pair]").length
    };
  });
}

describe.skipIf(!origin || !touchReady())("the TODO modal as an approval document", () => {
  for (const viewport of WIDTHS) {
    test(`the title stands alone, the form block holds the approval line, and the content keeps the height, ${viewport.width}px wide`, async () => {
      const context = await open(viewport);

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/?todo=${ITEM}`, { waitUntil: "load" });

        const drawn = await boxes(page);
        const dialog = page.getByRole("dialog").filter({ hasText: "item-title" }).last();

        // No chip beside the title: the state stands on a line of its own under it.
        expect(drawn.state.top).toBeGreaterThanOrEqual(drawn.title.bottom);
        // The approval line names who asked, who recommended and who approved.
        expect(await dialog.locator("[data-approval-cell]").evaluateAll((all) => all.map((one) => one.getAttribute("data-approval-cell")))).toEqual(["request", "recommend", "approve"]);
        expect(await dialog.locator('[data-approval-cell="request"]').innerText()).toContain("requester-a");
        expect(await dialog.locator('[data-approval-cell="recommend"]').innerText()).toContain("agent-b");
        // Every word of the box reads at 4.5:1 or better, the names in their tinted cells among them.
        const ratios = await contrast(page, "[data-item-form] [data-approval-cell] span:not(:has(span)), [data-item-form] dt, [data-item-form] dd span:not(:has(*))");

        expect(ratios.filter((one) => one.ratio < 4.5)).toEqual([]);

        if (!viewport.phone) {
          // The box stands at the head's top right, level with the title, the close mark centred on its first row.
          expect(drawn.form.left).toBeGreaterThan(drawn.title.right);
          expect(Math.abs(drawn.form.top - drawn.title.top)).toBeLessThanOrEqual(16);
          expect(Math.abs((drawn.close!.top + drawn.close!.bottom) / 2 - (drawn.firstCell.top + drawn.firstCell.bottom) / 2)).toBeLessThanOrEqual(2);
          // The head is no taller than the box and its padding, and the box carries the assignment.
          expect(drawn.head.bottom - drawn.form.bottom).toBeLessThanOrEqual(16);
          expect(drawn.formFields).toBe(4);
        } else {
          // The box stands under the state with its approval line alone; the assignment heads the manage tab.
          expect(drawn.form.top).toBeGreaterThanOrEqual(drawn.state.bottom);
          expect(drawn.formFields).toBe(0);
          await dialog.getByRole("tab", { name: wording("todo.label.manage"), exact: true }).click();
          await dialog.locator('[data-pair="worker"]').waitFor({ timeout: 10_000 });
          expect(await dialog.locator("[data-pair]").evaluateAll((all) => all.map((one) => one.getAttribute("data-pair")))).toEqual(["agent", "worker", "model", "priority"]);
        }

        // The content keeps most of the dialog's height.
        expect(drawn.body / drawn.dialog).toBeGreaterThanOrEqual(viewport.content);
      } finally {
        await context.close();
      }
    }, 60_000);
  }
});
