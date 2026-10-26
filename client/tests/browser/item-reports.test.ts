import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";

import KO from "../fixtures/browser/item-reports.test.ko.json";

import type { Browser, BrowserContext } from "playwright-core";
import type { TodoBoard, TodoItem, TodoReport } from "../../apps/web/shared/types";

// A finished item's reports and the translations under its English texts, as the browser lays them out (docs/web.md,
// the TODO modal's result and instruction tabs, 「The original, and its translation under it」): every report stands
// in the result tab, the closing one first and whole, headed by its kind and moment; the row's mark counts them; each
// English text stands in its original with a Korean reading under it, each text asked of the translator once however
// often the item is opened; and each approval stands with its caller and kind, a recommendation apart from approval.
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
    id: ITEM, title: "item-title", instruction: BRIEF, requester: "Owner", requesterId: null, chatId: null, approved: true, recommended: false, done: true,
    running: false, worker: "worker-b", cowork: false, priority: 1, status: "done", model: null, ranOn: null, note: null, reports: REPORTS, unfinished: null,
    unfinishedResolvedAt: null, unfinishedResolution: null, brief: BRIEF, heldAt: null, heldReason: null, heldKind: null,
    mergedInto: null, mergedAt: null, mergedIntoTitle: null, mergedFrom: [], attempts: 1, progress: null, stopped: null, holding: null, waiting: null,
    deployWaits: false, holdPending: false, orderActive: false, seconds: null, spans: [], createdAt: NOW - 4_000, doneAt: NOW - 600
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

async function open(viewport: (typeof WIDTHS)[number]): Promise<BrowserContext> {
  const context = await browser!.newContext({ viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.phone, hasTouch: viewport.phone, serviceWorkers: "block", reducedMotion: "reduce" });
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
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
  // The gate's translating route, relayed: each reading comes after a moment, so the place under the original is seen
  // waiting first.
  await context.route(/\/api\/gate\/translations$/, async (route) => {
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
    test(`every report stands whole with its translation under it, each text asked once, ${viewport.width}px wide`, async () => {
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

        // Under each original its reading lands, headed by the language it is in; the original stays.
        const reading = closing.locator("[data-reading]");

        await until(async () => await reading.innerText(), (text) => text.includes("ko-reading: The skill is committed and pushed."));
        expect(await reading.innerText()).toContain(wording("documents.label.translation_of", { language: wording("documents.label.language_ko") }));
        expect(await reading.innerText()).toContain("ko-reading: The skill is committed and pushed.");
        expect(await closing.innerText()).toContain("The skill is committed and pushed.");
        await until(async () => await dialog.locator("[data-report]").nth(1).locator("[data-reading]").innerText(), (text) => text.includes(`ko-reading: ${PROGRESS}`));

        // The instruction tab stands the brief in its original with its reading under it.
        await dialog.getByRole("tab", { name: wording("todo.label.field_instruction") }).first().click();

        const brief = dialog.locator("[data-reading]").filter({ hasText: `ko-reading: ${BRIEF}` });

        expect(await until(async () => await brief.count(), (n) => n === 1)).toBe(1);
        expect(await dialog.getByText(BRIEF, { exact: true }).count()).toBeGreaterThanOrEqual(1);

        // Closed and opened again in the same tab, nothing is asked again: every text was asked for once. (A tab opened
        // afresh asks the gate again, which answers what it keeps without its translator.)
        await page.keyboard.press("Escape");
        const itemDialogs = page.getByRole("dialog").filter({ has: page.getByRole("tab", { name: wording("todo.label.field_instruction") }) });

        expect(await until(async () => await itemDialogs.count(), (n) => n === 0)).toBe(0);
        await page.evaluate(async (id) => {
          const root = document.querySelector("#__nuxt") as unknown as { __vue_app__: { config: { globalProperties: { $router: { push: (to: object) => Promise<unknown> } } } } };

          await root.__vue_app__.config.globalProperties.$router.push({ query: {} });
          await root.__vue_app__.config.globalProperties.$router.push({ query: { todo: String(id) } });
        }, ITEM);
        // The same item opened again keeps the tab being read, and its reading stands at once, from what the tab kept.
        const again = itemDialogs.last();

        await again.locator("[data-reading]").filter({ hasText: `ko-reading: ${BRIEF}` }).waitFor({ timeout: 20_000 });
        await again.getByRole("tab", { name: wording("todo.label.result") }).first().click();
        expect(await again.locator("[data-report] [data-reading]").first().innerText()).toContain("ko-reading:");
        await Bun.sleep(800);

        const once = new Set(asked);

        expect(asked.length).toBe(once.size);
        expect([...once].sort()).toEqual([BRIEF, FINAL, PROGRESS].sort());

        // The sentence that said a work order's translation cannot be had is gone.
        expect(await page.getByText(KO.unavailable).count()).toBe(0);
      } finally {
        await context.close();
      }
    }, 90_000);
  }

  test("an approval stands with its caller and kind, and a recommendation apart from it, waiting on the owner", async () => {
    const context = await open(WIDTHS[0]);

    try {
      await context.route(new RegExp(`/api/todos/${ITEM}/approvals$`), (route) =>
        route.fulfill({ json: [{ id: 2, kind: "approval", caller: "ahas", at: NOW - 60 }, { id: 1, kind: "recommendation", caller: "chat", at: NOW - 120 }] })
      );
      await context.route(/\/api\/todos(\?|$)/, async (route) => {
        if (route.request().method() !== "GET") return await route.continue();

        const board = (await (await route.fetch()).json()) as TodoBoard;
        const waiting = { ...item(), id: 2252, title: "recommended-title", done: false, status: "open", approved: false, recommended: true, reports: [] };

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
