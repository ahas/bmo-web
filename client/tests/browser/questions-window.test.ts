import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { chromium } from "playwright-core";

import { DUE_READ_DELAY_S } from "../../apps/web/app/domain/questions";
import { wording } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, fingerOn, touchReady } from "./touch";

import type { Browser, BrowserContext, Page } from "playwright-core";
import type { JobQuestion, QuestionTalk } from "../../apps/web/shared/types";

// The questions window over the owner's own room (docs/web.md, 「The questions window」 and 「Talking a question
// over」): the questions out of the room's foot and into one window the owner moves, sizes, folds to its pill and
// talks a question over in, and on a phone a sheet of two heights that leaves the room behind it in use. The questions, their talk and the items they
// belong to are fixtures served through the page's own routes; the console around them is the one given in
// BMO_CONSOLE_TEST_URL, which tests/support/browser-console.ts stands up (docs/checks.md, 「How the suite runs the
// tests」). The window stands for the owner's login alone, so the file signs in as the harness's first account, the one
// the data move made the administrator's and linked to the owner's sender. The suite stands up no console, so there it skips. Every state
// is also kept as a picture under BMO_SHOTS_DIR where that names a folder, for a person to look at.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const shots = process.env.BMO_SHOTS_DIR ?? null;
const ACCOUNT = { name: "agent-topbar", password: "fixture-password-1558" };
const DESK = { width: 1280, height: 800 };
const PHONE = { width: 360, height: 780 };
// A phone's keyboard, played as the console's own viewport setting lets a phone play it: the page's layout made that
// much shorter.
const KEYBOARD_PX = 320;
const GUTTER = 16;
const TEST_MS = 120_000;
const SCHEMES = ["light", "dark"] as const;
const DISCUSS = wording("question.action.discuss");
const ANSWER = wording("question.action.answer");
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
  // The seconds each stopped question had left, as bmo-job keeps them; one stopped with none kept has none.
  left: Map<number, number>;
}

// The wait a question is asked with where its asker names none, which bmo-job counts again for one opened with no
// time left.
const WAIT_S = 60;

// A stop or a resume, played as bmo-job plays it on the one question named (bmo-job's `docs/api.md`, 「The due
// time」): a stop keeps the time left and reads no due time, and a resume counts from what was kept, or a whole wait
// again where nothing was left.
function paused(stand: Stand, body: { id: number; paused: boolean }): void {
  const at = Math.floor(Date.now() / 1000);

  stand.questions = stand.questions.map((question) => {
    if (question.id !== body.id) return question;

    if (body.paused) {
      stand.left.set(question.id, Math.max(0, (question.dueAt ?? at) - at));

      return { ...question, pausedLeft: 0, dueAt: null };
    }

    const left = stand.left.get(question.id) ?? 0;

    return { ...question, pausedLeft: null, dueAt: at + (left > 0 ? left : WAIT_S) };
  });
}

