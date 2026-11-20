import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, centreOf, openTouch, touchReady } from "./touch";

import type { Browser, BrowserContext, Page } from "playwright-core";
import type { TodoBoard, TodoItem } from "../../apps/web/shared/types";

// An item names one agent, or a model and a role whose free agent takes it at the launch (docs/web.md, the TODO
// panel's section). Read off the page: the line of an item assigned by a model names its role's free agent, with
// the shared tooltip saying who takes it, by a resting pointer at 1280 pixels and a resting finger on a phone; the
// line of one launched names the agent its job took; one naming an agent too names that agent. The detail offers
// under each role the models its agents run and saves a pick as the verb it stands for, and the console's own route
// refuses a model no agent of the role runs, against the agency's stand-in listing.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up, whose
// agency stand-in lists `worker-01` to `worker-03` on claude-opus-5-5 and `builder-01` to `builder-08` on
// claude-sonnet-5, and serves the board through the page's own route.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "todo-assign", password: "fixture-password-2765" };
const NOW = Math.floor(Date.now() / 1000);

const MODEL = "claude-opus-5-5";
const ROLE = "worker";

function item(id: number, over: Partial<TodoItem>): TodoItem {
  return {
    id, title: `item-${id}`, instruction: `item-${id}`, requester: "Owner", requesterId: 42, chatId: 42,
    approved: true, awaitingApproval: false, recommended: false, done: false, running: false, worker: "bmo-a",
    priority: 1, status: "waiting", model: null, role: null, agent: null, jobAgent: null, ranOn: null, note: null,
    reports: [], unfinished: null, rejections: 0, unfinishedResolvedAt: null, unfinishedResolution: null,
    heldAt: null, heldReason: null, heldKind: null, noticesOff: null, mergedInto: null, mergedAt: null, mergedIntoTitle: null,
    mergedFrom: [], attempts: 0, progress: null, stopped: null, holding: null, waiting: null, deployWaits: false,
    closing: null, deployHeld: false, holdPending: false, orderActive: false, seconds: null, spans: [],
    createdAt: NOW - 120, doneAt: null,
    ...over
  };
}

// Assigned by a model and not launched; the same, launched on the agent its job took; and one naming an agent besides.
const FREE = item(1, { model: MODEL, role: ROLE });
const LAUNCHED = item(2, { model: MODEL, role: ROLE, running: true, liveState: "running", status: "running", attempts: 1, jobAgent: "worker-02" });
const NAMED = item(3, { model: MODEL, role: ROLE, agent: "builder-01" });

const FREE_LABEL = wording("todo.label.assign_free", { role: ROLE });
const FREE_TIP = wording("todo.label.assign_free_tip", { role: ROLE, model: MODEL });

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

// The board served with the three rows, and every verb the page sends recorded and answered as done.
async function serve(context: BrowserContext, sent: unknown[]): Promise<void> {
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
  await context.route(/\/api\/todos(\?|$)/, async (route) => {
    if (route.request().method() === "POST") {
      sent.push(route.request().postDataJSON());

      return await route.fulfill({ json: { ok: true } });
    }

    const board = (await (await route.fetch()).json()) as TodoBoard;

    await route.fulfill({
      json: { ...board, pending: [], queue: [FREE, LAUNCHED, NAMED], held: [], merged: [], done: [], standing: { ...board.standing, queue: 3, running: 1, waiting: 0 } }
    });
  });
  await context.route(/\/api\/todos\/\d+\/work-order$/, (route) => route.fulfill({ status: 204, body: "" }));
}

// The TODO panel's rows, beside the page or behind the drawer its top bar opens.
async function rows(page: Page): Promise<void> {
  const row = page.locator(`li[data-todo-id="${FREE.id}"]:visible`).first();
  const opener = page.getByRole("button", { name: wording("todo.action.open_todo") });

  await row.or(opener).first().waitFor({ timeout: 30_000 });

  if (!(await row.isVisible())) {
    await opener.click();
    await row.waitFor({ timeout: 5_000 });
  }
}

// Whom each row names, and the free chip standing whole inside the viewport once a drawer has come to rest.
async function readRows(page: Page): Promise<void> {
  const free = page.locator(`li[data-todo-id="${FREE.id}"] [data-item-agent-free]:visible`).first();

  await free.waitFor({ timeout: 10_000 });
  expect((await free.innerText()).trim()).toBe(FREE_LABEL);
  await free.evaluate(
    (el) =>
      new Promise<void>((resolve, reject) => {
        const until = performance.now() + 5_000;
        const look = (): void => {
          const box = el.getBoundingClientRect();

          if (box.left >= 0 && box.right <= window.innerWidth) resolve();
          else if (performance.now() > until) reject(new Error(`the chip stands at ${box.left}..${box.right} of ${window.innerWidth}`));
          else requestAnimationFrame(look);
        };

        look();
      })
  );
  expect(await page.locator(`li[data-todo-id="${FREE.id}"] [data-item-model]:visible`).count()).toBe(1);

  // Chips standing side by side are one tier, one height and one padding: the free chip measured against the model chip.
  const shape = async (selector: string): Promise<string[]> =>
    await page.locator(`li[data-todo-id="${FREE.id}"] ${selector}:visible`).first().evaluate((el) => {
      const style = getComputedStyle(el);

      return [String(el.getBoundingClientRect().height), style.borderRadius, style.paddingLeft, style.paddingTop, style.fontSize];
    });

  expect(await shape("[data-item-agent-free]")).toEqual(await shape("[data-item-model]"));

  for (const [id, agent] of [[LAUNCHED.id, "worker-02"], [NAMED.id, "builder-01"]] as const) {
    expect((await page.locator(`li[data-todo-id="${id}"] [data-item-agent-named]:visible`).first().innerText()).trim()).toBe(agent);
    expect(await page.locator(`li[data-todo-id="${id}"] [data-item-agent-free]`).count()).toBe(0);
  }
}

