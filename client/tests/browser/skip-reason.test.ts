import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { contrast } from "./contrast";
import { shot } from "./shot";
import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";

import type { Browser, BrowserContext, Page, Route } from "playwright-core";
import type { ArchivedMessage, JudgementMark } from "../../apps/web/shared/types";
import KO from "../fixtures/browser/skip-reason.test.ko.json";

// Why a silent turn sent nothing, on the line under the one saying it did not answer, in the owner's own chat at a
// phone's width and a desktop's (docs/web.md, 「A turn the chat agent chose not to answer」):
// - a turn that named a reason stands it, in the reader's language, on a second line of the same faint look, centred
//   under the first, kept inside the screen however long it runs and reading at 4.5:1 or better;
// - two silent turns over one message stand the newer one's reason, and one that named none says so;
// - the passing reason of a silent turn that read nothing of the room carries the room's newest reason the same way;
// - the reason, read once the rows stand, unfolds into place as a list's new item does.
// The room is a fixture this test serves itself through the page's own routes, its reasons as the console's server
// answers them. The console around it is the one given in BMO_CONSOLE_TEST_URL, which tests/support/browser-console.ts
// stands up (docs/checks.md, 「Running the console-driven browser files」); the suite stands up none, so there it
// skips. With SKIP_REASON_SHOTS naming a folder, each width leaves a picture of the room there.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const shots = process.env.SKIP_REASON_SHOTS;
const ACCOUNT = { name: "skip-reason", password: "fixture-password-3444" };
const WIDTHS = [
  { width: 360, height: 780, phone: true },
  { width: 1280, height: 800, phone: false }
];
const TEST_MS = 90_000;

let browser: Browser | null = null;
let cookie = "";
// The owner's own chat, where silent turns stand their lines; the room this test serves; and the sender the owner's
// own words are filed under, so they stand on the right.
let room = 0;
let own = 0;

