import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";

import KO from "../fixtures/browser/item-reports.test.ko.json";

import type { Browser, BrowserContext } from "playwright-core";
import type { TodoBoard, TodoItem, TodoReport } from "../../apps/web/shared/types";

// A finished item's reports and the readings of its English texts, as the browser lays them out (docs/web.md, the
// TODO modal's result and instruction tabs, 「The original, and its translation in its place」): every report stands
// in the result tab, the closing one first and whole, headed by its kind and moment; the row's mark counts them; each
// English text opens in its original with the show-translation line above it, the Korean reading taking the original's place when it
// is pressed and the show-original press putting the original back, each text asked of the translator once however often it is
// pressed; and each approval stands with its caller and kind, a recommendation apart from approval.
// It drives the console tests/support/browser-console.ts stands up, serving what each place reads through the page's
// own routes; the suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "item-reports", password: "fixture-password-2251" };
const ITEM = 2251;
const NOW = Math.floor(Date.now() / 1000);
const WIDTHS = [
  { width: 1280, height: 900, phone: false },
  { width: 360, height: 780, phone: true }
] as const;

// A closing report long enough that a fold or a scroll of its own would hide its end.
const FINAL = [
  "The skill is committed and pushed.",
  "",
  ...Array.from({ length: 40 }, (_, index) => `- Step ${index + 1} of the work was done and checked.`),
  "",
  "Last line of the closing report."
].join("\n");
const PROGRESS = "Half of the work is done.";
const BRIEF = "Write the wording skill and remove the copied guide.";

const REPORTS: TodoReport[] = [
  { id: 2, kind: "final", body: FINAL, actor: "worker-b", at: NOW - 600 },
  { id: 1, kind: "progress", body: PROGRESS, actor: "worker-b", at: NOW - 1_200 }
];