// A bounded wait for the page to have sent so many verbs.
async function sentCount(sent: unknown[], count: number): Promise<void> {
  const until = Date.now() + 5_000;

  while (sent.length < count && Date.now() < until) await Bun.sleep(50);
  expect(sent.length).toBe(count);
}

function tooltip(page: Page): ReturnType<Page["locator"]> {
  return page.locator("[data-reka-popper-content-wrapper]").filter({ hasText: FREE_TIP.split("\n")[0]! }).first();
}

describe.skipIf(!origin || !touchReady())("an item assigned by a model and a role", () => {
  test("the rows name the role's free agent, the agent a launch took and the agent named, at 1280px", async () => {
    const context = await browser!.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block", reducedMotion: "reduce" });

    try {
      await serve(context, []);

      const page = await context.newPage();

      await page.goto(`${origin}/`, { waitUntil: "load" });
      await rows(page);
      await readRows(page);

      // A resting pointer reads who takes it.
      await page.locator(`li[data-todo-id="${FREE.id}"] [data-item-agent-free]:visible`).first().hover();
      await tooltip(page).waitFor({ timeout: 5_000 });
    } finally {
      // A poll of the board still in flight would otherwise fail on a closed context.
      await context.unrouteAll({ behavior: "ignoreErrors" });
      await context.close();
    }
  }, 120_000);

  test("on a phone the rows read the same, and a resting finger reads who takes it without opening the item", async () => {
    const touch = await openTouch({ device: "Galaxy S24", reducedMotion: "reduce" });

    try {
      await serve(touch.context, []);
      await touch.page.goto(`${origin}/`, { waitUntil: "load" });
      await rows(touch.page);
      await readRows(touch.page);

      await touch.press(await centreOf(touch.page, `li[data-todo-id="${FREE.id}"] [data-item-agent-free]:visible`));
      await tooltip(touch.page).waitFor({ timeout: 5_000 });
      // The finger lifting pressed nothing: the item's detail, which a press on the row opens, stands nowhere.
      expect(new URL(touch.page.url()).searchParams.get("todo")).toBeNull();
      expect(await touch.page.locator("[data-item-agent]:visible").count()).toBe(0);
    } finally {
      await touch.context.unrouteAll({ behavior: "ignoreErrors" });
      await touch.close();
    }
  }, 120_000);

  test("the detail offers the models each role's agents run and saves a pick as the verb it stands for", async () => {
    const context = await browser!.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block", reducedMotion: "reduce" });
    const sent: unknown[] = [];

    try {
      await serve(context, sent);

      const page = await context.newPage();

      await page.goto(`${origin}/?todo=${FREE.id}`, { waitUntil: "load" });

      const chooser = page.locator('[role="dialog"] [data-item-agent]:visible').first();

      await chooser.waitFor({ timeout: 30_000 });
      expect((await chooser.innerText()).trim()).toBe(wording("todo.label.assign_model", { role: ROLE, model: MODEL }));

      await chooser.click();

      const other = page.getByRole("option").filter({ hasText: wording("todo.label.assign_model", { role: "builder", model: "claude-sonnet-5" }) }).first();

      await other.waitFor({ timeout: 10_000 });
      // Each model once under its role, the agents running it named beside it.
      expect(await page.getByRole("option").filter({ hasText: wording("todo.label.assign_model", { role: ROLE, model: MODEL }) }).count()).toBe(1);
      expect(await page.getByRole("option").filter({ hasText: "worker-01, worker-02, worker-03" }).count()).toBe(1);
      await other.click();
      await sentCount(sent, 1);
      expect(sent[0]).toEqual({ action: "model", id: FREE.id, model: "claude-sonnet-5", role: "builder" });

      await chooser.click();
      // An option is named by all it shows, so the agent is found by its own label rather than inside a model's line of agents.
      await page.getByRole("option").filter({ has: page.getByText("worker-03", { exact: true }) }).first().click();
      await sentCount(sent, 2);
      expect(sent[1]).toEqual({ action: "agent", id: FREE.id, agent: "worker-03" });
    } finally {
      // A poll of the board still in flight would otherwise fail on a closed context.
      await context.unrouteAll({ behavior: "ignoreErrors" });
      await context.close();
    }
  }, 120_000);

  test("the console's route refuses a model no agent of the role runs, naming the role's agents and models", async () => {
    const answer = await fetch(`${origin}/api/todos`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ action: "model", id: FREE.id, model: "claude-sonnet-5", role: ROLE })
    });
    const body = (await answer.json()) as { message?: string; statusMessage?: string };

    expect(answer.status).toBe(422);
    expect(`${body.message ?? body.statusMessage}`).toContain("worker-01 (claude-opus-5-5)");
  }, 30_000);
});
