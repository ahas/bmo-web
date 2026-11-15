import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, fingerOn, touchReady } from "./touch";

import type { Browser, BrowserContext, Page } from "playwright-core";
import type { JobQuestion, QuestionTalk } from "../../apps/web/shared/types";

// The questions window over the owner's own room (docs/web.md, 「The questions window」 and 「Talking a question
// over」): the questions out of the room's foot and into one window the owner moves, sizes, folds to its pill and
// talks a question over in, and on a phone a sheet of two heights that leaves the room behind it in use. The questions, their talk and the items they
// belong to are fixtures served through the page's own routes; the console around them is the one given in
// BMO_CONSOLE_TEST_URL, which tests/support/browser-console.ts stands up with this file's fixture account
// (docs/checks.md, 「How the suite runs the tests」). The suite stands up no console, so there it skips. Every state
// is also kept as a picture under BMO_SHOTS_DIR where that names a folder, for a person to look at.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const shots = process.env.BMO_SHOTS_DIR ?? null;
const ACCOUNT = { name: "questions-window", password: "fixture-password-3110" };
const DESK = { width: 1280, height: 800 };
const PHONE = { width: 360, height: 780 };
// A phone's keyboard, played as the console's own viewport setting lets a phone play it: the page's layout made that
// much shorter.
const KEYBOARD_PX = 320;
const GUTTER = 16;
const TEST_MS = 120_000;
const SCHEMES = ["light", "dark"] as const;
const DISCUSS = wording("question.action.discuss");
const TALK = wording("question.label.talk");
const WRITING = wording("question.status.talk_writing");
const SETTLED_ELSEWHERE = wording("question.error.settled_elsewhere", { answer: "Keep the index in the service's own table" });

let browser: Browser | null = null;
let cookie = "";
let owner = 0;

beforeAll(async () => {
  if (!origin || !touchReady()) return;

  const login = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ACCOUNT) });

  expect(login.ok).toBe(true);
  cookie = login.headers.get("set-cookie")!.split(";")[0]!;

  const asked = await fetch(`${origin}/api/owner`, { headers: { cookie } });

  owner = ((await asked.json()) as { chatId: number | null }).chatId ?? 1;
  browser = await chromium.launch();

  if (shots !== null) mkdirSync(shots, { recursive: true });
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();
}, BROWSER_HOOK_MS);

const now = Math.floor(Date.now() / 1000);

function asked(id: number, todoId: number, over: Partial<JobQuestion> = {}): JobQuestion {
  return {
    id,
    todoId,
    asker: "agent-a",
    question: `Which storage should item ${todoId} keep its index in?`,
    options: ["Keep the index in the service's own table", "Move the index to the shared cache", "Drop the index and read the rows each time"],
    recommended: 0,
    recommendation: null,
    why: "Moving it changes what every reader of the index waits on.",
    askedAt: now - 180 * id,
    dueAt: now + 3_600,
    chosen: null,
    answer: null,
    pausedLeft: null,
    settledAt: null,
    settledBy: null,
    ...over
  };
}

// What the routes stand: the questions waiting, the talk over each, and what the page sent.
interface Stand {
  questions: JobQuestion[];
  talks: Map<number, QuestionTalk>;
  sent: { path: string; body: Record<string, unknown> }[];
  // The questions somebody else answered first: an answer to one is refused as the job service refuses it.
  settledElsewhere: Set<number>;
}

