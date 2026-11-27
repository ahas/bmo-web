import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, BrowserContext, Page } from "playwright-core";
import type { StandingNote, TodoBoard, TodoItem, TodoReport } from "../../apps/web/shared/types";

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
const NUMBERED = 3;
const NOW = Math.floor(Date.now() / 1000);

const REPORT: TodoReport = { id: 1, kind: "final", body: "report-body", actor: "agent-a", at: NOW - 60 };
// The notes still standing as the raising form reads them: the item being viewed, which the chooser leaves out, one
// numbering its strands and one of prose.
const STANDING: StandingNote[] = [
  { id: NUMBERED, title: `item-title-${NUMBERED}`, strands: [{ number: 1, text: "first-strand" }, { number: 2, text: "second-strand" }] },
  { id: 5, title: "item-title-5", strands: [{ number: 1, text: "other-first" }, { number: 2, text: "other-second" }] },
  { id: 6, title: "item-title-6", strands: [] }
];

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

    await route.fulfill({
      json: { ...board, done: [item(NOTED, "unfinished-note"), item(PLAIN, null), item(NUMBERED, "1. first-strand\n2. second-strand")], standing: { ...board.standing, done: 3 } }
    });
  });
  await context.route(/\/api\/todos\/\d+\/reports$/, (route) => route.fulfill({ json: [REPORT] }));
  await context.route(/\/api\/todos\/standing-notes$/, (route) => route.fulfill({ json: STANDING }));

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

// The strands a raised row takes up (docs/web.md, the TODO panel's section): a note that numbers its strands stands a
// chooser of them in the form, by number and first words, on one line with its label and inside the dialog at a
// phone's width, and what is picked goes with the raise; a note of prose stands none. Beside it the other notes still
// standing are offered, the one being viewed left out, each strand naming its note and a note of prose whole, and
// what is picked goes with the raise as each note's item and strand. While the form holds anything,
// every way out of the dialog asks first, and a question turned down leaves the form as it was; a form left blank, or
// emptied again, closes at once.
describe.skipIf(!origin || !touchReady())("the raising form's strands and its close", () => {
  for (const viewport of WIDTHS) {
    test(`picks the strands a row takes up and asks before letting typing go at ${viewport.width}px`, async () => {
      const context = await open(viewport, "light");
      let raised: Record<string, unknown> | null = null;

      await context.route(/\/api\/todos$/, async (route) => {
        if (route.request().method() !== "POST") return await route.fallback();

        raised = route.request().postDataJSON() as Record<string, unknown>;
        await route.fulfill({ json: { ok: true, raised: 77 } });
      });

      try {
        const page = await context.newPage();
        const question = page.getByText(wording("common.title.discard_changes"));
        // The item's own dialog, told from the drawer standing the panel on a phone, which lists the same title.
        const itemShut = async () => await page.locator('[role="dialog"][data-state="open"]:has([data-item-head])').waitFor({ state: "detached", timeout: 10_000 });
        const raise = async (id: number) => {
          const create = dialog(page, id).getByRole("button", { name: wording("todo.action.create_item"), exact: true });

          if (viewport.phone) await create.tap();
          else await create.click();
          await dialog(page, id).getByRole("textbox", { name: wording("todo.label.new_title"), exact: true }).waitFor({ state: "visible", timeout: 10_000 });
        };
        const close = async (id: number) => await dialog(page, id).getByRole("button", { name: wording("common.action.close"), exact: true }).filter({ visible: true }).first().click();

        await visit(page, NUMBERED);
        await raise(NUMBERED);

        const sheet = dialog(page, NUMBERED);
        const chooser = sheet.locator("[data-raise-strands]");

        // On one line with its label, and inside the dialog.
        const placed = await chooser.evaluate((field) => {
          const box = field.getBoundingClientRect();
          const label = field.parentElement!.querySelector("span")!.getBoundingClientRect();
          const shell = field.closest('[role="dialog"]')!.getBoundingClientRect();

          return { line: Math.abs(box.top + box.height / 2 - (label.top + label.height / 2)) < 1, inside: box.left >= shell.left && box.right <= shell.right };
        });

        expect(placed).toEqual({ line: true, inside: true });

        await chooser.click();
        expect(await page.getByRole("option").allInnerTexts()).toEqual(["1. first-strand", "2. second-strand"]);
        await page.getByRole("option", { name: "2. second-strand" }).click();
        await page.keyboard.press("Escape");
        await page.getByRole("listbox").waitFor({ state: "detached", timeout: 10_000 });

        // The other notes, inside the dialog: the one being viewed is none of them.
        const sources = sheet.locator("[data-raise-sources]");

        expect(await sources.evaluate((field) => {
          const box = field.getBoundingClientRect();
          const shell = field.closest('[role="dialog"]')!.getBoundingClientRect();

          return box.left >= shell.left && box.right <= shell.right;
        })).toBe(true);
        await sources.click();
        await page.getByRole("option").first().waitFor({ state: "visible", timeout: 10_000 });
        expect(await page.getByRole("option").allInnerTexts()).toEqual(["#5 1. other-first", "#5 2. other-second", "#6 item-title-6"]);
        await page.getByRole("option", { name: "#5 2. other-second" }).click();
        await page.getByRole("option", { name: "#6 item-title-6" }).click();
        await page.keyboard.press("Escape");
        await page.getByRole("listbox").waitFor({ state: "detached", timeout: 10_000 });
        expect(await sources.innerText()).toContain("#5 2. other-second");

        // A strand picked is a change: closing asks, and the question turned down leaves the form as it was.
        await close(NUMBERED);
        await question.waitFor({ state: "visible", timeout: 10_000 });
        await page.keyboard.press("Escape");
        await question.waitFor({ state: "hidden", timeout: 10_000 });
        expect(await sheet.isVisible()).toBe(true);
        expect(await chooser.innerText()).toContain("2. second-strand");

        // Sent, it carries the strand picked.
        await sheet.getByRole("textbox", { name: wording("todo.label.new_title"), exact: true }).fill("the rest");
        await sheet.getByRole("textbox", { name: wording("todo.aria.new_body"), exact: true }).fill("carry on");
        await sheet.getByRole("button", { name: wording("todo.action.submit_for_approval"), exact: true }).click();
        await chooser.waitFor({ state: "detached", timeout: 10_000 });
        expect(raised).toMatchObject({
          action: "raise",
          id: NUMBERED,
          title: "the rest",
          said: "carry on",
          strands: [2],
          sources: [{ item: 5, strand: 2 }, { item: 6, strand: null }]
        });

        // The form gone with its send, closing asks nothing.
        await close(NUMBERED);
        await itemShut();
        expect(await question.count()).toBe(0);

        // A note of prose stands no chooser; a title typed and emptied again is no change.
        await visit(page, NOTED);
        await raise(NOTED);
        expect(await dialog(page, NOTED).locator("[data-raise-strands]").count()).toBe(0);

        const title = dialog(page, NOTED).getByRole("textbox", { name: wording("todo.label.new_title"), exact: true });

        await title.fill("typed");
        await title.fill("");
        await close(NOTED);
        await itemShut();
        expect(await question.count()).toBe(0);
      } finally {
        await context.close();
      }
    }, 120_000);
  }
});
