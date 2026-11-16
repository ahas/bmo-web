import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, BrowserContext, Page } from "playwright-core";
import type { TodoBoard, TodoItem } from "../../apps/web/shared/types";

// A TODO row's acts follow the item's state in bmo-job, on its menu and in the opened item alike: a row in the queue
// offers the hold, and once held it offers the hold's release in its place, whether or not a report says why it was
// held; the release puts it back in the queue, where it offers the hold again (docs/web.md, the TODO panel's section). Neither press is
// restated by a notice: the row's own place says it went through. A press that is refused says so in the message
// pill, which goes on its own time (docs/web.md, 「Messages」). Each look — a desk and a phone width, the light and the
// dark theme — walks the whole of it.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up, and
// serves the board and the row's acts through the page's own routes: the held item comes back as bmo-job's
// `held` with no report, which is what a hold given no reason leaves.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "todo-hold", password: "fixture-password-3236" };
const NOW = Math.floor(Date.now() / 1000);
const ROW = 2;
// Longer than the longest time any tone of the pill stands.
const PILL_PAST_MS = 10_000;

const LOOKS = [
  { name: "desk light", viewport: { width: 1500, height: 950 }, scheme: "light" },
  { name: "desk dark", viewport: { width: 1500, height: 950 }, scheme: "dark" },
  { name: "phone light", viewport: { width: 384, height: 832 }, scheme: "light" },
  { name: "phone dark", viewport: { width: 384, height: 832 }, scheme: "dark" }
] as const;

// An approved row in the queue, or the same row as bmo-job holds it.
function item(id: number, held: boolean): TodoItem {
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
    done: false,
    running: false,
    liveState: null,
    worker: null,
    priority: id,
    status: held ? "held" : "open",
    model: null,
    agent: null,
    ranOn: null,
    note: null,
    reports: [],
    unfinished: null,
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
    attempts: 0,
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
    doneAt: null
  };
}

