import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, fingerOn, touchReady } from "./touch";

import type { Browser, BrowserContext, Page } from "playwright-core";
import type { TodoBoard, TodoItem } from "../../apps/web/shared/types";

declare global {
  interface Window {
    // The box a watched element stood in at the last frame, written by the probe that waits for it to stop moving.
    lastBox?: string;
  }
}

// A TODO row's acts follow the item's state in bmo-job, on its menu and in the opened item alike: a row in the queue
// offers the hold, and once held it offers the hold's release in its place; the release puts it back in the queue,
// where it offers the hold again (docs/web.md, the TODO panel's section). A hold carries its reason: the menu's hold
// asks for it in a dialog and the opened item's hold button waits for it, and the held row says it under its title.
// An item's job notices are switched off from the opened item only with a reason, which the row and the opened item
// then show, and switched back on there. Neither press is restated by a notice: the row's own place says it went
// through. A hold, a stop or a switch of the notices that is refused says so where it was sent from, under its box,
// and the hold's dialog asks before its words are thrown away (docs/web.md, 「Messages」 and 「Forms」). Each look — a desk and a phone width, the light and the dark
// theme — walks the whole of it.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up, and
// serves the board and the row's acts through the page's own routes.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "todo-hold", password: "fixture-password-3236" };
const NOW = Math.floor(Date.now() / 1000);
const ROW = 2;

const LOOKS = [
  { name: "desk light", viewport: { width: 1280, height: 800 }, scheme: "light" },
  { name: "desk dark", viewport: { width: 1280, height: 800 }, scheme: "dark" },
  { name: "phone light", viewport: { width: 360, height: 780 }, scheme: "light" },
  { name: "phone dark", viewport: { width: 360, height: 780 }, scheme: "dark" }
] as const;

// An approved row in the queue, or the same row as bmo-job holds it: a plain hold with its reason, or the owner's stop
// whose run is still ending; and its job notices, switched off with their reason or on.
function item(
  id: number,
  held: boolean,
  stopping = false,
  heldReason: string | null = null,
  noticesOff: string | null = null,
  running = stopping
): TodoItem {
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
    running,
    liveState: running ? "running" : null,
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
    heldAt: heldReason === null ? null : NOW - 60,
    heldReason,
    heldKind: stopping ? "stop" : null,
    noticesOff: noticesOff === null ? null : { reason: noticesOff, at: NOW - 30 },
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
    holdPending: stopping,
    orderActive: false,
    seconds: null,
    spans: [],
    createdAt: NOW - 120,
    doneAt: null
  };
}

// What the routes stand for bmo-job: which rows are held and which of those are stops still ending, the reasons held
// rows and switched-off notices carry, the acts asked with the reason each sent, and whether the next act is refused.
interface Job {
  running: Set<number>;
  held: Set<number>;
  stopping: Set<number>;
  reasons: Map<number, string>;
  noticesOff: Map<number, string>;
  acts: string[];
  whys: (string | undefined)[];
  refuse: boolean;
}

const fresh = (held: number[] = [], stopping: number[] = [], running: number[] = []): Job => ({
  running: new Set(running),
  held: new Set(held),
  stopping: new Set(stopping),
  reasons: new Map(),
  noticesOff: new Map(),
  acts: [],
  whys: [],
  refuse: false
});

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

