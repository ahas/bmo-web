import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";

import type { Browser } from "playwright-core";
import type { ArchivedMessage, Judgement } from "../../apps/web/shared/types";

// Copying one message from its menu (docs/web.md, 「What a copy holds」): the message and its own verdicts, the
// answer it drew standing as its word alone, and nothing of any other message's words. It drives the console
// tests/support/browser-console.ts stands up, serving the room's page through the page's own route; the suite
// stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "room-copy", password: "fixture-password-2254" };
const ROOM = 43;
const NOW = Math.floor(Date.now() / 1000);

const asked: ArchivedMessage = {
  chatId: ROOM, messageId: "14319", senderId: 7, senderName: "person-b", sentAt: NOW - 120, text: "the question asked", imagePath: null,
  replyToMessageId: null
};
const answer: ArchivedMessage = {
  chatId: ROOM, messageId: "14320", senderId: 0, senderName: "agent-a", sentAt: NOW - 60, text: "the answer's own words", imagePath: null,
  replyToMessageId: "14319", agent: true
};
const verdicts: Judgement[] = [
  { id: 1, chatId: ROOM, messageId: "14319", stage: "people-search", verdict: "SKIP: no candidates", detail: null, createdAt: NOW - 110 },
  { id: 2, chatId: ROOM, messageId: "14319", stage: "chat", verdict: "REPLY: the answer's own words", detail: "the answer's own words", createdAt: NOW - 61 }
];

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

describe.skipIf(!origin || !touchReady())("copying a message", () => {
  test("copies the message and its own verdicts, the answer it drew as its word alone", async () => {
    const context = await browser!.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block", reducedMotion: "reduce", permissions: ["clipboard-read", "clipboard-write"] });
    const at = cookie.indexOf("=");

    await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
    await context.route(new RegExp(`/api/rooms/${ROOM}/messages`), (route) => route.fulfill({ json: { messages: [asked, answer], judgements: verdicts, hasMore: false } }));

    try {
      const page = await context.newPage();

      await page.goto(`${origin}/rooms/${ROOM}`, { waitUntil: "load" });

      const message = page.locator(`[data-message="m${asked.messageId}"]`);

      await message.waitFor({ timeout: 20_000 });
      await message.getByText(asked.text).click({ button: "right" });
      await page.getByRole("menuitem", { name: wording("common.action.copy"), exact: true }).click();

      const copied = await page.evaluate(async () => await navigator.clipboard.readText());

      expect(copied).toContain(`#${asked.messageId}: ${asked.text}`);
      expect(copied).toContain("SKIP: no candidates");
      expect(copied).toMatch(/: REPLY$/m);
      expect(copied).not.toContain(answer.text);
    } finally {
      await context.close();
    }
  }, 90_000);

  test("copies an answer with every chip's content: its draft rounds and its tool calls, read for the copy", async () => {
    const context = await browser!.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block", reducedMotion: "reduce", permissions: ["clipboard-read", "clipboard-write"] });
    const at = cookie.indexOf("=");
    const drafted: ArchivedMessage = {
      ...answer,
      messageId: "14321",
      text: "an answer drafted and checked",
      drafts: { round: "round:7", asked: 1, end: "message", reads: [] },
      actions: { agent: "agent-a", runs: ["run-7"], documents: 0, held: 0, tools: 1, brain: 0, records: [] }
    };
    const rows = [
      { id: 1, number: 1, question: "final", kind: "question", answerChars: 70, changed: false, outcome: "answered", detail: null, ms: 10_939, at: NOW - 50, answer: null, reads: [] },
      { id: 2, number: 2, question: "", kind: "end", answerChars: 0, changed: false, outcome: "message", detail: null, ms: 0, at: NOW - 49, answer: null, reads: [] }
    ];
    const logLine = (id: number, kind: string, fields: Record<string, unknown>) => ({
      id, agent: "agent-a", run: "run-7", chatId: ROOM, at: NOW - 55, kind, name: "bash", tool: { name: "bash", icon: null }, parent: null, ref: "call-7",
      state: null, truncated: false, text: "", patches: [], patchesMore: 0, ...fields
    });

    await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
    await context.route(new RegExp(`/api/rooms/${ROOM}/messages`), (route) => route.fulfill({ json: { messages: [asked, drafted], judgements: verdicts, hasMore: false } }));
    await context.route(new RegExp(`/api/rooms/${ROOM}/drafts`), (route) => route.fulfill({ json: { rows } }));
    await context.route(/\/api\/agents\/agent-a\/log/, (route) =>
      route.fulfill({ json: { lines: [logLine(1, "tool", { text: "ls -la" }), logLine(2, "tool-result", { state: "succeeded", text: "x".repeat(1_234) })], hasMore: false } })
    );

    try {
      const page = await context.newPage();

      await page.goto(`${origin}/rooms/${ROOM}`, { waitUntil: "load" });

      const message = page.locator(`[data-message="m${drafted.messageId}"]`);

      await message.waitFor({ timeout: 20_000 });
      await message.getByText(drafted.text).click({ button: "right" });
      await page.getByRole("menuitem", { name: wording("common.action.copy"), exact: true }).click();
      await page.waitForTimeout(1_000);

      const copied = await page.evaluate(async () => await navigator.clipboard.readText());

      expect(copied).toContain(`#${drafted.messageId}: ${drafted.text}`);
      expect(copied).toContain(wording("room.label.chip_drafts"));
      expect(copied).toContain("final");
      expect(copied).toContain("10,939ms");
      expect(copied).toContain(wording("room.label.chip_tools"));
      expect(copied).toContain(`bash: ${wording("room.label.copy_result_chars", { n: "1,234" })}`);
      expect(copied).not.toContain(asked.text);
    } finally {
      await context.close();
    }
  }, 90_000);
});
