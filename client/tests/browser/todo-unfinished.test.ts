import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, BrowserContext, Locator, Page } from "playwright-core";
import type { TodoBoard, TodoItem, TodoReport } from "../../apps/web/shared/types";

// A finished item's unfinished note on the TODO panel (docs/web.md, the TODO panel's section): its row carries the
// open note's tag while the note stands and the resolved tag once it is resolved, a row with none carries neither, and
// the filter's unfinished condition goes to the board as a condition the server applies, the panel standing what
// the board answered under it. The opened item stands the note in its own cell with the resolving box under it; a resolving
// goes out with its line, and the item then stands when and why under the note. A desk width and a phone's.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up, and
// serves the board, the item and its reports through the page's own routes, answering the board by the condition it
// was asked with as the server does.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "todo-unfinished", password: "fixture-password-3832" };
const WIDTHS = [{ width: 1280, height: 800, phone: false }, { width: 360, height: 780, phone: true }];
const NOW = Math.floor(Date.now() / 1000);
const OPEN = 1;
const RESOLVED = 2;
const PLAIN = 3;

const REPORT: TodoReport = { id: 1, kind: "final", body: "report-body", actor: "agent-a", at: NOW - 60 };

function item(id: number, unfinished: string | null, resolution: string | null): TodoItem {
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
    priority: id,
    status: "done",
    model: null,
    agent: null,
    ranOn: null,
    note: null,
    reports: [REPORT],
    unfinished,
    rejections: 0,
    unfinishedResolvedAt: resolution === null ? null : NOW - 30,
    unfinishedResolution: resolution,
    heldAt: null,
    heldReason: null,
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
    doneAt: NOW - 60
  };
}

// What the routes stand for the board: the resolution each item carries, the conditions the board was asked with and
// the resolvings sent.
interface Job {
  resolutions: Map<number, string>;
  asked: (string | null)[];
  resolved: { id: number; why: string | undefined }[];
}

const rowsOf = (job: Job): TodoItem[] => [
  item(OPEN, "unfinished-note-1", job.resolutions.get(OPEN) ?? null),
  item(RESOLVED, "unfinished-note-2", job.resolutions.get(RESOLVED) ?? "resolution-2"),
  item(PLAIN, null, null)
];

const stateOf = (row: TodoItem) => (row.unfinished === null ? null : row.unfinishedResolvedAt === null ? "open" : "resolved");

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

async function open(viewport: (typeof WIDTHS)[number], job: Job): Promise<BrowserContext> {
  const context = await browser!.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.phone,
    hasTouch: viewport.phone,
    colorScheme: "light",
    serviceWorkers: "block",
    reducedMotion: "reduce"
  });
  const at = cookie.indexOf("=");

  await context.addCookies([
    { name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! },
    { name: "nuxt-color-mode", value: "light", url: origin! }
  ]);
  await context.route(/\/api\/todos(\?|$)/, async (route) => {
    if (route.request().method() === "POST") {
      const { action, id, why } = route.request().postDataJSON() as { action: string; id: number; why?: string };

      if (action === "resolve") {
        job.resolved.push({ id, why });
        job.resolutions.set(id, why ?? "");
      }

      return await route.fulfill({ json: { ok: true } });
    }

    const board = (await (await route.fetch()).json()) as TodoBoard;
    const condition = new URL(route.request().url()).searchParams.get("unfinished");
    const done = rowsOf(job).filter((row) => condition === null || stateOf(row) === condition);

    job.asked.push(condition);
    await route.fulfill({ json: { ...board, queue: [], pending: [], held: [], merged: [], done, doneTotal: done.length } });
  });
  await context.route(/\/api\/todos\/\d+$/, (route) => {
    const id = Number(new URL(route.request().url()).pathname.split("/").at(-1));

    return route.fulfill({ json: rowsOf(job).find((row) => row.id === id) });
  });
  await context.route(/\/api\/todos\/\d+\/reports$/, (route) => route.fulfill({ json: [REPORT] }));

  return context;
}

// A control pressed the way the width's reader presses it: a finger on a phone, a pointer elsewhere.
async function press(target: Locator, phone: boolean): Promise<void> {
  if (phone) await target.tap();
  else await target.click();
}

function rowOf(page: Page, id: number): Locator {
  return page.locator(`li[data-todo-id="${id}"]:visible`).first();
}

// The list, where the panel stands open beside the page, or behind the drawer's button where it does not.
async function showList(page: Page, phone: boolean): Promise<void> {
  const row = rowOf(page, OPEN);
  const opener = page.getByRole("button", { name: wording("todo.action.open_todo") });

  await row.or(opener).first().waitFor({ timeout: 30_000 });

  if (!(await row.isVisible())) {
    await press(opener, phone);
    await row.waitFor({ timeout: 10_000 });
  }
}