async function open(look: (typeof LOOKS)[number], job: Job, touch = false): Promise<BrowserContext> {
  const context = await browser!.newContext({
    viewport: look.viewport,
    colorScheme: look.scheme,
    serviceWorkers: "block",
    reducedMotion: "reduce",
    hasTouch: touch,
    isMobile: touch
  });
  const at = cookie.indexOf("=");

  await context.addCookies([
    { name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! },
    { name: "nuxt-color-mode", value: look.scheme, url: origin! }
  ]);
  await context.route(/\/api\/todos(\?|$)/, async (route) => {
    if (route.request().method() === "POST") {
      const { action, id, why } = route.request().postDataJSON() as { action: string; id: number; why?: string };

      job.acts.push(action);
      job.whys.push(why);

      if (job.refuse) {
        job.refuse = false;

        return await route.fulfill({ status: 409, json: { statusCode: 409, statusMessage: "Conflict", message: "refused-by-test" } });
      }

      if (action === "hold") {
        job.held.add(id);
        job.reasons.set(id, why ?? "");
      }

      if (action === "release") {
        job.held.delete(id);
        job.stopping.delete(id);
        job.reasons.delete(id);
      }

      if (action === "notices_off") job.noticesOff.set(id, why ?? "");
      if (action === "notices_on") job.noticesOff.delete(id);

      return await route.fulfill({ json: { ok: true } });
    }

    const board = (await (await route.fetch()).json()) as TodoBoard;
    const rows = [1, ROW, 3].map((id) => item(id, job.held.has(id), job.stopping.has(id), job.reasons.get(id) ?? null, job.noticesOff.get(id) ?? null, job.stopping.has(id) || job.running.has(id)));
    // A stop whose run still ends stands in the queue until the run has ended, as the board hands it over.
    const queue = rows.filter((row) => row.status !== "held" || row.holdPending);
    const held = rows.filter((row) => row.status === "held" && !row.holdPending);

    await route.fulfill({
      json: { ...board, queue, held, pending: [], standing: { ...board.standing, queue: queue.length, running: 0, held: held.length, pending: 0 } }
    });
  });

  return context;
}

