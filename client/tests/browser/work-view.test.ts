import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";

import type { Browser, BrowserContext, Route } from "playwright-core";
import type { AgentLogLine, AgentLogPage, ArchivedMessage, JobLine, LiveRun, StatusView, TodoBoard, TodoItem, WorkOrderView, WorkTask } from "../../apps/web/shared/types";
import type { DraftRead, DraftRow } from "../../apps/web/shared/drafting";

// The work view and what stands in it, as the browser lays it out (docs/web.md, 「The work view」, 「A tool call」,
// 「The progress stepper」, the TODO modal's tabs and the room screen's brain, tool and draft chips): a worker's
// screen stands its job's work order, its figures, its stages and its flat log, a tool call is one block with its
// command whole and its result folded past five lines, a work order's stages hold their sub-stages and open the stage
// dialog with no tab row, the item's tabs stand in one order at both widths, and a round's draft answers and its
// actions across every run of the round stand whole. It drives the console tests/support/browser-console.ts stands
// up, serving what each place reads through the page's own routes; the suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "work-view", password: "fixture-password-2311" };
const AGENT = "worker";
const ITEM = 1;
const CHAT = 42;
const NOW = Math.floor(Date.now() / 1000);
const WIDTHS = [
  { width: 1280, height: 900, phone: false },
  { width: 360, height: 780, phone: true }
] as const;

const RUN: LiveRun = {
  id: 1, kind: "worker", agent: AGENT, chatId: null, messageId: null, startedAt: NOW - 600, unit: "run-b", capSeconds: null,
  depth: null, model: null, startedBy: null, todoId: ITEM, progress: null, stop: { kind: "item", id: String(ITEM) }
};

function line(id: number, run: string, kind: AgentLogLine["kind"], text: string, over: Partial<AgentLogLine> = {}): AgentLogLine {
  return { id, agent: AGENT, run, chatId: null, at: NOW - 500 + id, kind, name: null, tool: null, parent: null, ref: null, state: null, truncated: false, text, patches: [], patchesMore: 0, ...over };
}

const SEARCH = Array.from({ length: 8 }, (_, index) => `src/file-${index}.ts:${index + 1}:const value = ${index};`).join("\n");

const LOG: AgentLogPage = {
  lines: [
    line(1, "run-b", "start", "model-b"),
    line(2, "run-b", "tool", JSON.stringify({ command: "rg -n value src", description: "Find every value" }), { name: "Bash", tool: { name: "Bash", icon: null }, ref: "c1" }),
    line(3, "run-b", "tool-result", SEARCH, { name: "Bash", tool: { name: "Bash", icon: null }, ref: "c1", state: "succeeded" }),
    line(4, "run-b", "tool", JSON.stringify({ file_path: "/srv/checkouts/worker/src/a.ts" }), { name: "Read", tool: { name: "Read", icon: null }, ref: "c2" }),
    line(5, "run-b", "tool-result", "export const a = 1;", { name: "Read", tool: { name: "Read", icon: null }, ref: "c2", state: "succeeded" }),
    line(6, "run-b", "text", "working on it"),
    // Enough after it that the log runs well past the height of the screen.
    ...Array.from({ length: 30 }, (_, index) => [
      line(7 + index * 2, "run-b", "tool", JSON.stringify({ command: `echo ${index}`, description: `Step ${index}` }), { name: "Bash", tool: { name: "Bash", icon: null }, ref: `s${index}` }),
      line(8 + index * 2, "run-b", "tool-result", `out ${index}`, { name: "Bash", tool: { name: "Bash", icon: null }, ref: `s${index}`, state: "succeeded" })
    ]).flat()
  ],
  hasMore: false
};

const JOB: JobLine = { run: "run-b", agent: "worker-b", todoId: ITEM, title: "item-title", purpose: null, startedAt: NOW - 600, finishedAt: null, tools: 2, models: [] };

function task(id: string, state: WorkTask["state"], over: Partial<WorkTask> = {}): WorkTask {
  return { id, title: `task-${id}`, role: "scout", model: "model-a", instruction: `instruction-${id}`, state, attempt: 1, unit: null, jobId: null, startedAt: null, result: null, artifact: null, error: null, ...over };
}