async function open(viewport: { width: number; height: number }, scheme: (typeof SCHEMES)[number], stand: Stand, reducedMotion: "reduce" | "no-preference" = "reduce"): Promise<BrowserContext> {
  const phone = viewport.width < 640;
  const context = await browser!.newContext({
    viewport,
    isMobile: phone,
    hasTouch: phone,
    colorScheme: scheme,
    serviceWorkers: "block",
    reducedMotion
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
  await context.route(api("question-pause"), async (route) => {
    const body = route.request().postDataJSON() as { id: number; paused: boolean };

    stand.sent.push({ path: "question-pause", body });
    paused(stand, body);

    return await route.fulfill({ json: { ok: true, pausedLeft: null, dueAt: null } });
  });
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
      json: ids.map((id) => ({ id, title: `Keep the search index fresh for item ${id}`, instruction: "", requester: "owner", requesterId: null, chatId: null, approved: true, awaitingApproval: false, recommended: false, done: false, running: true, priority: 1, status: "leased", model: null, agent: null, worker: "agent-a" }))
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

// A card's parts in the order it stands them (docs/web.md, 「The card stands its parts in one order」): the talk button
// right under the last choice and as wide as it, the box for his own words under it, and the send button under the box
// at the card's right edge, the edge the full-width box shares.
async function expectCardOrder(page: Page, todoId: number, sendLabel: string = ANSWER): Promise<void> {
  const card = page.locator(`section[aria-label="${wording("question.label.asked", { id: todoId })}"]`);
  const last = await card.getByRole("button", { name: /^\d\. / }).last().boundingBox();
  const discuss = await card.getByRole("button", { name: DISCUSS }).boundingBox();
  // The answer box is the card's last; an open talk stands its own box above the choices.
  const box = await card.locator("textarea").last().boundingBox();
  const send = await card.getByRole("button", { name: sendLabel }).boundingBox();

  expect(last && discuss && box && send).toBeTruthy();
  expect(discuss!.y).toBeGreaterThanOrEqual(last!.y + last!.height);
  expect(discuss!.y - (last!.y + last!.height)).toBeLessThanOrEqual(8);
  expect(Math.abs(discuss!.x - last!.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(discuss!.width - last!.width)).toBeLessThanOrEqual(1);
  expect(box!.y).toBeGreaterThan(discuss!.y + discuss!.height);
  expect(send!.y).toBeGreaterThan(box!.y + box!.height);
  expect(Math.abs(send!.x + send!.width - (box!.x + box!.width))).toBeLessThanOrEqual(1);
  expect(send!.width).toBeLessThan(box!.width / 2);
}

function stood(talk: Partial<QuestionTalk> = {}): Stand {
  return { questions: [], talks: new Map(), sent: [], settledElsewhere: new Set(), left: new Map(), ...talk } as Stand;
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
        await expectCardOrder(page, 41);
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
        // The choice made, the unpick button stands beside the send button, which keeps its place at the card's right edge.
        await page.getByRole("button", { name: wording("question.action.answer_with", { number: 1 }) }).scrollIntoViewIfNeeded();
        await expectCardOrder(page, 41, wording("question.action.answer_with", { number: 1 }));
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
        await expectCardOrder(page, 41);
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

// A question's timer stopped and started again from its card (docs/web.md, 「The deadline can be stopped」): the stop is
// the one question's, a question asked after it counts its own time, and starting it again keeps the window standing
// with the countdown running — or, for one stopped after its time had run out, standing as run out.
describe.skipIf(!origin || !touchReady())("a question's timer in the questions window", () => {
  const PAUSE = wording("question.action.pause");
  const RESUME = wording("question.action.resume");
  // What the running line says after its time, which the time itself does not change.
  const RUNNING = wording("question.status.running", { time: "\u0000", number: 1 }).split("\u0000")[1]!;

  const card = (page: Page, todoId: number) => page.locator(`${WINDOW} section[aria-label="${wording("question.label.asked", { id: todoId })}"]`);
  const clock = (page: Page, todoId: number) => card(page, todoId).locator("p.tabular-nums");

  test("keeps a stop on its own question, and a new one counts its own time", async () => {
    const stand = stood();

    stand.questions = [asked(1, 41), asked(2, 42)];

    const context = await open(DESK, "light", stand);
    const page = await context.newPage();

    try {
      await openRoom(page);
      await page.locator(WINDOW).waitFor({ timeout: 30_000 });

      // The stop stands at the right end of the time-left line, the edge the answer box shares, and the line's words
      // changing between running and stopped never move it.
      const stopEdge = async (name: string): Promise<number> => {
        const button = await card(page, 41).getByRole("button", { name }).boundingBox();
        const box = await card(page, 41).locator("textarea").last().boundingBox();

        expect(button && box).toBeTruthy();
        expect(Math.abs(button!.x + button!.width - (box!.x + box!.width))).toBeLessThanOrEqual(1);
        return button!.x + button!.width;
      };
      const running = await stopEdge(PAUSE);

      await card(page, 41).getByRole("button", { name: PAUSE }).click();
      await card(page, 41).getByRole("button", { name: RESUME }).waitFor({ timeout: 10_000 });

      expect(Math.abs((await stopEdge(RESUME)) - running)).toBeLessThanOrEqual(1);

      expect(stand.sent.filter((sent) => sent.path === "question-pause").map((sent) => sent.body)).toEqual([{ id: 1, paused: true }]);
      expect(await clock(page, 41).textContent()).toBe(wording("question.status.paused", { number: 1 }));
      expect(await card(page, 42).getByRole("button", { name: PAUSE }).getAttribute("aria-pressed")).toBe("false");
      expect(await clock(page, 42).textContent()).toEndWith(RUNNING);

      // A job asks again while the first stands stopped; the read the resume brings stands it running.
      stand.questions = [...stand.questions, asked(3, 43)];
      await card(page, 41).getByRole("button", { name: RESUME }).click();
      await card(page, 43).waitFor({ timeout: 10_000 });
      await card(page, 41).getByRole("button", { name: PAUSE }).waitFor({ timeout: 10_000 });

      // A third card may give the window's body a scrollbar, which narrows every card alike, so here the stop is held
      // to the box's edge alone.
      await stopEdge(PAUSE);
      expect(await page.locator(`${WINDOW} section`).count()).toBe(3);
      expect(await card(page, 43).getByRole("button", { name: PAUSE }).getAttribute("aria-pressed")).toBe("false");
      expect(await clock(page, 43).textContent()).toEndWith(RUNNING);
      expect(await clock(page, 41).textContent()).toEndWith(RUNNING);
    } finally {
      await context.close();
    }
  }, TEST_MS);

  test("keeps the window standing when a question stopped after its time ran out is started again", async () => {
    const stand = stood();

    // Stopped once its time had run out, so bmo-job kept nothing and opens it again with a whole wait.
    stand.questions = [asked(1, 41, { pausedLeft: 0, dueAt: null })];

    const context = await open(DESK, "light", stand);
    const page = await context.newPage();

    try {
      await openRoom(page);
      await page.locator(WINDOW).waitFor({ timeout: 30_000 });

      await card(page, 41).getByRole("button", { name: RESUME }).click();
      await card(page, 41).getByRole("button", { name: PAUSE }).waitFor({ timeout: 10_000 });

      expect(await page.locator(WINDOW).count()).toBe(1);
      expect(await clock(page, 41).textContent()).toEndWith(RUNNING);
      await shoot(page, `${DESK.width}-light-resumed-with-a-whole-wait`);
    } finally {
      await context.close();
    }
  }, TEST_MS);
});

// A question's time running out (docs/web.md, 「Its time running out settles it on the recommendation」): the countdown
// is the due time bmo-job holds, reaching nothing it says the recommendation settles the question, and a moment later
// the console reads the questions again, so the card leaves on bmo-job's settling without waiting on its news or the
// poll. The page's clock is played, so no second of it is waited on.
describe.skipIf(!origin || !touchReady())("a question whose time runs out", () => {
  const due = now + 60;
  const OVERDUE = wording("question.status.overdue", { number: 1 });
  const LAST_SECOND = wording("question.status.running", { time: wording("common.label.seconds", { n: 1 }), number: 1 });

  for (const viewport of [DESK, PHONE]) {
    test(`says the recommendation settles it, then leaves once bmo-job has, ${viewport.width}`, async () => {
      const stand = stood();

      stand.questions = [asked(1, 41, { dueAt: due })];

      const context = await open(viewport, "light", stand);
      const page = await context.newPage();

      try {
        const holder = viewport.width < 640 ? "[data-beside-page]" : WINDOW;
        const shown = page.locator(`${holder} section[aria-label="${wording("question.label.asked", { id: 41 })}"]`);
        const line = shown.locator("p.tabular-nums");

        await page.clock.install({ time: now * 1_000 });
        await openRoom(page);
        await shown.waitFor({ timeout: 30_000 });

        await page.clock.pauseAt((due - 2) * 1_000);
        await page.clock.runFor(1_000);
        expect(await line.textContent()).toBe(LAST_SECOND);

        await page.clock.runFor(1_000);
        expect(await line.textContent()).toBe(OVERDUE);
        await shoot(page, `${viewport.width}-light-time-ran-out`);

        // bmo-job settles it on its recommendation within its next look, and the read after the countdown finds it so.
        stand.questions = [asked(1, 41, { dueAt: due, chosen: 0, settledAt: due, settledBy: "recommendation" })];
        await page.clock.runFor(DUE_READ_DELAY_S * 1_000);
        await shown.waitFor({ state: "detached", timeout: 10_000 });
      } finally {
        await context.close();
      }
    }, TEST_MS);
  }
});

// A recommendation the choices do not hold, as one that is a choice with a remark beside it is, marks no choice and
// stands on the card in its own words, so it is read on the card whether or not it names a choice (docs/web.md, 「The
// recommendation is the job's own, and the card draws it as the job gives it」).
describe.skipIf(!origin || !touchReady())("a recommendation in words of its own", () => {
  const words = "Keep the index in the service's own table (recommended)";
  const RUNNING_WORDS = wording("question.status.running_words", { time: "\u0000" }).split("\u0000")[1]!;

  for (const [viewport, scheme] of [[DESK, "light"], [DESK, "dark"], [PHONE, "light"]] as const) {
    test(`stands under the reason and names no choice, ${viewport.width} ${scheme}`, async () => {
      const stand = stood();

      stand.questions = [asked(1, 41, { recommended: null, recommendation: words })];

      const context = await open(viewport, scheme, stand);
      const page = await context.newPage();

      try {
        // A desk stands the questions in the window, a phone in the sheet beside the room.
        const holder = viewport.width < 640 ? "[data-beside-page]" : WINDOW;

        await openRoom(page);
        await page.locator(holder).waitFor({ timeout: 30_000 });

        const shown = page.locator(`${holder} section[aria-label="${wording("question.label.asked", { id: 41 })}"]`);

        const line = (await shown.locator("p.text-primary").textContent()) ?? "";
        const choices = await shown.getByRole("button", { name: /^\d\. / }).allTextContents();

        expect(line.replace(/\s+/g, " ").trim()).toBe(`${wording("question.label.recommended_words")} ${words}`);
        expect(choices.some((choice) => choice.includes(wording("question.label.recommended")))).toBe(false);
        expect(await shown.locator("p.tabular-nums").textContent()).toEndWith(RUNNING_WORDS);
        await expectCardOrder(page, 41);
        await shoot(page, `${viewport.width}-${scheme}-recommended-words`);
      } finally {
        await context.close();
      }
    }, TEST_MS);
  }
});

// The folded window's pill dragged like a picture-in-picture window (docs/web.md, 「The questions window」, the pill;
// bmo-ui's `docs/components.md`, 「Dragged like a picture-in-picture window」): a press opens the window, a drag never
// does, it never leaves what is visible, and where it was left is kept in this browser. On a desk it carries the
// window's place, so the window unfolds where the pill was left; on a phone it settles on the nearer side.
describe.skipIf(!origin || !touchReady())("the questions window's pill dragged like a picture-in-picture window", () => {
  const PILL = "[data-window-pill] button";
  const SHEET = "[data-beside-page]";
  const CLOSE = wording("common.action.close");
  const GESTURE_SETTLE_MS = 1_000;

  async function fold(page: Page): Promise<void> {
    await page.locator(WINDOW).getByRole("button", { name: CLOSE }).click();
    await page.locator(WINDOW).waitFor({ state: "detached", timeout: 10_000 });
  }

  async function within(page: Page, viewport: { width: number; height: number }): Promise<{ x: number; y: number; width: number; height: number }> {
    const pill = await rectOf(page, PILL);

    expect(pill.x).toBeGreaterThanOrEqual(GUTTER - 1);
    expect(pill.y).toBeGreaterThanOrEqual(GUTTER - 1);
    expect(pill.x + pill.width).toBeLessThanOrEqual(viewport.width - GUTTER + 1);
    expect(pill.y + pill.height).toBeLessThanOrEqual(viewport.height - GUTTER + 1);

    return pill;
  }

  async function mouseDrag(page: Page, dx: number, dy: number): Promise<void> {
    const pill = await rectOf(page, PILL);
    const from = { x: pill.x + pill.width / 2, y: pill.y + pill.height / 2 };

    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + dx / 2, from.y + dy / 2, { steps: 4 });
    await page.mouse.move(from.x + dx, from.y + dy, { steps: 4 });
    await page.mouse.up();
    await page.waitForTimeout(300);
  }

  test("on a desk, moves the window's place with it and opens only on a press", async () => {
    const stand = stood();

    stand.questions = [asked(1, 41)];

    const context = await open(DESK, "light", stand);
    const page = await context.newPage();
    const name = (state: string) => `${DESK.width}-pill-${state}`;

    try {
      await page.evaluate(() => window.localStorage.clear()).catch(() => undefined);
      await openRoom(page);
      await page.locator(WINDOW).waitFor({ timeout: 30_000 });
      await fold(page);

      // A click with no drag opens the window, and one that wobbles less than the slop is still a click.
      await page.locator(PILL).click();
      await page.locator(WINDOW).waitFor({ timeout: 10_000 });
      await fold(page);
      await mouseDrag(page, 2, 1);
      await page.locator(WINDOW).waitFor({ timeout: 10_000 });
      await fold(page);

      // A drag moves the pill with the pointer and opens nothing.
      const before = await within(page, DESK);

      await mouseDrag(page, -300, 200);

      const after = await within(page, DESK);

      expect(Math.round(after.x - before.x)).toBe(-300);
      expect(Math.round(after.y - before.y)).toBe(200);
      expect(await page.locator(WINDOW).count()).toBe(0);
      await shoot(page, name("dragged"));

      // Dragged far past each corner, it stops inside what is visible, and never opens the window.
      for (const corner of [
        { dx: -3_000, dy: -3_000 },
        { dx: 3_000, dy: -3_000 },
        { dx: 3_000, dy: 3_000 },
        { dx: -3_000, dy: 3_000 }
      ]) {
        await mouseDrag(page, corner.dx, corner.dy);
        await within(page, DESK);
        expect(await page.locator(WINDOW).count()).toBe(0);
      }

      await mouseDrag(page, 200, -200);

      // The window unfolds where the pill was left, its top trailing corner at the pill's.
      const left = await within(page, DESK);

      await page.locator(PILL).click();
      await page.locator(WINDOW).waitFor({ timeout: 10_000 });

      const unfolded = await rectOf(page, WINDOW);

      expect(Math.abs(unfolded.x + unfolded.width - (left.x + left.width))).toBeLessThanOrEqual(1);
      expect(Math.abs(unfolded.y - left.y)).toBeLessThanOrEqual(1);
      await shoot(page, name("unfolded"));

      // Kept in this browser: the window stands at the same place after the page is opened again.
      await openRoom(page);
      await page.locator(WINDOW).waitFor({ timeout: 30_000 });
      await page.waitForTimeout(300);
      expect(await rectOf(page, WINDOW)).toEqual(unfolded);
    } finally {
      await context.close();
    }
  }, TEST_MS);

  test("on a phone, follows a finger, settles on the nearer side and opens only on a tap", async () => {
    const stand = stood();

    stand.questions = [asked(1, 41)];

    const context = await open(PHONE, "light", stand);
    const page = await context.newPage();
    const name = (state: string) => `${PHONE.width}-pill-${state}`;

    try {
      await page.evaluate(() => window.localStorage.clear()).catch(() => undefined);
      await openRoom(page);
      await page.locator(SHEET).waitFor({ timeout: 30_000 });
      await page.getByRole("button", { name: wording("common.action.close") }).first().click();
      await page.locator(SHEET).waitFor({ state: "detached", timeout: 10_000 });
      await page.waitForTimeout(300);

      const finger = await fingerOn(page);
      const centre = (box: { x: number; y: number; width: number; height: number }) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

      // A tap opens the sheet.
      await finger.tap(centre(await rectOf(page, PILL)));
      await page.locator(SHEET).waitFor({ timeout: 10_000 });
      await page.getByRole("button", { name: wording("common.action.close") }).first().click();
      await page.locator(SHEET).waitFor({ state: "detached", timeout: 10_000 });
      await page.waitForTimeout(300);

      // At first it stands at the leading foot, above the input bar.
      const first = await within(page, PHONE);
      const foot = await rectOf(page, "[data-screen-foot]");

      expect(Math.round(first.x)).toBe(GUTTER);
      expect(first.y + first.height).toBeLessThanOrEqual(foot.y);

      // Dragged toward the trailing side and let go past the middle, it settles there at the height it was let go at.
      await finger.swipe(centre(first), { x: 260, y: 300 }, { steps: 10 });
      await page.waitForTimeout(400);

      const settled = await within(page, PHONE);

      expect(Math.round(settled.x + settled.width)).toBe(PHONE.width - GUTTER);
      expect(Math.abs(settled.y + settled.height / 2 - 300)).toBeLessThanOrEqual(2);
      expect(await page.locator(SHEET).count()).toBe(0);
      await shoot(page, name("settled"));

      // Dragged far past the foot and the leading edge, it stays above the input bar and inside what is visible.
      await finger.swipe(centre(settled), { x: -200, y: PHONE.height + 200 }, { steps: 10 });
      await page.waitForTimeout(400);

      const low = await within(page, PHONE);

      expect(Math.round(low.x)).toBe(GUTTER);
      expect(low.y + low.height).toBeLessThanOrEqual((await rectOf(page, "[data-screen-foot]")).y);
      expect(await page.locator(SHEET).count()).toBe(0);

      // A finger resting on it names it, and lifting presses nothing.
      await finger.press(centre(low));
      await page.locator('[role="tooltip"]').first().waitFor({ timeout: 5_000 });
      expect(await page.locator(SHEET).count()).toBe(0);
      await shoot(page, name("named"));
      await finger.tap({ x: PHONE.width / 2, y: 200 });
      await page.waitForTimeout(300);

      // A finger that rests and then moves on drags it and puts the name away; the next tap opens the sheet.
      await finger.swipe(centre(low), { x: 300, y: 260 }, { steps: 10, holdMs: 800 });
      await page.waitForTimeout(400);

      const moved = await within(page, PHONE);

      expect(Math.round(moved.x + moved.width)).toBe(PHONE.width - GUTTER);
      expect(await page.locator('[role="tooltip"]').count()).toBe(0);
      expect(await page.locator(SHEET).count()).toBe(0);

      // The browser's own gesture reading takes a tap landing right after a long press for part of that gesture and
      // makes no click of it, whatever the page does, so the next tap comes once a hand would have lifted and returned.
      await page.waitForTimeout(GESTURE_SETTLE_MS);
      await finger.tap(centre(moved));
      await page.locator(SHEET).waitFor({ timeout: 10_000 });

      // Kept in this browser: folded again after the page is opened again, it stands where it was left.
      await openRoom(page);
      await page.locator(SHEET).waitFor({ timeout: 30_000 });
      await page.getByRole("button", { name: wording("common.action.close") }).first().click();
      await page.locator(SHEET).waitFor({ state: "detached", timeout: 10_000 });
      await page.waitForTimeout(300);
      expect(await rectOf(page, PILL)).toEqual(moved);
    } finally {
      await context.close();
    }
  }, TEST_MS);

  // The pill against the design rules as it is driven: a hover and a press each paint it other than at rest, the
  // tooltip names it under a pointer and stands away while it is dragged, a drag shows the grabbing hand, the ring
  // stands only where the keyboard put the focus, and on a phone the pill glides to its side on the shared motion and
  // stands there with nothing of the glide left on it.
  async function paint(page: Page): Promise<string> {
    return await page.locator(PILL).evaluate((element) => getComputedStyle(element).backgroundColor);
  }

  test("on a desk, answers a hover, a press, a drag and the keyboard as the design rules ask", async () => {
    const stand = stood();

    stand.questions = [asked(1, 41)];

    const context = await open(DESK, "light", stand);
    const page = await context.newPage();

    try {
      await page.evaluate(() => window.localStorage.clear()).catch(() => undefined);
      await openRoom(page);
      await page.locator(WINDOW).waitFor({ timeout: 30_000 });

      // Folded by the keyboard from inside the window, the focus goes to the pill and draws the shared ring.
      await page.locator(`${WINDOW} > div[tabindex="0"]`).focus();
      await page.keyboard.press("Escape");
      await page.locator(WINDOW).waitFor({ state: "detached", timeout: 10_000 });

      const ring = await page.locator(PILL).evaluate((element) => ({ visible: element.matches(":focus-visible"), width: getComputedStyle(element).outlineWidth, style: getComputedStyle(element).outlineStyle }));

      expect(ring).toEqual({ visible: true, width: "2px", style: "solid" });

      // The keyboard's focus taken off, what the mouse does next is measured on its own.
      await page.locator(PILL).evaluate((element) => (element as HTMLElement).blur());
      await page.mouse.move(5, 5);
      await page.waitForTimeout(300);

      const rest = await paint(page);
      const pill = await rectOf(page, PILL);
      const centre = { x: pill.x + pill.width / 2, y: pill.y + pill.height / 2 };

      await page.mouse.move(centre.x, centre.y);
      await page.locator('[role="tooltip"]').first().waitFor({ timeout: 5_000 });
      expect(await page.locator('[role="tooltip"]').first().innerText()).toBe(wording("question.aria.window_open", { n: 1 }));
      await page.waitForTimeout(300);

      const hover = await paint(page);

      await page.mouse.down();
      await page.waitForTimeout(200);

      const press = await paint(page);

      expect(hover).not.toBe(rest);
      expect(press).not.toBe(rest);

      // Dragged, it shows the grabbing hand, no tooltip stands, and the mouse's press takes no ring.
      await page.mouse.move(centre.x - 60, centre.y + 40, { steps: 4 });

      expect(await page.locator("[data-window-pill]").evaluate((element) => getComputedStyle(element).cursor)).toBe("grabbing");
      // The tooltip goes once the drag begins, its own fade allowed for.
      await page.waitForTimeout(400);
      expect(await page.locator('[role="tooltip"]').count()).toBe(0);

      await page.mouse.up();
      await page.waitForTimeout(300);
      expect(await page.locator(PILL).evaluate((element) => element.matches(":focus-visible"))).toBe(false);
      expect(await page.locator(WINDOW).count()).toBe(0);
    } finally {
      await context.close();
    }
  }, TEST_MS);

  test("on a phone, glides to its side on the shared motion and keeps nothing of the glide", async () => {
    const stand = stood();

    stand.questions = [asked(1, 41)];

    const context = await open(PHONE, "light", stand, "no-preference");
    const page = await context.newPage();

    try {
      await page.evaluate(() => window.localStorage.clear()).catch(() => undefined);
      await openRoom(page);
      await page.locator(SHEET).waitFor({ timeout: 30_000 });
      await page.getByRole("button", { name: CLOSE }).first().click();
      await page.locator(SHEET).waitFor({ state: "detached", timeout: 10_000 });
      await page.waitForTimeout(600);

      const finger = await fingerOn(page);
      const first = await rectOf(page, PILL);

      await finger.swipe({ x: first.x + first.width / 2, y: first.y + first.height / 2 }, { x: 250, y: 320 }, { steps: 10 });

      // Mid-glide it runs on the shared length and easing, sideways alone.
      const gliding = await page.locator("[data-window-pill]").evaluate((element) => {
        const frame = element.parentElement!;

        return { transition: frame.style.transition, translate: getComputedStyle(frame).translate };
      });

      const [, sideways = "0px"] = gliding.translate === "none" ? [] : gliding.translate.split(" ");

      expect(gliding.transition).toBe("translate var(--bmo-motion-pop) var(--bmo-ease-enter)");
      expect(Math.abs(Number.parseFloat(sideways))).toBeLessThan(1);

      await page.waitForTimeout(600);

      const settled = await rectOf(page, PILL);
      const left = await page.locator("[data-window-pill]").evaluate((element) => ({ transition: element.parentElement!.style.transition, translate: element.parentElement!.style.translate }));

      expect(Math.round(settled.x + settled.width)).toBe(PHONE.width - GUTTER);
      expect(left).toEqual({ transition: "", translate: "" });

      // A keyboard laid over the page's foot never hides it: it comes up inside what is still visible.
      await finger.swipe({ x: settled.x + settled.width / 2, y: settled.y + settled.height / 2 }, { x: 250, y: 640 }, { steps: 10 });
      await page.waitForTimeout(600);
      await page.setViewportSize({ width: PHONE.width, height: PHONE.height - KEYBOARD_PX });
      await page.waitForTimeout(600);

      const raised = await rectOf(page, PILL);

      expect(raised.y + raised.height).toBeLessThanOrEqual(PHONE.height - KEYBOARD_PX - GUTTER + 1);
    } finally {
      await context.close();
    }
  }, TEST_MS);
});