// The list, where the panel stands open beside the page, or behind the drawer's button where it does not. The server's
// page draws neither, so the list is looked for once the app stands, which a loaded machine's development server takes
// its time over.
async function showList(page: Page): Promise<void> {
  const row = page.locator('li[data-todo-id="1"]:visible').first();
  const opener = page.getByRole("button", { name: wording("todo.action.open_todo") });

  await page.waitForFunction(() => {
    const root: (Element & { __vue_app__?: { $nuxt?: { isHydrating?: boolean } } }) | null = document.querySelector("#__nuxt");

    return root?.__vue_app__?.$nuxt?.isHydrating === false;
  }, undefined, { timeout: 60_000 });
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

// Where an element stands once it has stopped moving: the same box two frames running. A finger that lands while the
// list still slides in under it is a finger on a moving list, which the console reads as a scroll, never a hold.
async function steadyBox(page: Page, selector: string): Promise<{ x: number; y: number; width: number; height: number }> {
  const handle = await page.waitForFunction((css) => {
    const shown = [...document.querySelectorAll<HTMLElement>(css)].find((one) => one.offsetParent !== null);

    if (shown === undefined) return false;

    const now = shown.getBoundingClientRect();
    const box = { x: now.x, y: now.y, width: now.width, height: now.height };
    const was = window.lastBox;

    window.lastBox = JSON.stringify(box);

    return was === JSON.stringify(box) ? box : false;
  }, selector, { polling: "raf", timeout: 10_000 });

  return (await handle.jsonValue()) as { x: number; y: number; width: number; height: number };
}

// Anything on the screen naming the row by its number, once the row itself has left the list: a line saying what was
// just done to it, in the pill or anywhere else.
async function namedAfterRowLeft(page: Page, id: number): Promise<number> {
  return await page.getByText(new RegExp(`#${id}(?!\\d)`)).filter({ visible: true }).count();
}

// The menu's hold dialog, and its reason box and hold button.
function holdDialog(page: Page) {
  const dialog = page.getByRole("dialog").filter({ has: page.locator("[data-row-hold]") });

  return {
    dialog,
    box: dialog.getByRole("textbox", { name: wording("todo.label.hold_reason") }),
    button: dialog.getByRole("button", { name: wording("todo.action.hold"), exact: true })
  };
}

// The opened row's manage group, the row opened by a press on its title.
async function openManage(page: Page, id: number): Promise<void> {
  await rowOf(page, id).getByRole("button").first().click();
  await page.getByRole("tab", { name: wording("todo.label.manage") }).filter({ visible: true }).first().click();
}

// The opened item's closing, waiting for the element given to leave with it.
async function closeOpened(page: Page, gone: ReturnType<Page["locator"]>): Promise<void> {
  await page.keyboard.press("Escape");
  await gone.waitFor({ state: "hidden", timeout: 10_000 });
}

describe.skipIf(!origin || !touchReady())("a TODO row's hold and its release", () => {
  for (const look of LOOKS) {
    test(`follow the item's state on its menu and in the opened item, ${look.name}`, async () => {
      const job = fresh();
      const context = await open(look, job);
      const hold = wording("todo.action.hold");
      const release = wording("todo.action.unhold");

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/`, { waitUntil: "load" });
        await showList(page);

        // In the queue: the hold, never its release.
        let acts = await menuOf(page, ROW);

        expect(acts).toContain(hold);
        expect(acts).not.toContain(release);

        // The hold asks its reason first: its button waits for one, and the dialog closed untouched sends nothing.
        await page.getByRole("menuitem", { name: hold }).click();

        let asked = holdDialog(page);

        await asked.box.waitFor({ timeout: 10_000 });
        expect(await asked.button.isDisabled()).toBe(true);
        await page.keyboard.press("Escape");
        await asked.dialog.waitFor({ state: "detached", timeout: 10_000 });
        expect(job.acts).toEqual([]);

        await menuOf(page, ROW);
        await page.getByRole("menuitem", { name: hold }).click();
        asked = holdDialog(page);
        await asked.box.fill("  not this week  ");
        expect(await asked.button.isEnabled()).toBe(true);
        await asked.button.click();
        // Held rows are not seen under the all tab, so the row leaving it is the hold come back.
        await rowOf(page, ROW).waitFor({ state: "detached", timeout: 10_000 });
        await asked.dialog.waitFor({ state: "detached", timeout: 10_000 });
        await settle(page);
        expect(job.acts).toEqual(["hold"]);
        expect(job.whys).toEqual(["not this week"]);
        expect(await pill(page).count()).toBe(0);
        expect(await namedAfterRowLeft(page, ROW)).toBe(0);

        // Held: the release in the hold's place, and the reason under the row's title.
        await chooseTab(page, wording("todo.label.state_held"));
        await rowOf(page, ROW).waitFor({ timeout: 10_000 });
        // Its own state mark is what says the hold went through.
        expect(await rowOf(page, ROW).getByText(wording("todo.label.held_plain"), { exact: true }).isVisible()).toBe(true);
        // The row's lines unfold as they come, so the reason is waited for until it is drawn.
        await rowOf(page, ROW).locator("[data-item-held]").getByText(/not this week/).waitFor({ timeout: 10_000 });
        acts = await menuOf(page, ROW);
        expect(acts).toContain(release);
        expect(acts).not.toContain(hold);
        await closeMenu(page);

        // The opened item offers the same: the release beside the hold's reason, and no hold.
        await openManage(page, ROW);

        const releaseButton = page.getByRole("button", { name: release }).filter({ visible: true });

        await releaseButton.first().waitFor({ timeout: 10_000 });
        expect(await page.getByRole("button", { name: hold, exact: true }).filter({ visible: true }).count()).toBe(0);
        expect(await page.getByText(/not this week/).filter({ visible: true }).count()).toBeGreaterThan(1);
        await closeOpened(page, releaseButton.first());

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
        await closeMenu(page);

        // The opened item's hold waits for its reason the same way, and sends it.
        await openManage(page, ROW);

        const holdBox = page.getByRole("textbox", { name: wording("todo.label.hold_reason") }).filter({ visible: true }).first();
        const holdButton = page.getByRole("button", { name: hold, exact: true }).filter({ visible: true }).first();

        await holdBox.waitFor({ timeout: 10_000 });
        expect(await holdButton.isDisabled()).toBe(true);
        await holdBox.fill("waiting on a decision");
        expect(await holdButton.isEnabled()).toBe(true);
        await holdButton.click();
        await releaseButton.first().waitFor({ timeout: 10_000 });
        expect(job.acts).toEqual(["hold", "release", "hold"]);
        expect(job.whys.at(-1)).toBe("waiting on a decision");
        await releaseButton.first().click();
        await holdButton.waitFor({ timeout: 10_000 });
        await closeOpened(page, holdButton);
        expect(job.acts).toEqual(["hold", "release", "hold", "release"]);

        // A refused hold is said in the dialog under its box, never in the pill, and the reason written stays.
        await rowOf(page, ROW).waitFor({ timeout: 10_000 });
        await menuOf(page, ROW);
        await page.getByRole("menuitem", { name: hold }).click();
        asked = holdDialog(page);
        await asked.box.fill("later");
        job.refuse = true;
        await asked.button.click();
        await asked.dialog.getByRole("alert").waitFor({ timeout: 10_000 });
        await settle(page);
        expect(await pill(page).count()).toBe(0);
        expect(await asked.box.inputValue()).toBe("later");

        // Closing with the reason written asks first; answering no keeps the dialog and its words.
        const question = page.getByRole("dialog").filter({ hasText: wording("common.title.discard_changes") });

        await page.keyboard.press("Escape");
        await question.waitFor({ timeout: 10_000 });
        await page.keyboard.press("Escape");
        await question.waitFor({ state: "detached", timeout: 10_000 });
        expect(await asked.box.inputValue()).toBe("later");

        // Written and taken back, it holds nothing, so it closes without asking.
        await asked.box.fill("");
        await page.keyboard.press("Escape");
        await asked.dialog.waitFor({ state: "detached", timeout: 10_000 });
        expect(await question.count()).toBe(0);
        expect(job.acts).toEqual(["hold", "release", "hold", "release", "hold"]);
      } finally {
        await context.close();
      }
    }, 120_000);
  }
});

describe.skipIf(!origin || !touchReady())("a held TODO row's release, by a held finger and while its stop still ends", () => {
  const phones = LOOKS.filter((look) => look.viewport.width < 600);

  for (const look of phones) {
    test(`a held finger opens the held row's menu with its release in the hold's place, ${look.name}`, async () => {
      const job = fresh([ROW]);
      const context = await open(look, job, true);
      const release = wording("todo.action.unhold");

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/`, { waitUntil: "load" });
        await showList(page);
        await chooseTab(page, wording("todo.label.state_held"));

        await rowOf(page, ROW).waitFor({ timeout: 10_000 });

        const box = await steadyBox(page, `li[data-todo-id="${ROW}"] button`);
        const finger = await fingerOn(page);

        await finger.press({ x: box.x + box.width / 2, y: box.y + box.height / 2 });
        await page.getByRole("menuitem").first().waitFor({ timeout: 10_000 });

        const acts = (await page.getByRole("menuitem").allInnerTexts()).map((text) => text.trim());

        expect(acts).toContain(release);
        expect(acts).not.toContain(wording("todo.action.hold"));

        const item = (await page.getByRole("menuitem", { name: release }).boundingBox())!;

        await finger.tap({ x: item.x + item.width / 2, y: item.y + item.height / 2 });
        await rowOf(page, ROW).waitFor({ state: "detached", timeout: 10_000 });
        expect(job.acts).toEqual(["release"]);
      } finally {
        await context.close();
      }
    }, 120_000);
  }

  for (const look of phones) {
    test(`on a touch screen Enter in the hold dialog sends nothing, and only its button holds, ${look.name}`, async () => {
      const job = fresh();
      const context = await open(look, job, true);
      const hold = wording("todo.action.hold");

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/`, { waitUntil: "load" });
        await showList(page);
        await menuOf(page, ROW);
        await page.getByRole("menuitem", { name: hold }).click();

        const asked = holdDialog(page);

        await asked.box.fill("not this week");
        await asked.box.press("Enter");
        await settle(page);
        expect(job.acts).toEqual([]);
        await asked.button.tap();
        await asked.dialog.waitFor({ state: "detached", timeout: 10_000 });
        expect(job.acts).toEqual(["hold"]);
      } finally {
        await context.close();
      }
    }, 120_000);
  }

  for (const look of [LOOKS[0], LOOKS[3]]) {
    test(`a row stopped while its run still ends offers the release, which puts it back in the queue, ${look.name}`, async () => {
      const job = fresh([ROW], [ROW]);
      const context = await open(look, job);
      const hold = wording("todo.action.hold");
      const release = wording("todo.action.unhold");

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/`, { waitUntil: "load" });
        await showList(page);

        // Until its run has ended it stands in the queue under its own word, not with the holds.
        const stopping = rowOf(page, ROW).getByText(wording("todo.label.held_stopping"), { exact: true });

        await stopping.waitFor({ timeout: 10_000 });

        let acts = await menuOf(page, ROW);

        expect(acts).toContain(release);
        expect(acts).not.toContain(hold);
        await page.getByRole("menuitem", { name: release }).click();
        await stopping.waitFor({ state: "detached", timeout: 10_000 });
        expect(job.acts).toEqual(["release"]);

        acts = await menuOf(page, ROW);
        expect(acts).toContain(hold);
        expect(acts).not.toContain(release);
        await closeMenu(page);
      } finally {
        await context.close();
      }
    }, 120_000);
  }
});