const ORDER: WorkOrderView = {
  todoId: ITEM, intent: "intent", instruction: "instruction", status: "active", phase: "implementation", stage: 1,
  stages: [{ title: "stage-one", tasks: [task("s1", "done", { startedAt: (NOW - 3_000) * 1000, jobId: 11, unit: "unit-s1" }), task("s2", "done", { startedAt: (NOW - 2_990) * 1000, jobId: 12, unit: "unit-s2" })] }],
  tasks: [task("b1", "done", { role: "builder", startedAt: (NOW - 2_000) * 1000, jobId: 13 }), task("b2", "running", { role: "builder", startedAt: (NOW - 600) * 1000, jobId: 14 })],
  history: [], control: null, worker: AGENT, cwd: "/srv/checkouts/worker", chatId: CHAT, model: "auto", error: null, updatedAt: NOW,
  ended: { s1: NOW - 2_500, s2: NOW - 2_400, b1: NOW - 1_000 }
};

function item(): TodoItem {
  return {
    id: ITEM, title: "item-title", instruction: "item-instruction", requester: "Owner", requesterId: CHAT, chatId: CHAT, approved: true, awaitingApproval: false, recommended: false, done: false,
    running: true, worker: null, cowork: true, priority: 1, status: "running", model: null, agent: null, ranOn: null, note: null, reports: [], unfinished: null,
    rejections: 0,
    unfinishedResolvedAt: null, unfinishedResolution: null, brief: null, heldAt: null, heldReason: null, heldKind: null,
    mergedInto: null, mergedAt: null, mergedIntoTitle: null, mergedFrom: [], attempts: 1, progress: null, stopped: null, holding: null, waiting: null,
    deployWaits: false, closing: null, holdPending: false, orderActive: true, seconds: null, spans: [], createdAt: NOW - 4_000, doneAt: null
  };
}

// An answer of the chat agent whose round ran two turns of its session, a call in each, one of them reading the brain,
// and whose draft process wrote one question's answer.
const ANSWER_ID = 9_001;
const ANSWER: ArchivedMessage = {
  chatId: CHAT, messageId: ANSWER_ID, senderId: 0, senderName: "agent-a", sentAt: NOW - 100, text: "the answer", imagePath: null,
  replyToMessageId: null, agent: true, round: "round-a",
  drafts: { round: "round-a", asked: 1, end: "message", reads: [] },
  actions: { agent: "agent-a", runs: ["turn-a", "question-a"], documents: 0, held: 0, tools: 2, brain: 1, records: [] }
};
const DRAFT_ANSWER = "the whole notes of the first question, as written";
const DRAFT_ROWS: DraftRow[] = [
  { id: 1, number: 1, question: "information", kind: "question", answerChars: DRAFT_ANSWER.length, changed: false, outcome: "answered", detail: null, ms: 1_000, at: NOW - 200, answer: DRAFT_ANSWER, reads: [] },
  { id: 2, number: 2, question: "", kind: "end", answerChars: 0, changed: false, outcome: "message", detail: null, ms: 0, at: NOW - 150, answer: null, reads: [] }
];
const RUN_LINES: Record<string, AgentLogLine[]> = {
  "turn-a": [line(21, "turn-a", "tool", JSON.stringify({ command: "ls" }), { agent: "agent-a", name: "bash", tool: { name: "bash", icon: null }, ref: "r1" })],
  "question-a": [line(22, "question-a", "tool", JSON.stringify({ query: "who" }), { agent: "agent-a", name: "mcp__bmo__brain_recall", tool: { name: "brain_recall", icon: null }, ref: "r2" })]
};

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