// What the routes stand for bmo-job: which rows are held, the acts asked, and whether the next act is refused.
interface Job {
  held: Set<number>;
  acts: string[];
  refuse: boolean;
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

async function open(look: (typeof LOOKS)[number], job: Job): Promise<BrowserContext> {
  const context = await browser!.newContext({ viewport: look.viewport, colorScheme: look.scheme, serviceWorkers: "block", reducedMotion: "reduce" });
  const at = cookie.indexOf("=");

  await context.addCookies([
    { name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! },
    { name: "nuxt-color-mode", value: look.scheme, url: origin! }
  ]);
  await context.route(/\/api\/todos(\?|$)/, async (route) => {
    if (route.request().method() === "POST") {
      const { action, id } = route.request().postDataJSON() as { action: string; id: number };

      job.acts.push(action);

      if (job.refuse) {
        job.refuse = false;

        return await route.fulfill({ status: 409, json: { statusCode: 409, statusMessage: "Conflict", message: "refused-by-test" } });
      }

      if (action === "hold") job.held.add(id);
      if (action === "release") job.held.delete(id);

      return await route.fulfill({ json: { ok: true } });
    }

    const board = (await (await route.fetch()).json()) as TodoBoard;
    const rows = [1, ROW, 3].map((id) => item(id, job.held.has(id)));
    const queue = rows.filter((row) => row.status !== "held");
    const held = rows.filter((row) => row.status === "held");

    await route.fulfill({
      json: { ...board, queue, held, pending: [], standing: { ...board.standing, queue: queue.length, running: 0, held: held.length, pending: 0 } }
    });
  });

  return context;
}

// The list, where the panel stands open beside the page, or behind the drawer's button where it does not.
async function showList(page: Page): Promise<void> {
  const row = page.locator('li[data-todo-id="1"]:visible').first();
  const opener = page.getByRole("button", { name: wording("todo.action.open_todo") });

  await row.or(opener).first().waitFor({ timeout: 30_000 });

  if (!(await row.isVisible())) {
    await opener.click();
    await row.waitFor({ timeout: 10_000 });
  }
}

// The state tab of that name, among the panel's filter tabs, whose names carry their counts after them.
async function chooseTab(page: Page, label: string): Promise<void> {
  await page.getByRole("tab", { name: new RegExp(`^${label}`) }).filter({ visible: true }).first().click();
}

function rowOf(page: Page, id: number) {
  return page.locator(`li[data-todo-id="${id}"]:visible`).first();
}

// The acts the row's menu offers, the menu left open for a press on one of them.
async function menuOf(page: Page, id: number): Promise<string[]> {
  const row = rowOf(page, id);

  await row.scrollIntoViewIfNeeded();
  await row.click({ button: "right" });
  await page.getByRole("menuitem").first().waitFor({ timeout: 10_000 });

  return (await page.getByRole("menuitem").allInnerTexts()).map((text) => text.trim());
}

async function closeMenu(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  await page.locator('[role="menu"]').waitFor({ state: "detached", timeout: 10_000 });
}

// Two frames after the page settled, where a notice raised as the press came back would already stand.
async function settle(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
}

const pill = (page: Page) => page.locator(".bmo-island");

// Anything on the screen naming the row by its number, once the row itself has left the list: a line saying what was
// just done to it, in the pill or anywhere else.
async function namedAfterRowLeft(page: Page, id: number): Promise<number> {
  return await page.getByText(new RegExp(`#${id}(?!\\d)`)).filter({ visible: true }).count();
}

describe.skipIf(!origin || !touchReady())("a TODO row's hold and its release", () => {
  for (const look of LOOKS) {
    test(`follow the item's state on its menu and in the opened item, ${look.name}`, async () => {
      const job: Job = { held: new Set(), acts: [], refuse: false };
      const context = await open(look, job);
      const hold = wording("todo.action.hold");
      const release = wording("todo.action.unhold");

      try {
        const page = await context.newPage();

        await page.clock.install();
        await page.goto(`${origin}/`, { waitUntil: "load" });
        await showList(page);

        // In the queue: the hold, never its release.
        let acts = await menuOf(page, ROW);

        expect(acts).toContain(hold);
        expect(acts).not.toContain(release);

        await page.getByRole("menuitem", { name: hold }).click();
        // Held rows are not seen under the all tab, so the row leaving it is the hold come back.
        await rowOf(page, ROW).waitFor({ state: "detached", timeout: 10_000 });
        await settle(page);
        expect(job.acts).toEqual(["hold"]);
        expect(await pill(page).count()).toBe(0);
        expect(await namedAfterRowLeft(page, ROW)).toBe(0);

        // Held with no report: the release in the hold's place.
        await chooseTab(page, wording("todo.label.state_held"));
        await rowOf(page, ROW).waitFor({ timeout: 10_000 });
        // Its own state mark is what says the hold went through.
        expect(await rowOf(page, ROW).getByText(wording("todo.label.held_plain"), { exact: true }).isVisible()).toBe(true);
        acts = await menuOf(page, ROW);
        expect(acts).toContain(release);
        expect(acts).not.toContain(hold);
        await closeMenu(page);

        // The opened item offers the same: the release and no hold.
        // A press on the row is taken by its title.
        await rowOf(page, ROW).getByRole("button").first().click();
        await page.getByRole("tab", { name: wording("todo.label.manage") }).filter({ visible: true }).first().click();

        const releaseButton = page.getByRole("button", { name: release }).filter({ visible: true });

        await releaseButton.first().waitFor({ timeout: 10_000 });
        expect(await page.getByRole("button", { name: hold, exact: true }).filter({ visible: true }).count()).toBe(0);
        await page.keyboard.press("Escape");
        await releaseButton.first().waitFor({ state: "hidden", timeout: 10_000 });

        // The release puts it back in the queue, unannounced, where it offers the hold again.
        await menuOf(page, ROW);
        await page.getByRole("menuitem", { name: release }).click();
        await rowOf(page, ROW).waitFor({ state: "detached", timeout: 10_000 });
        await settle(page);
        expect(job.acts).toEqual(["hold", "release"]);
        expect(await pill(page).count()).toBe(0);
        expect(await namedAfterRowLeft(page, ROW)).toBe(0);

        await chooseTab(page, wording("common.label.all"));
        await rowOf(page, ROW).waitFor({ timeout: 10_000 });
        acts = await menuOf(page, ROW);
        expect(acts).toContain(hold);
        expect(acts).not.toContain(release);

        // A refused press is said in the pill, and the pill goes on its own time.
        job.refuse = true;
        await page.getByRole("menuitem", { name: hold }).click();
        await pill(page).waitFor({ timeout: 10_000 });
        expect(await rowOf(page, ROW).isVisible()).toBe(true);
        await page.clock.fastForward(PILL_PAST_MS);
        await pill(page).waitFor({ state: "detached", timeout: 10_000 });
      } finally {
        await context.close();
      }
    }, 120_000);
  }
});