function item(): TodoItem {
  return {
    id: ITEM, title: "item-title", instruction: BRIEF, requester: "Owner", requesterId: null, chatId: null, approved: true, awaitingApproval: false, recommended: false, done: true,
    running: false, worker: "worker-b", priority: 1, status: "done", model: null, agent: null, ranOn: null, note: null, reports: REPORTS, unfinished: null,
    rejections: 0,
    unfinishedResolvedAt: null, unfinishedResolution: null, heldAt: null, heldReason: null, heldKind: null,
    mergedInto: null, mergedAt: null, mergedIntoTitle: null, mergedFrom: [], attempts: 1, progress: null, stopped: null, holding: null, waiting: null,
    deployWaits: false, closing: null, deployHeld: false, holdPending: false, orderActive: false, seconds: null, spans: [], createdAt: NOW - 4_000, doneAt: NOW - 600
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

// Every original the translator was asked for, in the order asked.
const asked: string[] = [];

// A browser that translates on its own opens a text already read; one that does not opens it as written, its reading a
// press away. Most of these tests drive the press, so they open with the browser's auto translation off.
async function open(viewport: (typeof WIDTHS)[number], auto = false): Promise<BrowserContext> {
  const context = await browser!.newContext({ viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.phone, hasTouch: viewport.phone, serviceWorkers: "block", reducedMotion: "reduce" });
  const at = cookie.indexOf("=");

  await context.addCookies([
    { name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! },
    ...(auto ? [] : [{ name: "console_auto_translate", value: "false", url: origin! }])
  ]);
  await context.route(/\/api\/todos(\?|$)/, async (route) => {
    if (route.request().method() !== "GET") return await route.continue();

    const board = (await (await route.fetch()).json()) as TodoBoard;

    await route.fulfill({ json: { ...board, done: [item()], doneTotal: 1 } });
  });
  await context.route(new RegExp(`/api/todos/${ITEM}$`), (route) => route.fulfill({ json: item() }));
  await context.route(new RegExp(`/api/todos/${ITEM}/reports$`), (route) => route.fulfill({ json: REPORTS }));
  await context.route(new RegExp(`/api/todos/${ITEM}/(notes|approvals)$`), (route) => route.fulfill({ json: [] }));
  await context.route(new RegExp(`/api/todos/${ITEM}/talk$`), (route) => route.fulfill({ json: { turns: [], answering: false, unanswered: null } }));
  await context.route(new RegExp(`/api/todos/${ITEM}/work-order$`), (route) => route.fulfill({ json: null }));
  // The console's own translation route: each reading comes after a moment, so the place under the original is seen
  // waiting first.
  await context.route(/\/api\/translations$/, async (route) => {
    const body = route.request().postDataJSON() as { language: string; originals: string[] };

    asked.push(...body.originals);
    await Bun.sleep(400);
    await route.fulfill({ json: { readings: body.originals.map((text) => ({ text: `ko-reading: ${text.split("\n")[0]}`, whole: true })) } });
  });

  return context;
}

async function until<T>(read: () => Promise<T>, holds: (value: T) => boolean, ms = 10_000): Promise<T> {
  const end = Date.now() + ms;
  let value = await read();

  while (!holds(value) && Date.now() < end) {
    await Bun.sleep(100);
    value = await read();
  }

  return value;
}

describe.skipIf(!origin || !touchReady())("an item's reports and translations", () => {
  for (const viewport of WIDTHS) {
    test(`every report stands whole with its reading a press away in its place, each text asked once, ${viewport.width}px wide`, async () => {
      const context = await open(viewport);

      asked.length = 0;

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/?todo=${ITEM}`, { waitUntil: "load" });

        await page.getByRole("dialog").locator("[data-report]").first().waitFor({ timeout: 20_000 });

        const dialog = page.getByRole("dialog").filter({ hasText: "item-title" }).last();

        // It opens on the result tab, which holds every report, the closing one first, each headed by its kind and moment.
        expect(await dialog.getByRole("tab", { selected: true }).first().innerText()).toContain(wording("todo.label.result"));
        expect(await dialog.locator("[data-report]").evaluateAll((all) => all.map((one) => one.getAttribute("data-report-kind")))).toEqual(["final", "progress"]);

        const closing = dialog.locator("[data-report]").first();
        const head = await closing.locator("p").first().innerText();

        expect(head).toContain(wording("todo.label.report_final"));
        expect(head).toContain("worker-b");
        expect(await dialog.locator("[data-report]").nth(1).locator("p").first().innerText()).toContain(wording("todo.label.report_progress"));

        // The closing report stands whole: its last line is drawn, and nothing in it scrolls or clips on its own.
        expect(await closing.innerText()).toContain("Last line of the closing report.");
        expect(await closing.evaluate((node) => [node, ...node.querySelectorAll("*")].every((one) => one.scrollHeight <= one.clientHeight + 1 || getComputedStyle(one).overflowY === "visible"))).toBe(true);

        // Each English original opens as it was written, its line above it, and nothing is asked until it is pressed.
        const line = closing.locator("[data-reading]");

        expect(await line.innerText()).toContain(wording("common.action.show_translation"));
        expect(asked).toEqual([]);

        // Pressed, the reading takes the original's place, saying the language it came from; the show-original press puts it back.
        await closing.locator("[data-reading-translate]").click();
        await until(async () => await closing.innerText(), (text) => text.includes("ko-reading: The skill is committed and pushed."));
        expect(await closing.innerText()).not.toContain("\nThe skill is committed and pushed.");
        expect(await line.innerText()).toContain(wording("common.label.translated_from", { language: wording("documents.label.language_en") }));
        await closing.locator("[data-reading-original]").click();
        expect(await closing.innerText()).toContain("The skill is committed and pushed.");
        expect(await closing.innerText()).not.toContain("ko-reading:");

        // The instruction tab stands the brief the same way.
        await dialog.getByRole("tab", { name: wording("todo.label.field_instruction") }).first().click();

        const briefLine = dialog.locator("[data-reading]").filter({ hasText: wording("common.action.show_translation") }).first();

        await briefLine.locator("[data-reading-translate]").click();
        expect(await until(async () => await dialog.getByText(`ko-reading: ${BRIEF}`).count(), (n) => n >= 1)).toBeGreaterThanOrEqual(1);

        // Closed and opened again in the same tab, a press asks nothing again: every text was asked for once. (A tab
        // opened afresh asks the gate again, which answers what it keeps without its translator.)
        await page.keyboard.press("Escape");
        const itemDialogs = page.getByRole("dialog").filter({ has: page.getByRole("tab", { name: wording("todo.label.field_instruction") }) });

        expect(await until(async () => await itemDialogs.count(), (n) => n === 0)).toBe(0);
        // The app's own router opens the item again, as a press in the same tab would.
        await page.evaluate(`(async () => {
          const router = document.querySelector("#__nuxt").__vue_app__.config.globalProperties.$router;

          await router.push({ query: {} });
          await router.push({ query: { todo: "${ITEM}" } });
        })()`);
        // The same item opened again opens on its result tab, not the tab it was closed on, and on the originals; a press
        // stands the reading at once, from what the tab kept.
        const again = itemDialogs.last();

        await again.locator("[data-report]").first().waitFor({ timeout: 20_000 });
        expect(await again.getByRole("tab", { selected: true }).first().innerText()).toContain(wording("todo.label.result"));
        await again.locator("[data-report]").first().locator("[data-reading-translate]").click();
        await until(async () => await again.locator("[data-report]").first().innerText(), (text) => text.includes("ko-reading:"));
        await Bun.sleep(800);

        const once = new Set(asked);

        expect(asked.length).toBe(once.size);
        expect([...once].sort()).toEqual([BRIEF, FINAL].sort());

        // The sentence that said a work order's translation cannot be had is gone.
        expect(await page.getByText(KO.unavailable).count()).toBe(0);
      } finally {
        await context.close();
      }
    }, 90_000);
  }

  test("a report in another language opens already read where this browser translates on its own, the original a press away", async () => {
    const context = await open(WIDTHS[0], true);

    asked.length = 0;

    try {
      const page = await context.newPage();

      await page.goto(`${origin}/?todo=${ITEM}`, { waitUntil: "load" });
      await page.getByRole("dialog").locator("[data-report]").first().waitFor({ timeout: 20_000 });

      const closing = page.getByRole("dialog").filter({ hasText: "item-title" }).last().locator("[data-report]").first();

      // Asked as it opens, with nothing pressed, the reading takes the original's place.
      await until(async () => await closing.innerText(), (text) => text.includes("ko-reading: The skill is committed and pushed."));
      expect(asked).toContain(FINAL);
      expect(await closing.locator("[data-reading]").innerText()).toContain(wording("common.label.translated_from", { language: wording("documents.label.language_en") }));

      // The original is a press away, and stays until another text opens.
      await closing.locator("[data-reading-original]").click();
      expect(await closing.innerText()).toContain("The skill is committed and pushed.");
      expect(await closing.innerText()).not.toContain("ko-reading:");
    } finally {
      await context.close();
    }
  }, 60_000);

  test("an approval stands with its caller and kind, and a recommendation apart from it, waiting on the owner", async () => {
    const context = await open(WIDTHS[0]);

    try {
      await context.route(new RegExp(`/api/todos/${ITEM}/approvals$`), (route) =>
        route.fulfill({ json: [{ id: 2, kind: "approval", caller: "ahas", at: NOW - 60 }, { id: 1, kind: "recommendation", caller: "chat", at: NOW - 120 }] })
      );
      await context.route(/\/api\/todos(\?|$)/, async (route) => {
        if (route.request().method() !== "GET") return await route.continue();

        const board = (await (await route.fetch()).json()) as TodoBoard;
        const waiting = { ...item(), id: 2252, title: "recommended-title", done: false, status: "open", approved: false, awaitingApproval: true, recommended: true, reports: [] };

        await route.fulfill({ json: { ...board, pending: [waiting], done: [item()], doneTotal: 1 } });
      });

      const page = await context.newPage();

      await page.goto(`${origin}/?todo=${ITEM}`, { waitUntil: "load" });

      const dialog = page.getByRole("dialog").filter({ has: page.getByRole("tab", { name: wording("todo.label.field_instruction") }) }).last();

      await dialog.getByRole("tab", { name: wording("todo.label.field_state") }).first().click();

      const record = dialog.locator("[data-approval-kind]");

      await record.first().waitFor({ timeout: 20_000 });
      expect(await record.evaluateAll((all) => all.map((one) => [one.getAttribute("data-approval-kind"), one.textContent?.trim()]))).toEqual([
        ["approval", `${wording("todo.label.approval_given")} · ahas`],
        ["recommendation", `${wording("todo.label.approval_recommended")} · chat`]
      ]);

      await page.keyboard.press("Escape");
      expect(await page.locator("[data-recommended]").first().innerText()).toContain(wording("todo.label.approval_recommended"));
    } finally {
      await context.close();
    }
  }, 90_000);

  test("the row's report mark counts the reports and names their kinds", async () => {
    const context = await open(WIDTHS[0]);

    try {
      const page = await context.newPage();

      await page.goto(`${origin}/`, { waitUntil: "load" });

      const mark = page.locator("[data-report-mark]").first();

      await mark.waitFor({ timeout: 20_000 });
      expect((await mark.innerText()).trim()).toBe("2");
      expect(await mark.getAttribute("aria-label")).toBe(
        `${wording("todo.label.report_count", { n: 2 })} · ${wording("todo.label.report_final")}, ${wording("todo.label.report_progress")}`
      );
    } finally {
      await context.close();
    }
  }, 90_000);
});