async function open(viewport: (typeof WIDTHS)[number]): Promise<BrowserContext> {
  const context = await browser!.newContext({ viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.phone, hasTouch: viewport.phone, serviceWorkers: "block", reducedMotion: "reduce" });
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
  await context.route(/\/api\/status$/, async (route) => {
    const status = (await (await route.fetch()).json()) as StatusView;

    await route.fulfill({ json: { ...status, live: [RUN] } });
  });
  await context.route(new RegExp(`/api/agents/${AGENT}/log(\\?|$)`), (route) => route.fulfill({ json: LOG }));
  await context.route(new RegExp(`/api/agents/${AGENT}/job(\\?|$)`), (route) => route.fulfill({ json: { job: JOB } }));
  await context.route(new RegExp(`/api/agents/${AGENT}/job-prompt(\\?|$)`), (route) => route.fulfill({ json: { prompt: { text: "prompt-ko", english: null } } }));
  await context.route(/\/api\/agents\/agent-a\/log\?/, (route: Route) => {
    const run = new URL(route.request().url()).searchParams.get("run") ?? "";

    return route.fulfill({ json: { lines: RUN_LINES[run] ?? [], hasMore: false } });
  });
  await context.route(/\/api\/todos(\?|$)/, async (route) => {
    if (route.request().method() !== "GET") return await route.continue();

    const board = (await (await route.fetch()).json()) as TodoBoard;

    await route.fulfill({ json: { ...board, queue: [item()], standing: { ...board.standing, queue: 1, running: 1 } } });
  });
  await context.route(new RegExp(`/api/todos/${ITEM}$`), (route) => route.fulfill({ json: item() }));
  await context.route(new RegExp(`/api/todos/${ITEM}/work-order$`), async (route) => {
    if (route.request().method() !== "GET") return await route.continue();

    await route.fulfill({ json: ORDER });
  });
  await context.route(new RegExp(`/api/rooms/${CHAT}/messages`), (route) => route.fulfill({ json: { messages: [ANSWER], judgements: [], hasMore: false } }));
  await context.route(new RegExp(`/api/rooms/${CHAT}/drafts`), (route) => route.fulfill({ json: { rows: DRAFT_ROWS } }));

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

describe.skipIf(!origin || !touchReady())("the work view", () => {
  for (const viewport of WIDTHS) {
    test(`a worker's screen stands its work order, figures, stages and a flat log, ${viewport.width}px wide`, async () => {
      const context = await open(viewport);

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/agents/${AGENT}`, { waitUntil: "load" });
        await page.locator("[data-tool-call]").nth(1).waitFor({ timeout: 20_000 });

        // The job's prompt is read after the log, so it is waited for rather than read the moment the log stands.
        expect(await until(async () => await page.locator("[data-work-order]").innerText(), (text) => text.includes("prompt-ko"))).toContain("prompt-ko");
        expect(await page.locator("li[data-step]").count()).toBe(0);
        expect(await page.locator("[data-agent-log]").count()).toBe(1);

        // The head stays at the top of the page's body however far its log is scrolled, the log opening at its end.
        const standing = async () =>
          await page.locator("[data-work-head]").evaluate((head) => {
            let box = head.parentElement;

            while (box !== null && !/(auto|scroll)/.test(getComputedStyle(box).overflowY)) box = box.parentElement;

            return { head: Math.round(head.getBoundingClientRect().top), box: Math.round(box?.getBoundingClientRect().top ?? -1), scrolled: (box?.scrollTop ?? 0) > 0 };
          });

        expect(await until(standing, (one) => one.scrolled)).toMatchObject({ scrolled: true });

        const held = await standing();

        expect(held.head).toBe(held.box);

        // The stages of the job's co-work order, a running one among them.
        const stepper = page.locator("[data-stage-stepper]");

        await stepper.waitFor({ timeout: 10_000 });
        expect(await stepper.locator("[data-stage]").evaluateAll((all) => all.map((one) => one.getAttribute("data-stage")))).toEqual(["done", "done", "running"]);
        expect(await stepper.locator("[data-substage]").count()).toBe(2);

        // A call is one block: its description on top, its command whole under the prompt, no JSON of it.
        const search = page.locator("[data-tool-call]").first();
        const text = await search.innerText();

        expect(text.split("\n")[0]).toContain("Find every value");
        expect(await search.locator("[data-tool-command]").innerText()).toBe("rg -n value src");
        expect(text).toContain("❯");
        expect(text).not.toContain('{"');

        // Its result stands five lines and the press that spreads the other three, which folds them back.
        const result = search.locator("[data-tool-result]");

        expect((await result.innerText()).match(/src\/file-\d\.ts/g)?.length).toBe(5);

        const more = result.getByRole("button", { name: wording("agents.label.result_more", { n: "3" }) });

        await more.click();
        expect(await until(async () => (await result.innerText()).match(/src\/file-\d\.ts/g)?.length ?? 0, (n) => n === 8)).toBe(8);
        await result.getByRole("button", { name: wording("agents.label.result_less") }).click();
        expect(await until(async () => (await result.innerText()).match(/src\/file-\d\.ts/g)?.length ?? 0, (n) => n === 5)).toBe(5);
      } finally {
        await context.close();
      }
    }, 90_000);

    test(`the item's tabs stand in one order and a sub-stage opens its stage with no tab row, ${viewport.width}px wide`, async () => {
      const context = await open(viewport);

      try {
        const page = await context.newPage();

        // The item is opened by its number in the address, as a notification opens one.
        await page.goto(`${origin}/agents/${AGENT}?todo=${ITEM}`, { waitUntil: "load" });

        const dialog = page.getByRole("dialog").filter({ has: page.locator("[data-stage-stepper]") }).last();

        await dialog.locator("[data-stage-stepper]").waitFor({ timeout: 15_000 });

        const tabs = (await dialog.getByRole("tab").allInnerTexts()).map((one) => one.trim());

        expect(tabs).toEqual(["todo.label.field_state", "todo.label.field_instruction", "todo.label.request_text", "todo.label.discussion", "todo.label.manage"].map((key) => wording(key)));
        expect(await dialog.getByRole("tab", { selected: true }).first().innerText()).toContain(wording("todo.label.field_state"));

        await dialog.locator("[data-substage]").nth(1).click();

        const stage = page.getByRole("dialog").filter({ hasText: "task-s2" }).last();

        await stage.waitFor({ timeout: 10_000 });
        expect(await stage.getByRole("tablist").count()).toBe(0);
        // The work order stands on one line in the head, spread whole when pressed.
        await stage.locator("[data-work-order-toggle]").click();
        expect(await stage.locator("[data-work-order]").innerText()).toContain("instruction-s2");
      } finally {
        await context.close();
      }
    }, 90_000);

    test(`a round's draft answers stand whole and its calls are read from every run, ${viewport.width}px wide`, async () => {
      const context = await open(viewport);

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/rooms/${CHAT}`, { waitUntil: "load" });

        const message = page.locator(`[data-message="m${ANSWER_ID}"]`);

        await message.waitFor({ timeout: 20_000 });

        await message.getByRole("button", { name: new RegExp(wording("room.label.chip_drafts")) }).click();
        // A round's answer spreads under its line on a press of the line.
        await message.locator("[data-draft-round] button").first().click();
        await message.locator("[data-draft-answer]").first().waitFor({ timeout: 10_000 });
        expect(await message.locator("[data-draft-answer]").first().innerText()).toContain(DRAFT_ANSWER);

        await message.getByRole("button", { name: new RegExp(wording("room.label.chip_tools")) }).click();
        expect(await until(async () => await message.getByText(/brain_recall|ls/).count(), (n) => n >= 2)).toBeGreaterThanOrEqual(2);

        await message.getByRole("button", { name: new RegExp(wording("room.label.chip_brain")) }).click();
        expect(await until(async () => await message.getByText("brain_recall").count(), (n) => n >= 2)).toBeGreaterThanOrEqual(2);
      } finally {
        await context.close();
      }
    }, 90_000);

    test(`what a round's end names as read stands in the brain chip as a diff of new and held, and in the draft spread, ${viewport.width}px wide`, async () => {
      const context = await open(viewport);
      const reads: DraftRead[] = [
        { path: "core/facts.md", holds: "core facts", how: "attached" },
        { path: "notes/today.md", holds: null, how: "read" },
        { path: "people/index.md", holds: "people", how: "held" }
      ];

      await context.route(new RegExp(`/api/rooms/${CHAT}/messages`), (route) =>
        route.fulfill({ json: { messages: [{ ...ANSWER, drafts: { ...ANSWER.drafts!, reads } }], judgements: [], hasMore: false } })
      );
      await context.route(new RegExp(`/api/rooms/${CHAT}/drafts`), (route) =>
        route.fulfill({ json: { rows: DRAFT_ROWS.map((row) => (row.kind === "end" ? { ...row, reads } : row)) } })
      );

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/rooms/${CHAT}`, { waitUntil: "load" });

        const message = page.locator(`[data-message="m${ANSWER_ID}"]`);

        await message.waitFor({ timeout: 20_000 });
        await message.getByRole("button", { name: new RegExp(wording("room.label.chip_brain")) }).click();

        // The chip stands what the session held, then what the round read new as a plus.
        expect((await message.locator("[data-brain-figure]").innerText()).replace(/\s/g, "")).toMatch(/^1\+\d+$/);

        const spread = message.locator("[data-brain-reads]").first();

        await spread.waitFor({ timeout: 10_000 });
        // One list read like a diff: what was read new first, as added lines, then what was held, plain.
        const fresh = await spread.locator('[data-brain-read="new"]').allInnerTexts();

        expect(fresh.map((one) => one.replace(/^\+\s*/, "").trim())).toEqual(["core facts", "notes/today.md"]);
        expect(await spread.locator('[data-brain-read="held"]').innerText()).toContain("people");
        // The brain call the log holds follows the pieces.
        expect(await until(async () => await message.getByText("brain_recall").count(), (n) => n >= 1)).toBeGreaterThanOrEqual(1);

        await message.getByRole("button", { name: new RegExp(wording("room.label.chip_drafts")) }).click();
        await message.locator("[data-draft-reads]").first().waitFor({ timeout: 10_000 });
        expect(await message.locator("[data-draft-reads] [data-brain-read]").count()).toBe(3);
      } finally {
        await context.close();
      }
    }, 90_000);
  }
});