beforeAll(async () => {
  if (!origin || !touchReady()) return;

  const login = await fetch(`${origin}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(ACCOUNT)
  });

  expect(login.ok).toBe(true);
  cookie = login.headers.get("set-cookie")!.split(";")[0]!;
  const owner = (await (await fetch(`${origin}/api/owner`, { headers: { cookie } })).json()) as { chatId: number | null; senders: number[] };

  room = owner.chatId ?? 1;
  own = owner.senders[0] ?? 1;
  browser = await chromium.launch();
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();
}, BROWSER_HOOK_MS);

const START = Math.floor(Date.now() / 1000) - 600;

function row(id: number, text: string, mine: boolean, at: number): ArchivedMessage {
  return {
    chatId: room,
    messageId: String(id),
    senderId: mine ? own : 0,
    senderName: mine ? ACCOUNT.name : "agent-a",
    sentAt: START + at,
    text,
    imagePath: null,
    replyToMessageId: null,
    agent: !mine
  } as ArchivedMessage;
}

function skipped(id: number, messageId: number, at: number): JudgementMark {
  return { id, chatId: room, messageId: String(messageId), stage: "skipped", verdict: "SKIP", createdAt: START + at };
}

// A message passed over once with a long reason, an answer, and a message passed over twice, the newer naming none.
const rows = (): ArchivedMessage[] => [row(701, KO.asked, true, 0), row(702, KO.answered, false, 60), row(703, KO.thanked, true, 120), row(704, KO.followed, true, 180)];
const marks = (): JudgementMark[] => [skipped(801, 701, 5), skipped(802, 703, 125), skipped(803, 703, 130)];
const REASONS = { "801": { kind: "named", text: KO.reason_long }, "803": { kind: "unnamed" } };

// Whether the live stream has been told to say that a turn ended in silence, once the room stands.
let silent = false;
let said = 0;

async function open(viewport: (typeof WIDTHS)[number], motion: "reduce" | "no-preference" = "reduce"): Promise<BrowserContext> {
  const context = await browser!.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.phone,
    hasTouch: viewport.phone,
    serviceWorkers: "block",
    reducedMotion: motion
  });
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
  await context.route(/\/api\/control$/, (route) => route.fulfill({ json: { reachable: true, ownerChatId: room } }));
  // The stream ends after each answer and is opened again; once the room stands, the next opening tells of a turn that
  // read nothing of the room and ended in silence.
  await context.route(/\/api\/events(\?|$)/, (route) => {
    const event = { id: ++said, at: Date.now(), type: "skipped", chatId: room, messageId: null, verdict: "SKIP", detail: null };
    const told = silent ? `id: ${said}\nevent: bot\ndata: ${JSON.stringify(event)}\n\n` : "";

    silent = false;

    return route.fulfill({ contentType: "text/event-stream", body: `retry: 300\n\nevent: run\ndata: {"run":"fixture"}\n\n${told}` });
  });
  await context.route(/\/api\/rooms$/, (route) =>
    route.fulfill({ json: [{ chatId: room, title: ACCOUNT.name, messageCount: 4, lastMessageAt: START + 180, unread: 0, firstUnread: null, readTo: null }] })
  );
  await context.route(new RegExp(`/api/rooms/${room}/`), answerRoom);

  return context;
}

async function answerRoom(route: Route): Promise<void> {
  const url = new URL(route.request().url());

  if (url.pathname.endsWith("/messages")) {
    const whole = !url.searchParams.has("before") && !url.searchParams.has("after");
    await route.fulfill({ json: { messages: whole ? rows() : [], judgements: whole ? marks() : [], hasMore: false } });
  } else if (url.pathname.endsWith("/skip-reasons")) {
    await route.fulfill({ json: { reasons: Object.fromEntries(Object.entries(REASONS).filter(([id]) => url.searchParams.get("ids")!.split(",").includes(id))) } });
  } else if (url.pathname.endsWith("/skip-reasons/latest")) {
    await route.fulfill({ json: { latest: { id: 900, reason: { kind: "named", text: KO.reason_passing } } } });
  } else if (url.pathname.endsWith("/read")) {
    await route.fulfill({ json: { unread: 0, firstUnread: null, readTo: null } });
  } else {
    await route.fulfill({ status: 404, json: { message: "no such fixture" } });
  }
}

// The room entered from inside the console, as a person goes to it.
async function enter(page: Page): Promise<void> {
  const listed = page.waitForResponse(/\/api\/rooms$/);

  await page.goto(`${origin}/`, { waitUntil: "load" });
  await page.waitForFunction(() => {
    const root: (Element & { __vue_app__?: { $nuxt?: { isHydrating?: boolean } } }) | null = document.querySelector("#__nuxt");

    return root?.__vue_app__?.$nuxt?.isHydrating === false;
  });
  await listed;
  await page.evaluate((path) => {
    const root: (Element & { __vue_app__?: { config: { globalProperties: { $router: { push: (to: string) => Promise<unknown> } } } } }) | null = document.querySelector("#__nuxt");

    void root!.__vue_app__!.config.globalProperties.$router.push(path);
  }, `/rooms/${room}`);
}

interface Line {
  text: string;
  left: number;
  right: number;
  centre: number;
  colour: string;
  size: string;
  clipped: boolean;
}

// Each line of a block of faint lines, as the screen lays it out.
async function linesOf(page: Page, selector: string): Promise<Line[]> {
  return await page.locator(selector).evaluate((block) =>
    [...block.querySelectorAll("p")].map((line) => {
      const box = line.getBoundingClientRect();
      const style = getComputedStyle(line);

      return {
        text: line.textContent?.trim() ?? "",
        left: box.left,
        right: box.right,
        centre: box.left + box.width / 2,
        colour: style.color,
        size: style.fontSize,
        clipped: line.scrollWidth > line.clientWidth
      };
    })
  );
}

function holdsTogether(lines: readonly Line[], width: number): void {
  const [said, why] = lines;

  expect(why!.colour).toBe(said!.colour);
  expect(why!.size).toBe(said!.size);
  expect(Math.abs(why!.centre - said!.centre)).toBeLessThanOrEqual(1);
  expect(why!.left).toBeGreaterThanOrEqual(0);
  expect(why!.right).toBeLessThanOrEqual(width);
  expect(why!.clipped).toBe(false);
}

describe.skipIf(!origin || !touchReady())("a silent turn's reason", () => {
  for (const viewport of WIDTHS) {
    test(`stands under its line, in the same look, at ${viewport.width} px`, async () => {
      const context = await open(viewport);
      const page = await context.newPage();

      try {
        await enter(page);

        const once = page.locator('[data-skipped="m701"] [data-skip-reason]');
        const twice = page.locator('[data-skipped="m703"] [data-skip-reason]');

        await once.waitFor({ timeout: 20_000 });
        await twice.waitFor({ timeout: 20_000 });

        const first = await linesOf(page, '[data-skipped="m701"]');
        const second = await linesOf(page, '[data-skipped="m703"]');

        expect(first[1]!.text).toBe(wording("room.status.outcome_skipped_reason", { reason: KO.reason_long }));
        expect(second[1]!.text).toBe(wording("room.status.outcome_skipped_reason_none"));
        holdsTogether(first, viewport.width);
        holdsTogether(second, viewport.width);

        // A turn that read nothing of the room passes, and its reason stands under the passing line.
        silent = true;

        const passing = page.locator("[data-passing]");

        await passing.locator("[data-skip-reason]").waitFor({ timeout: 20_000 });

        const passed = await linesOf(page, "[data-passing]");

        expect(passed[1]!.text).toBe(wording("room.status.outcome_skipped_reason", { reason: KO.reason_passing }));
        holdsTogether(passed, viewport.width);

        // Every faint line, the reasons among them, reads at 4.5:1 or better on the ground under it.
        expect((await contrast(page, "[data-skipped] p, [data-passing] p")).filter((one) => one.ratio < 4.5)).toEqual([]);

        if (shots) await shot(page, `${shots}/skip-reason-${viewport.width}`);
      } finally {
        await context.close();
      }
    }, TEST_MS);
  }

  test("unfolds into place under its line when it is read after the rows", async () => {
    const context = await open(WIDTHS[1]!, "no-preference");
    const page = await context.newPage();

    // The entering lasts one unfold, shorter than a locator's wait between its looks, so the page itself notes the
    // moment the line stands entering, from before the app loads.
    await page.addInitScript(() => {
      new MutationObserver((_, observer) => {
        if (document.querySelector('[data-skipped="m701"] [data-skip-reason].bmo-list-enter-active') === null) return;

        document.documentElement.dataset.reasonUnfolded = "";
        observer.disconnect();
      }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
    });

    try {
      await enter(page);
      // The line comes in as a list item does, its height unfolding from nothing (the moving list's own entering).
      await page.locator("html[data-reason-unfolded]").waitFor({ state: "attached", timeout: 20_000 });
    } finally {
      await context.close();
    }
  }, TEST_MS);
});