async function open(viewport: { width: number; height: number }, scheme: (typeof SCHEMES)[number], stand: Stand): Promise<BrowserContext> {
  const phone = viewport.width < 640;
  const context = await browser!.newContext({
    viewport,
    isMobile: phone,
    hasTouch: phone,
    colorScheme: scheme,
    serviceWorkers: "block",
    reducedMotion: "reduce"
  });
  const at = cookie.indexOf("=");

  await context.addCookies([
    { name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! },
    { name: "console_auto_translate", value: "false", url: origin! },
    { name: "nuxt-color-mode", value: scheme, url: origin! }
  ]);

  const api = (name: string) => (url: URL) => url.pathname.endsWith(`/api/${name}`);

  await context.route(api("questions"), async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as Record<string, unknown>;

      stand.sent.push({ path: "questions", body });
      stand.questions = stand.questions.filter((question) => question.id !== body.id);

      if (stand.settledElsewhere.has(Number(body.id))) {
        return await route.fulfill({ status: 409, json: { message: SETTLED_ELSEWHERE } });
      }

      return await route.fulfill({ json: { ok: true } });
    }

    return await route.fulfill({ json: stand.questions });
  });
  await context.route(api("question-pause"), (route) => route.fulfill({ json: { ok: true, pausedLeft: null, dueAt: now + 3_600 } }));
  await context.route(api("question-talk"), async (route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as { id: number; say: string };
      const talk = stand.talks.get(body.id) ?? { turns: [], heardThrough: null, open: true };
      const id = Math.max(100, ...talk.turns.map((turn) => turn.id)) + 1;

      stand.sent.push({ path: "question-talk", body });
      stand.talks.set(body.id, { ...talk, turns: [...talk.turns, { id, byAsker: false, name: "questions-window", text: body.say, at: Date.now() }], heardThrough: id });

      return await route.fulfill({ json: { ok: true } });
    }

    const id = Number(new URL(route.request().url()).searchParams.get("id"));

    return await route.fulfill({ json: stand.talks.get(id) ?? { turns: [], heardThrough: null, open: true } });
  });
  await context.route(api("todos/items"), async (route) => {
    const ids = (new URL(route.request().url()).searchParams.get("ids") ?? "").split(",").map(Number);

    await route.fulfill({
      json: ids.map((id) => ({ id, title: `Keep the search index fresh for item ${id}`, instruction: "", brief: null, requester: "owner", requesterId: null, chatId: null, approved: true, awaitingApproval: false, recommended: false, done: false, running: true, priority: 1, status: "leased", model: null, agent: null, worker: "agent-a" }))
    });
  });

  return context;
}

async function shoot(page: Page, name: string): Promise<void> {
  if (shots === null) return;

  await page.waitForTimeout(250);
  await page.screenshot({ path: join(shots, `${name}.png`) });
}

const WINDOW = "section[role=dialog][aria-modal=false]";

async function rectOf(page: Page, selector: string): Promise<{ x: number; y: number; width: number; height: number }> {
  return await page.locator(selector).first().evaluate((element) => {
    const box = element.getBoundingClientRect();

    return { x: box.x, y: box.y, width: box.width, height: box.height };
  });
}

async function openRoom(page: Page): Promise<void> {
  await page.goto(`${origin}/rooms/${owner}`, { waitUntil: "load" });
  await page.locator("[data-screen-foot]").waitFor({ timeout: 60_000 });
}

// The window's title bar dragged by the mouse to a point well past an edge.
async function dragBar(page: Page, dx: number, dy: number): Promise<void> {
  const bar = await rectOf(page, `${WINDOW} > div[tabindex="0"]`);
  const from = { x: bar.x + 40, y: bar.y + bar.height / 2 };

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx / 2, from.y + dy / 2, { steps: 4 });
  await page.mouse.move(from.x + dx, from.y + dy, { steps: 4 });
  await page.mouse.up();
}

function stood(talk: Partial<QuestionTalk> = {}): Stand {
  return { questions: [], talks: new Map(), sent: [], settledElsewhere: new Set(), ...talk } as Stand;
}