describe.skipIf(!origin || !touchReady())("a TODO item's job notices, switched off with a reason and back on", () => {
  for (const look of LOOKS) {
    test(`the switch-off waits for its reason, which the row and the opened item then show, ${look.name}`, async () => {
      const job = fresh();
      const context = await open(look, job);
      const off = wording("todo.action.notices_off");
      const on = wording("todo.action.notices_on");

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/`, { waitUntil: "load" });
        await showList(page);
        await rowOf(page, ROW).waitFor({ timeout: 10_000 });
        expect(await rowOf(page, ROW).locator("[data-item-notices-off]").count()).toBe(0);

        await openManage(page, ROW);

        const box = page.getByRole("textbox", { name: wording("todo.label.notices_reason") }).filter({ visible: true }).first();
        const offButton = page.getByRole("button", { name: off, exact: true }).filter({ visible: true }).first();
        const onButton = page.getByRole("button", { name: on, exact: true }).filter({ visible: true }).first();

        await box.waitFor({ timeout: 10_000 });
        expect(await offButton.isDisabled()).toBe(true);
        await box.fill("   ");
        expect(await offButton.isDisabled()).toBe(true);
        expect(job.acts).toEqual([]);

        // A refused switch-off is said in the row under its box, never in the pill, and the reason written stays.
        await box.fill("  known, waiting on the owner  ");
        job.refuse = true;
        await offButton.click();
        await page.locator("[data-item-notices]").filter({ visible: true }).first().getByRole("alert").waitFor({ timeout: 10_000 });
        await settle(page);
        expect(await pill(page).count()).toBe(0);
        expect(await box.inputValue()).toBe("  known, waiting on the owner  ");

        await offButton.click();
        await onButton.waitFor({ timeout: 10_000 });
        expect(job.acts).toEqual(["notices_off", "notices_off"]);
        expect(job.whys).toEqual(["known, waiting on the owner", "known, waiting on the owner"]);
        expect(await page.locator("[data-item-notices]").filter({ visible: true }).first().innerText()).toContain("known, waiting on the owner");
        await closeOpened(page, onButton);

        const line = rowOf(page, ROW).locator("[data-item-notices-off]");

        await line.waitFor({ timeout: 10_000 });
        expect(await line.innerText()).toBe(wording("todo.label.notices_off", { reason: "known, waiting on the owner" }));

        // Switched back on, the row says nothing of them.
        await openManage(page, ROW);
        await onButton.click();
        await offButton.waitFor({ timeout: 10_000 });
        expect(job.acts).toEqual(["notices_off", "notices_off", "notices_on"]);
        await closeOpened(page, offButton);
        await line.waitFor({ state: "detached", timeout: 10_000 });
      } finally {
        await context.close();
      }
    }, 120_000);
  }
});

describe.skipIf(!origin || !touchReady())("a running TODO item's stop, refused in its own row", () => {
  for (const look of LOOKS) {
    test(`a refused stop is said under its box, never in the pill, and the reason stays to send again, ${look.name}`, async () => {
      const job = fresh([], [], [ROW]);
      const context = await open(look, job);
      const stop = wording("todo.action.stop");

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/`, { waitUntil: "load" });
        await showList(page);
        await openManage(page, ROW);

        const row = page.locator("[data-item-stop]").filter({ visible: true }).first();
        const box = row.getByRole("textbox", { name: wording("todo.label.stop_reason") });
        const button = row.getByRole("button", { name: stop, exact: true });

        await box.fill("wrong direction");
        job.refuse = true;
        await button.click();
        await row.getByRole("alert").waitFor({ timeout: 10_000 });
        await settle(page);
        expect(await pill(page).count()).toBe(0);
        expect(await box.inputValue()).toBe("wrong direction");

        // Sent again, it goes through: the refusal goes and the box is cleared.
        await button.click();
        await page.waitForFunction(
          () => [...document.querySelectorAll<HTMLInputElement>("[data-item-stop] input")].some((one) => one.offsetParent !== null && one.value === ""),
          undefined,
          { timeout: 10_000 }
        );
        expect(await row.getByRole("alert").count()).toBe(0);
        expect(job.acts).toEqual(["stop", "stop"]);
        expect(job.whys).toEqual(["wrong direction", "wrong direction"]);
      } finally {
        await context.close();
      }
    }, 120_000);
  }
});