// The open dialog on the screen, the one holding the item's title.
function dialog(page: Page, id: number): Locator {
  return page.locator('[role="dialog"][data-state="open"]').filter({ hasText: `item-title-${id}` }).last();
}

// The board's answer to a read asking it for that unfinished condition.
async function boardAsked(page: Page, condition: string): Promise<void> {
  await page.waitForResponse((response) => {
    const url = new URL(response.url());

    return url.pathname.endsWith("/api/todos") && url.searchParams.get("unfinished") === condition;
  }, { timeout: 10_000 });
}

// Whether a row's tag stands whole inside its row.
async function tagInside(row: Locator, tag: Locator): Promise<boolean> {
  const [outer, inner] = await Promise.all([row.boundingBox(), tag.boundingBox()]);

  return outer !== null && inner !== null && inner.x >= outer.x - 0.5 && inner.x + inner.width <= outer.x + outer.width + 0.5;
}

describe.skipIf(!origin || !touchReady())("a finished item's unfinished note", () => {
  for (const viewport of WIDTHS) {
    test(`stands as the row's tag, narrows the board by the server's condition and is resolved in its cell, at ${viewport.width}px`, async () => {
      const job: Job = { resolutions: new Map(), asked: [], resolved: [] };
      const context = await open(viewport, job);

      try {
        const page = await context.newPage();
        const openTag = wording("todo.label.unfinished_open");
        const resolvedTag = wording("todo.label.unfinished_resolved");

        await page.goto(`${origin}/`, { waitUntil: "load" });
        await showList(page, viewport.phone);

        // The tag tells a standing note from a resolved one, and a row with none carries neither.
        const openRowTag = rowOf(page, OPEN).getByText(openTag, { exact: true });
        const resolvedRowTag = rowOf(page, RESOLVED).getByText(resolvedTag, { exact: true });

        await openRowTag.waitFor({ timeout: 10_000 });
        await resolvedRowTag.waitFor({ timeout: 10_000 });
        expect(await tagInside(rowOf(page, OPEN), openRowTag)).toBe(true);
        expect(await rowOf(page, PLAIN).getByText(openTag, { exact: true }).count()).toBe(0);
        expect(await rowOf(page, PLAIN).getByText(resolvedTag, { exact: true }).count()).toBe(0);

        // A note still standing is asked of the board, and the panel stands what it answered.
        await press(page.getByRole("button", { name: wording("todo.label.filter"), exact: true }).locator("visible=true").first(), viewport.phone);
        await press(page.getByRole("button", { name: wording("todo.aria.filter_of", { name: wording("todo.label.field_unfinished") }), exact: true }), viewport.phone);
        const remaining = boardAsked(page, "open");

        await press(page.getByRole("option", { name: wording("todo.label.unfinished_remaining"), exact: true }), viewport.phone);
        await remaining;
        await rowOf(page, RESOLVED).waitFor({ state: "hidden", timeout: 10_000 });
        expect(await rowOf(page, PLAIN).count()).toBe(0);
        expect(await rowOf(page, OPEN).isVisible()).toBe(true);

        // A resolved note is asked the same way.
        await press(page.getByRole("button", { name: wording("todo.aria.filter_of", { name: wording("todo.label.field_unfinished") }), exact: true }), viewport.phone);
        const resolvedAsked = boardAsked(page, "resolved");

        await press(page.getByRole("option", { name: resolvedTag, exact: true }), viewport.phone);
        await resolvedAsked;
        await rowOf(page, RESOLVED).waitFor({ timeout: 10_000 });
        await rowOf(page, OPEN).waitFor({ state: "hidden", timeout: 10_000 });
        expect(job.asked.at(-1)).toBe("resolved");

        // The opened item stands the note in its cell with the resolving box under it; the resolving goes out with
        // its line, and the cell then says when and why.
        await page.goto(`${origin}/?todo=${OPEN}`, { waitUntil: "load" });

        const sheet = dialog(page, OPEN);

        await sheet.getByText("unfinished-note-1").waitFor({ timeout: 30_000 });

        const box = sheet.getByRole("textbox", { name: wording("todo.aria.resolve_reason"), exact: true });

        await box.fill("resolution-1");
        await press(sheet.getByRole("button", { name: resolvedTag, exact: true }), viewport.phone);
        await sheet.getByText("resolution-1").waitFor({ timeout: 10_000 });
        expect(job.resolved).toEqual([{ id: OPEN, why: "resolution-1" }]);
        expect(await box.count()).toBe(0);
      } finally {
        // A poll of the board still in flight would otherwise fail on a closed context.
        await context.unrouteAll({ behavior: "ignoreErrors" });
        await context.close();
      }
    }, 120_000);
  }
});