describe.skipIf(!origin || !touchReady())("the questions window on a desk", () => {
  for (const scheme of SCHEMES) {
    test(`stands one question out of the foot, moves, folds and talks, ${scheme}`, async () => {
      const stand = stood();

      stand.questions = [asked(1, 41)];

      const context = await open(DESK, scheme, stand);
      const page = await context.newPage();
      const name = (state: string) => `${DESK.width}-${scheme}-${state}`;

      try {
        await page.evaluate(() => window.localStorage.clear()).catch(() => undefined);
        await openRoom(page);
        await page.locator(WINDOW).waitFor({ timeout: 30_000 });

        // Nothing of the questions stands in the room's foot, and the window stands clear of it.
        expect(await page.locator("[data-screen-foot] section").count()).toBe(0);

        const first = await rectOf(page, WINDOW);
        const foot = await rectOf(page, "[data-screen-foot]");

        expect(first.y + first.height).toBeLessThanOrEqual(foot.y);
        await shoot(page, name("one"));

        // Dragged far past each corner, it stops a gutter in from the visible window's edges.
        const corners = [
          { state: "corner-top-left", dx: -3_000, dy: -3_000 },
          { state: "corner-top-right", dx: 3_000, dy: -3_000 },
          { state: "corner-bottom-right", dx: 3_000, dy: 3_000 },
          { state: "corner-bottom-left", dx: -3_000, dy: 3_000 }
        ];

        for (const corner of corners) {
          await dragBar(page, corner.dx, corner.dy);

          const box = await rectOf(page, WINDOW);

          expect(box.x).toBeGreaterThanOrEqual(GUTTER - 1);
          expect(box.y).toBeGreaterThanOrEqual(GUTTER - 1);
          expect(box.x + box.width).toBeLessThanOrEqual(DESK.width - GUTTER + 1);
          expect(box.y + box.height).toBeLessThanOrEqual(DESK.height - GUTTER + 1);
          await shoot(page, name(corner.state));
        }

        // The arrow keys move it once its bar holds the focus.
        const before = await rectOf(page, WINDOW);

        await page.locator(`${WINDOW} > div[tabindex="0"]`).focus();
        await page.keyboard.press("ArrowUp");

        expect((await rectOf(page, WINDOW)).y).toBe(before.y - 16);
        await shoot(page, name("keyboard-focus"));

        // Folded, it is a pill counting what waits; unfolded, it stands where it was.
        const placed = await rectOf(page, WINDOW);

        await page.keyboard.press("Escape");
        await page.locator(WINDOW).waitFor({ state: "detached", timeout: 10_000 });
        expect(await page.getByRole("button", { name: /1/ }).last().isVisible()).toBe(true);
        await shoot(page, name("pill"));
        await page.locator("button.shadow-lg").last().click();
        await page.locator(WINDOW).waitFor({ timeout: 10_000 });
        expect(await rectOf(page, WINDOW)).toEqual(placed);

        // The talk: its turns, the job writing its answer, and an answer chosen from within it.
        stand.talks.set(1, {
          open: true,
          heardThrough: 103,
          turns: [
            { id: 101, byAsker: false, name: "questions-window", text: "What does the shared cache change for the readers?", at: Date.now() - 90_000 },
            { id: 102, byAsker: true, name: "agent-a", text: "Every reader would wait on the cache's own refresh instead of the table, which can lag by a minute.", at: Date.now() - 60_000 },
            { id: 103, byAsker: false, name: "questions-window", text: "And if the table stays, what does it cost?", at: Date.now() - 10_000 }
          ]
        });
        await page.getByRole("button", { name: DISCUSS }).click();
        await page.getByText(WRITING).waitFor({ timeout: 10_000 });
        await page.getByText(WRITING).scrollIntoViewIfNeeded();
        await shoot(page, name("talk-writing"));

        const talkBox = page.locator(`${WINDOW} [role=group][aria-label="${TALK}"] textarea`);

        await talkBox.fill("Thanks, that is clear.");
        await talkBox.press("Enter");
        await page.waitForTimeout(500);
        expect(stand.sent.some((sent) => sent.path === "question-talk" && sent.body.say === "Thanks, that is clear.")).toBe(true);

        await page.getByRole("button", { name: /^1\. / }).click();
        await shoot(page, name("talk-chosen"));
        await page.getByRole("button", { name: wording("question.action.answer_with", { number: 1 }) }).click();
        await page.waitForTimeout(500);
        expect(stand.sent.some((sent) => sent.path === "questions" && sent.body.chosen === 0)).toBe(true);
        // The one question answered, nothing waits and the window is gone.
        await page.locator(WINDOW).waitFor({ state: "detached", timeout: 10_000 });
      } finally {
        await context.close();
      }
    }, TEST_MS);

    test(`stands three questions as one list, ${scheme}`, async () => {
      const stand = stood();

      stand.questions = [asked(1, 41), asked(2, 42, { recommended: null, recommendation: "Ask the owner of the cache first" }), asked(3, 43, { pausedLeft: 0 })];

      const context = await open(DESK, scheme, stand);
      const page = await context.newPage();

      try {
        await openRoom(page);
        await page.locator(WINDOW).waitFor({ timeout: 30_000 });
        expect(await page.locator(`${WINDOW} section`).count()).toBe(3);
        await shoot(page, `${DESK.width}-${scheme}-three`);

        // A question answered elsewhere while it stood open: the answer is refused, the question leaves the list, and
        // what it was settled on stands to be read.
        stand.settledElsewhere.add(1);
        await page.locator(`${WINDOW} section`).first().getByRole("button", { name: /^2\. / }).click();
        await page.locator(`${WINDOW} section`).first().getByRole("button", { name: wording("question.action.answer_with", { number: 2 }) }).click();
        await page.getByText(SETTLED_ELSEWHERE).waitFor({ timeout: 10_000 });
        expect(await page.locator(`${WINDOW} section`).count()).toBe(2);
        await shoot(page, `${DESK.width}-${scheme}-answered-elsewhere`);
      } finally {
        await context.close();
      }
    }, TEST_MS);
  }
});

