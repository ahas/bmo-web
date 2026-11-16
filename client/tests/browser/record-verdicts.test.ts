import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, BrowserContext, Request } from "playwright-core";

// A room's page carries each verdict as its mark alone, and an answer's record reads the round's verdicts whole
// by their numbers and the seconds they were written in the first time it opens, so a card stands what the gate
// wrote under its verdict (docs/web.md, the room screen's chip line).
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up, and serves the
// room's page, its round's figures and the verdicts read whole through the page's own routes.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "record-verdicts", password: "fixture-password-3145" };
const CHAT = -9_000_000_000_131;
const NOW = 1_800_000_000;
const DETAIL = "the gate's own words under its verdict";

const message = (messageId: string, fields: Record<string, unknown>) => ({
  chatId: CHAT,
  messageId,
  sentAt: NOW,
  imagePath: null,
  replyToMessageId: null,
  ...fields
});

// A person's question and the answer its round sent.
const MESSAGES = [
  message("9201", { senderId: 11, senderName: "person-a", text: "the question", agent: false, round: null, drafts: null }),
  message("9202", { senderId: 0, senderName: "agent-a", sentAt: NOW + 20, text: "the answer", agent: true, round: "round-a", drafts: null })
];

// The round's verdicts as the page carries them: the turn's own word on the question, and two gates' cards.
const mark = (id: number, messageId: string, stage: string, verdict: string, createdAt: number) => ({ id, chatId: CHAT, messageId, stage, verdict, createdAt, round: "round-a" });
const MARKS = [
  mark(501, "9201", "chat", "REPLY", NOW + 15),
  mark(502, "9201", "people-search", "SKIP: no candidates", NOW + 5),
  mark(503, "9202", "send", "SENT", NOW + 21)
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

async function open(asked: Request[]): Promise<BrowserContext> {
  const context = await browser!.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block", reducedMotion: "reduce" });
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
  await context.route(new RegExp(`/api/rooms/${CHAT}/messages(\\?|$)`), (route) => route.fulfill({ json: { messages: MESSAGES, judgements: MARKS, hasMore: false } }));
  await context.route(new RegExp(`/api/rooms/${CHAT}/round-figures(\\?|$)`), (route) => route.fulfill({ json: { items: [] } }));
  await context.route(new RegExp(`/api/rooms/${CHAT}/judgements\\?`), (route) => {
    asked.push(route.request());

    return route.fulfill({ json: { judgements: MARKS.map((one) => ({ ...one, detail: one.id === 502 ? DETAIL : null, ms: 1_200, roads: [] })) } });
  });

  return context;
}

describe.skipIf(!origin || !touchReady())("an answer's record", () => {
  test("reads its round's verdicts whole as it first opens, and its cards stand what the gate wrote", async () => {
    const asked: Request[] = [];
    const context = await open(asked);
    const page = await context.newPage();

    try {
      await page.goto(`${origin}/rooms/${CHAT}`, { waitUntil: "domcontentloaded" });
      await page.locator("[data-message]").first().waitFor({ timeout: 30_000 });

      // Nothing is read whole until the record is pressed.
      expect(asked).toHaveLength(0);

      await page.locator("[data-message]").getByRole("button", { name: new RegExp(wording("room.label.chip_record")) }).first().click();
      await page.locator("[data-record]").getByText(wording("room.label.verdict_no_candidates")).first().waitFor({ timeout: 20_000 });

      // The cards' marks by their numbers, within the seconds they were written in; the turn's own word is no card.
      const query = new URL(asked[0]!.url()).searchParams;

      expect([query.get("ids"), query.get("from"), query.get("to")]).toEqual(["502,503", String(NOW + 5), String(NOW + 21)]);

      // How long the stage took stands on its card, and what the gate wrote under the verdict stands under 원문.
      expect(await page.locator("[data-record]").innerText()).toContain(wording("common.label.seconds", { n: "1.2" }));
      await page.locator("[data-record] [data-card-original]").first().getByText(wording("common.label.original")).click();
      await page.locator("[data-record]").getByText(DETAIL).waitFor({ timeout: 10_000 });

      // Folded and spread again, nothing is asked twice.
      const press = page.locator("[data-message]").getByRole("button", { name: new RegExp(wording("room.label.chip_record")) }).first();

      await press.click();
      await press.click();
      await page.locator("[data-record]").waitFor({ timeout: 10_000 });
      expect(asked).toHaveLength(1);
    } finally {
      await context.close();
    }
  }, 120_000);
});
