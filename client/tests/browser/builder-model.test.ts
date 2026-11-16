import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";

import type { Browser } from "playwright-core";
import type { ProviderView } from "../../apps/web/shared/axes";
import type { TodoBoard, TodoItem } from "../../apps/web/shared/types";

// A work order's builder model (docs/web.md, the TODO detail's work order): its provider list is the automatic choice and then every
// provider the agency's providers read lists whose program carries the line a job runs on, in that order and under its
// word, a provider turned off standing disabled; nothing of it is read off the fallback, which answers the Claude
// accounts alone. It drives the console tests/support/browser-console.ts stands up, serving the providers and the item
// through the page's own routes; the suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "builder-model", password: "fixture-password-2926" };
const ITEM = 2926;
const NOW = Math.floor(Date.now() / 1000);

const provider = (name: string, label: string, lines: string[], enabled = true): ProviderView => ({
  name, label, enabled, registered: false, lines, quota: null, reason: null, reasonEnglish: null, foldRatioDefault: null, keyFile: null, ownersEngine: true
});
// One provider on the job line, one turned off on it, and one whose program carries another line alone.
const PROVIDERS = [provider("provider-a", "Provider A", ["chat", "worker"]), provider("provider-b", "Provider B", ["worker"], false), provider("provider-c", "Provider C", ["search"])];

function item(): TodoItem {
  return {
    id: ITEM, title: "item-title", instruction: "item-instruction", requester: "Owner", requesterId: null, chatId: null, approved: false, awaitingApproval: true, recommended: false, done: false,
    running: false, worker: null, priority: 1, status: "waiting", model: null, agent: null, ranOn: null, note: null, reports: [], unfinished: null,
    rejections: 0,
    unfinishedResolvedAt: null, unfinishedResolution: null, heldAt: null, heldReason: null, heldKind: null,
    mergedInto: null, mergedAt: null, mergedIntoTitle: null, mergedFrom: [], attempts: 0, progress: null, stopped: null, holding: null, waiting: null,
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

describe.skipIf(!origin || !touchReady())("a work order's builder model", () => {
  test("offers the automatic choice and the providers carrying the job line, a turned-off one disabled, and reads nothing of the fallback", async () => {
    const context = await browser!.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block", reducedMotion: "reduce" });
    const at = cookie.indexOf("=");
    const asked: string[] = [];

    await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
    context.on("request", (request) => asked.push(new URL(request.url()).pathname));
    await context.route(/\/api\/providers$/, (route) => route.fulfill({ json: PROVIDERS }));
    await context.route(/\/api\/todos(\?|$)/, async (route) => {
      if (route.request().method() !== "GET") return await route.continue();

      const board = (await (await route.fetch()).json()) as TodoBoard;

      await route.fulfill({ json: { ...board, queue: [item()] } });
    });
    await context.route(new RegExp(`/api/todos/${ITEM}$`), (route) => route.fulfill({ json: item() }));
    await context.route(new RegExp(`/api/todos/${ITEM}/(notes|approvals|reports)$`), (route) => route.fulfill({ json: [] }));
    await context.route(new RegExp(`/api/todos/${ITEM}/talk$`), (route) => route.fulfill({ json: { turns: [], answering: false, unanswered: null } }));
    await context.route(new RegExp(`/api/todos/${ITEM}/work-order$`), (route) => route.fulfill({ json: null }));

    try {
      const page = await context.newPage();
      const dialog = page.getByRole("dialog").filter({ hasText: "item-title" }).last();
      const chooser = dialog.getByRole("combobox", { name: wording("agents.aria.provider_of", { name: wording("todo.label.builder_model") }), exact: true });

      await page.goto(`${origin}/?todo=${ITEM}`, { waitUntil: "load" });
      await dialog.waitFor({ timeout: 20_000 });
      await dialog.getByRole("tab", { name: wording("todo.label.field_instruction") }).first().click();
      await chooser.waitFor({ timeout: 15_000 });
      await chooser.click();

      const options = page.getByRole("option");

      await options.first().waitFor({ timeout: 10_000 });
      expect((await options.allInnerTexts()).map((one) => one.trim())).toEqual([wording("common.label.auto"), "Provider A", "Provider B"]);
      expect(await options.evaluateAll((all) => all.map((one) => one.getAttribute("aria-disabled") === "true" || one.hasAttribute("data-disabled")))).toEqual([false, false, true]);
      expect(asked.some((path) => path.endsWith("/api/providers"))).toBe(true);
      expect(asked.filter((path) => path.includes("/api/fallback"))).toEqual([]);
    } finally {
      await context.close();
    }
  }, 60_000);
});