describe.skipIf(!origin || !touchReady())("the questions sheet on a phone", () => {
  for (const scheme of SCHEMES) {
    test(`stands as a sheet of two heights that leaves the room in use, ${scheme}`, async () => {
      const stand = stood();

      stand.questions = [asked(1, 41), asked(2, 42), asked(3, 43)];
      stand.talks.set(1, {
        open: true,
        heardThrough: 102,
        turns: [
          { id: 101, byAsker: false, name: "questions-window", text: "What would the cache change?", at: Date.now() - 60_000 },
          { id: 102, byAsker: true, name: "agent-a", text: "Readers would wait on its refresh.", at: Date.now() - 30_000 }
        ]
      });

      const context = await open(PHONE, scheme, stand);
      const page = await context.newPage();
      const name = (state: string) => `${PHONE.width}-${scheme}-${state}`;
      const sheet = "[data-beside-page]";

      try {
        await openRoom(page);
        await page.locator(sheet).waitFor({ timeout: 30_000 });
        await page.waitForTimeout(600);
        await shoot(page, name("short"));

        // A finger on the room above the sheet is the room's: the sheet stays.
        const finger = await fingerOn(page);

        await finger.tap({ x: PHONE.width / 2, y: 140 });
        await page.waitForTimeout(400);
        expect(await page.locator(sheet).count()).toBe(1);

        await page.getByRole("button", { name: wording("common.action.expand") }).click();
        await page.waitForTimeout(600);
        await shoot(page, name("tall"));

        // The talk open, and a keyboard over the page's foot while a word is written to the job.
        await page.getByRole("button", { name: DISCUSS }).first().click();
        await page.locator(`${sheet} textarea`).first().waitFor({ timeout: 10_000 });
        await page.locator(`${sheet} textarea`).nth(0).focus();
        await page.setViewportSize({ width: PHONE.width, height: PHONE.height - KEYBOARD_PX });
        await page.waitForTimeout(600);
        await shoot(page, name("tall-keyboard"));

        await page.getByRole("button", { name: wording("common.action.collapse") }).click();
        await page.waitForTimeout(600);
        await page.locator(`${sheet} textarea`).nth(0).focus();
        await shoot(page, name("short-keyboard"));
        await page.setViewportSize(PHONE);
        await page.waitForTimeout(400);

        // Folded, the sheet is a pill above the input bar, which stands whole again.
        await page.getByRole("button", { name: wording("common.action.close") }).first().click();
        await page.locator(sheet).waitFor({ state: "detached", timeout: 10_000 });

        const pill = await rectOf(page, "button.shadow-lg");
        const foot = await rectOf(page, "[data-screen-foot]");

        expect(pill.y + pill.height).toBeLessThanOrEqual(foot.y);
        await shoot(page, name("pill"));
      } finally {
        await context.close();
      }
    }, TEST_MS);
  }
});
