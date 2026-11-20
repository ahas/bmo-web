import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";

import type { Browser, BrowserContext, Page } from "playwright-core";

// A supervisor's background work in the room's list of what waits (docs/web.md, the room screen's list of what waits):
// a subagent still running after the turn that launched it stands as a line of its own — its kind's word, the description it
// was launched with, the supervisor and since when — and it leaves the open list once the agency says it ended, without
// a reload and before the minute's read. Read at a desk's width and a phone's, where the list opens from the room's menu.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up, serves the
// room's list through the page's own route, and plays the tab's event stream, so the agency's word reaches the tab when
// the test says it.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "room-head", password: "fixture-password-3051" };
const CHAT = 42;
const DESCRIPTION = "Fetch the model files and compare their checksums";
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

interface Room {
  context: BrowserContext;
  // How many times the page read the room's list.
  reads: () => number;
  // The subagent's work ended: the list answers without it from now on.
  end: () => void;
}

// The room with one subagent running, and the tab's stream played: it opens, names its run and then says nothing until
// the test hands it an agency event through `window.playAgency`.
async function open(viewport: (typeof WIDTHS)[number]): Promise<Room> {
  const context = await browser!.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.phone,
    hasTouch: viewport.phone,
    serviceWorkers: "block",
    reducedMotion: "reduce"
  });
  const at = cookie.indexOf("=");
  const launchedAt = Date.now() - 120_000;
  let ended = false;
  let reads = 0;

  await context.addCookies([
    { name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! },
    { name: "console_auto_translate", value: "false", url: origin! }
  ]);
  await context.route(new RegExp(`/api/rooms/${CHAT}/background$`), async (route) => {
    reads += 1;
    await route.fulfill({
      json: {
        calls: ended
          ? []
          : [{ id: "background-work:a1", kind: "subagent", tool: "subagent", note: DESCRIPTION, everySeconds: null, until: null, agent: "agent-a", startedAt: launchedAt }]
      }
    });
  });
  await context.addInitScript(() => {
    const Real = window.EventSource;

    // The tab's one event stream, in the frames the console's relay writes.
    class Played extends EventTarget {
      readonly url: string;
      readyState = 0;

      constructor(url: string) {
        super();
        this.url = url;
        setTimeout(() => {
          this.readyState = 1;
          this.dispatchEvent(new Event("open"));
          this.dispatchEvent(new MessageEvent("run", { data: JSON.stringify({ run: "run-a" }) }));
          this.dispatchEvent(new MessageEvent("job-run", { data: JSON.stringify({ run: "job-run-a" }) }));
          setInterval(() => this.dispatchEvent(new MessageEvent("keep", { data: "{}" })), 5_000);
        }, 50);
        (window as unknown as { playAgency: (data: unknown) => void }).playAgency = (data) => this.dispatchEvent(new MessageEvent("agency", { data: JSON.stringify(data) }));
      }

      close(): void {
        this.readyState = 2;
      }
    }

    window.EventSource = new Proxy(Real, {
      construct: (target, [url, init]: [string | URL, EventSourceInit?]) => (String(url).includes("/api/events") ? new Played(String(url)) : new target(url, init))
    });
  });

  return { context, reads: () => reads, end: () => (ended = true) };
}

// The list opened, from its own button on a wide screen and from the room's menu on a phone; a press made before the
// page's handlers land is lost, so it is opened again a bounded number of times.
async function openList(page: Page, phone: boolean): Promise<void> {
  const opener = phone ? page.locator("[data-title-bar] [data-room-menu]") : page.locator("[data-room-background]");
  const line = page.locator("[data-room-background-list] li");

  await opener.waitFor({ timeout: 30_000 });

  for (let tries = 0; tries < 3 && !(await line.first().isVisible()); tries += 1) {
    if (tries > 0) await page.keyboard.press("Escape");
    await opener.click().catch(() => undefined);
    if (phone) await page.getByRole("menuitem", { name: wording("room.label.background_count", { n: "1" }), exact: true }).click({ timeout: 10_000 }).catch(() => undefined);
    await line.first().waitFor({ timeout: 5_000 }).catch(() => undefined);
  }

  await line.first().waitFor({ timeout: 5_000 });
}

describe.skipIf(!origin || !touchReady())("a supervisor's background work in the room", () => {
  for (const viewport of WIDTHS) {
    test(`stands a running subagent with its description and start, and lets it go as the agency says it ended, ${viewport.width}px wide`, async () => {
      const room = await open(viewport);
      const page = await room.context.newPage();

      try {
        await page.goto(`${origin}/rooms/${CHAT}`, { waitUntil: "load" });
        await openList(page, viewport.phone);

        const line = page.locator("[data-room-background-list] li");

        expect(await line.count()).toBe(1);
        expect(await line.getAttribute("data-background-kind")).toBe("subagent");

        // Each part of the line as it reads: the head's words, what it is and whose it is, then the note and the foot.
        const parts = await line.evaluate((entry) => {
          const read = (part: Element | null) => ({ text: (part as HTMLElement | null)?.innerText.trim() ?? "", size: part === null ? "" : getComputedStyle(part).fontSize });
          const head = entry.querySelector(":scope > span");

          return {
            head: [...(head?.children ?? [])].map(read),
            note: read(entry.querySelector("[data-background-note]")),
            foot: read(entry.querySelector(":scope > span:last-child"))
          };
        });
        const since = wording("room.message.background_since", { time: "" });

        expect(parts.head.map((part) => part.text)).toEqual([wording("room.label.background_subagent"), "agent-a"]);
        expect(parts.note.text).toBe(DESCRIPTION);
        expect(parts.foot.text).toMatch(new RegExp(`^\\d{1,2}:\\d{2}${since}$`));
        // Every line of the entry is drawn at the caption size, 14px.
        expect([...parts.head, parts.note, parts.foot].map((part) => part.size)).toEqual(["14px", "14px", "14px", "14px"]);

        // The agency's word that the work ended, for this room, reads the list again at once.
        const before = room.reads();

        room.end();
        await page.evaluate(
          ({ chatId, description }) =>
            (window as unknown as { playAgency: (data: unknown) => void }).playAgency({
              id: 9,
              kind: "background-work.ended",
              at: Date.now(),
              data: { task: "a1", kind: "subagent", description, command: null, roomId: chatId, agentName: "agent-a", launchedAt: Date.now() - 120_000, status: "completed" }
            }),
          { chatId: CHAT, description: DESCRIPTION }
        );
        await page.locator("[data-room-background-list] li").waitFor({ state: "detached", timeout: 15_000 });

        expect(room.reads()).toBeGreaterThan(before);
        expect(await page.locator("[data-room-background]").count()).toBe(0);
      } finally {
        await room.context.close();
      }
    }, 120_000);
  }
});
