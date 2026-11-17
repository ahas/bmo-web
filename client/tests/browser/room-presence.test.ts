import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, BrowserContext, Page } from "playwright-core";

// Who is here and who writes, as a room draws them (docs/web.md, 「Presence and typing」): the dot on the head's
// picture and on the room's row, the mark on the row while somebody writes, and the line under the box naming them,
// each standing with nothing else moving, at a desk's width and a phone's, and the line still for a reader who asked
// for less motion.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up, and serves
// the stream and the room's members through the page's own routes: one stream holds a person online and writing in
// the room, the other the same room with nobody, and each measure is taken under both.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "room-presence", password: "fixture-password-3124" };
// A group room of the harness; its owner's own chat stands no line, since nobody else writes there.
const CHAT = 44;
const PERSON = 7701;
const NAME = "agent-b";
const WIDTHS = [
  { width: 1280, height: 900, phone: false },
  { width: 360, height: 780, phone: true }
] as const;

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

function frame(event: Record<string, unknown>): string {
  return `event: bot\ndata: ${JSON.stringify(event)}\n\n`;
}

const WHO = { kind: "person", via: "chat-a", personId: PERSON };

// The stream as the console hands it: its run, then what stands of the present.
function stream(present: boolean): string {
  const run = `event: run\ndata: ${JSON.stringify({ run: "presence-run" })}\n\n`;

  if (!present) return run;

  return (
    run +
    frame({ id: null, at: 1, type: "presence", chatId: CHAT, messageId: null, who: WHO, state: "online", lastSeenAt: null }) +
    frame({ id: null, at: 1, type: "typing", chatId: CHAT, messageId: null, who: WHO, on: true, lastsMs: null })
  );
}

async function open(viewport: (typeof WIDTHS)[number], present: boolean, motion: "reduce" | "no-preference" = "reduce"): Promise<BrowserContext> {
  const context = await browser!.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.phone,
    hasTouch: viewport.phone,
    serviceWorkers: "block",
    reducedMotion: motion
  });
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
  await context.route(/\/api\/events(\?|$)/, (route) => route.fulfill({ status: 200, contentType: "text/event-stream", body: stream(present) }));
  await context.route(new RegExp(`/api/rooms/${CHAT}/members$`), (route) =>
    route.fulfill({ json: { members: [{ person: PERSON, name: NAME, status: null, account: null, inConsole: false }], mayLetIn: false } })
  );

  return context;
}

interface Drawn {
  lineHeight: number;
  lineText: string;
  footTop: number;
  menuLeft: number;
  headDot: boolean;
  shimmering: boolean;
}

async function drawn(page: Page): Promise<Drawn> {
  return await page.evaluate(() => {
    const line = document.querySelector<HTMLElement>("[data-typing-line]")!;
    const foot = document.querySelector<HTMLElement>("[data-screen-foot]")!;
    const menu = document.querySelector<HTMLElement>("[data-room-menu]")!;
    const bar = menu.closest<HTMLElement>("[data-title-bar]")!;
    const shimmer = line.querySelector<HTMLElement>("span");

    return {
      lineHeight: line.getBoundingClientRect().height,
      lineText: (line.textContent ?? "").trim(),
      footTop: foot.getBoundingClientRect().top,
      menuLeft: menu.getBoundingClientRect().left,
      headDot: bar.querySelector(".bg-success") !== null,
      shimmering: shimmer !== null && getComputedStyle(shimmer).animationName !== "none"
    };
  });
}

async function visit(context: BrowserContext, present: boolean): Promise<Drawn> {
  const page = await context.newPage();

  await page.goto(`${origin}/rooms/${CHAT}`, { waitUntil: "networkidle" });
  await page.locator("[data-typing-line]").waitFor();

  if (present) await page.locator("[data-typing-line] span").waitFor();

  return await drawn(page);
}

describe.skipIf(!origin || !touchReady())("who is here and who writes in a room", () => {
  for (const viewport of WIDTHS) {
    test(`stand with nothing else moving, ${viewport.width}px`, async () => {
      const quiet = await open(viewport, false);
      const busy = await open(viewport, true);

      try {
        const before = await visit(quiet, false);
        const after = await visit(busy, true);

        expect(before.lineText).toBe("");
        expect(before.headDot).toBe(false);
        expect(after.lineText).toContain(NAME);
        expect(after.headDot).toBe(true);
        expect(after.lineHeight).toBe(20);
        expect(before.lineHeight).toBe(after.lineHeight);
        expect(after.footTop).toBe(before.footTop);
        expect(after.menuLeft).toBe(before.menuLeft);
        expect(after.shimmering).toBe(false);
      } finally {
        await quiet.close();
        await busy.close();
      }
    }, BROWSER_HOOK_MS);
  }

  test("the account's switch turns its presence off and on again, kept as it is switched", async () => {
    const context = await open(WIDTHS[0], false);

    try {
      const page = await context.newPage();
      const shown = async (): Promise<boolean> => ((await (await page.request.get(`${origin}/api/account/presence`)).json()) as { shown: boolean }).shown;

      // The account starts shown whatever an earlier run left.
      expect((await page.request.put(`${origin}/api/account/presence`, { data: { shown: true } })).ok()).toBe(true);
      await page.goto(`${origin}/?settings=account`, { waitUntil: "networkidle" });

      const toggle = page.locator("[data-presence-row] [role=switch]");

      await toggle.waitFor();
      expect(await toggle.getAttribute("aria-checked")).toBe("true");
      expect(await shown()).toBe(true);

      // The switch takes the state the console answered with, so it turns once the change is kept.
      await toggle.click();
      await page.locator("[data-presence-row] [role=switch][aria-checked=false]").waitFor();
      expect(await shown()).toBe(false);

      await toggle.click();
      await page.locator("[data-presence-row] [role=switch][aria-checked=true]").waitFor();
      expect(await shown()).toBe(true);
    } finally {
      await context.close();
    }
  }, BROWSER_HOOK_MS);

  test("the room's row carries the writing mark at a desk's width, and the line shimmers where motion is welcome", async () => {
    const context = await open(WIDTHS[0], true, "no-preference");

    try {
      const page = await context.newPage();

      await page.goto(`${origin}/rooms/${CHAT}`, { waitUntil: "networkidle" });
      await page.locator("[data-typing-line] span").waitFor();

      expect(await page.locator(`a[href$="/rooms/${CHAT}"] [data-room-typing]`).count()).toBe(1);
      expect((await drawn(page)).shimmering).toBe(true);
    } finally {
      await context.close();
    }
  }, BROWSER_HOOK_MS);
});
