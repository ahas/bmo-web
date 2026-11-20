import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { contrast } from "./contrast";
import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";

import type { Browser, BrowserContext, Page } from "playwright-core";

declare global {
  interface Window {
    // Hands the played stream one of the agency's events, as the console's relay writes it.
    playAgency: (data: unknown) => void;
  }
}

// A supervisor's background work in the room's list of what waits (docs/web.md, the room screen's list of what waits):
// a subagent still running after the turn that launched it stands as a line of its own — its kind's word, the description it
// was launched with, the supervisor and since when — and it leaves the open list once the agency says it ended, without
// a reload and before the minute's read: the lines left close up and the list stays open, and the last line's end closes
// the list and takes its button away. Read at a desk's width and a phone's, where the list opens from the room's menu,
// in the light theme and the dark, every word of a line at 4.5:1 or better on the list's ground.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up, serves the
// room's list through the page's own route, and plays the tab's event stream, so the agency's word reaches the tab when
// the test says it.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "room-head", password: "fixture-password-3051" };
const CHAT = 42;
const DESCRIPTION = "Fetch the model files and compare their checksums";
const COMMAND = "sleep 30 && make check";
const WIDTHS = [
  { width: 1280, height: 900, phone: false },
  { width: 360, height: 780, phone: true }
] as const;
const SCHEMES = ["light", "dark"] as const;

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
  // When the subagent was launched, in epoch milliseconds.
  launchedAt: number;
  // A task's work ended: the list answers without it from now on.
  end: (task: string) => void;
}

// The room with a subagent and a shell command running, and the tab's stream played: it opens, names its run and then says nothing until
// the test hands it an agency event through `window.playAgency`.
async function open(viewport: (typeof WIDTHS)[number], scheme: (typeof SCHEMES)[number]): Promise<Room> {
  const context = await browser!.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.phone,
    hasTouch: viewport.phone,
    colorScheme: scheme,
    serviceWorkers: "block",
    reducedMotion: "reduce"
  });
  const at = cookie.indexOf("=");
  const launchedAt = Date.now() - 120_000;
  const ended = new Set<string>();
  let reads = 0;

  await context.addCookies([
    { name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! },
    { name: "console_auto_translate", value: "false", url: origin! },
    { name: "nuxt-color-mode", value: scheme, url: origin! }
  ]);
  await context.route(new RegExp(`/api/rooms/${CHAT}/background$`), async (route) => {
    reads += 1;
    await route.fulfill({
      json: {
        calls: [
          { id: "background-work:a1", kind: "subagent", tool: "subagent", note: DESCRIPTION, everySeconds: null, until: null, agent: "agent-a", startedAt: launchedAt },
          { id: "background-work:b2", kind: "shell", tool: "shell", note: COMMAND, everySeconds: null, until: null, agent: "agent-a", startedAt: launchedAt + 60_000 }
        ].filter((call) => !ended.has(call.id.replace("background-work:", "")))
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
        window.playAgency = (data) => this.dispatchEvent(new MessageEvent("agency", { data: JSON.stringify(data) }));
      }

      close(): void {
        this.readyState = 2;
      }
    }

    window.EventSource = new Proxy(Real, {
      construct: (target, [url, init]: [string | URL, EventSourceInit?]) => (String(url).includes("/api/events") ? new Played(String(url)) : new target(url, init))
    });
  });

  return { context, reads: () => reads, launchedAt, end: (task) => void ended.add(task) };
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
    if (phone) await page.getByRole("menuitem", { name: wording("room.label.background_count", { n: "2" }), exact: true }).click({ timeout: 10_000 }).catch(() => undefined);
    await line.first().waitFor({ timeout: 5_000 }).catch(() => undefined);
  }

  await line.first().waitFor({ timeout: 5_000 });
}

describe.skipIf(!origin || !touchReady())("a supervisor's background work in the room", () => {
  for (const viewport of WIDTHS) {
    for (const scheme of SCHEMES) {
      test(`stands running work with its description and start, and lets each go as the agency says it ended, ${viewport.width}px wide, ${scheme}`, async () => {
        const room = await open(viewport, scheme);
        const page = await room.context.newPage();

        try {
          await page.goto(`${origin}/rooms/${CHAT}`, { waitUntil: "load" });
          await openList(page, viewport.phone);

          const line = page.locator("[data-room-background-list] li");

          expect(await line.count()).toBe(2);
          expect(await line.evaluateAll((lines) => lines.map((one) => one.getAttribute("data-background-kind")))).toEqual(["subagent", "shell"]);

          // Each part of the line as it reads: the head's words, what it is and whose it is, then the note and the foot.
          const parts = await line.first().evaluate((entry) => {
            const read = (part: Element | null) => ({ text: (part as HTMLElement | null)?.innerText.trim() ?? "", size: part === null ? "" : getComputedStyle(part).fontSize });
            const head = entry.querySelector(":scope > span");

            return {
              // The gap inside one line and the gap between two lines.
              gaps: [getComputedStyle(entry).rowGap, getComputedStyle(entry.parentElement!).rowGap],
              head: [...(head?.children ?? [])].map(read),
              note: read(entry.querySelector("[data-background-note]")),
              foot: read(entry.querySelector(":scope > span:last-child"))
            };
          });
          expect(parts.head.map((part) => part.text)).toEqual([wording("room.label.background_subagent"), "agent-a"]);
          expect(parts.note.text).toBe(DESCRIPTION);
          // The moment it was launched, on the clock the console shows every time in.
          const clock = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(room.launchedAt);

          expect(parts.foot.text).toBe(wording("room.message.background_since", { time: clock }));
          // Every line of the entry is drawn at the caption size, 14px.
          expect([...parts.head, parts.note, parts.foot].map((part) => part.size)).toEqual(["14px", "14px", "14px", "14px"]);
          expect(parts.gaps).toEqual(["4px", "8px"]);
          expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(scheme === "dark");
          for (const read of await contrast(page, "[data-room-background-list] li > span > span, [data-background-note], [data-room-background-list] li > span:last-child")) {
            expect({ text: read.text, enough: read.ratio >= 4.5 }).toEqual({ text: read.text, enough: true });
          }
          // A shell command launched with a command stands it whole as its note, wrapped rather than cut.
          expect(await line.nth(1).locator("[data-background-note]").innerText()).toBe(COMMAND);

          // The agency's word that a task ended, for this room, reads the list again at once.
          const ends = async (task: string): Promise<void> => {
            room.end(task);
            await page.evaluate(
              ({ chatId, task }) =>
                window.playAgency({
                  id: 9,
                  kind: "background-work.ended",
                  at: Date.now(),
                  data: { task, kind: "subagent", description: "", command: null, roomId: chatId, agentName: "agent-a", launchedAt: Date.now() - 120_000, status: "completed" }
                }),
              { chatId: CHAT, task }
            );
          };
          const before = room.reads();

          // The subagent's end takes its line away and leaves the list open on the shell command's.
          await ends("a1");
          await page.waitForFunction(() => document.querySelectorAll("[data-room-background-list] li").length === 1, null, { timeout: 15_000 });
          expect(room.reads()).toBeGreaterThan(before);
          expect(await line.getAttribute("data-background-kind")).toBe("shell");
          expect(await line.isVisible()).toBe(true);
          if (!viewport.phone) expect(await page.locator("[data-room-background]").getAttribute("aria-label")).toBe(wording("room.aria.background_open", { n: "1" }));

          // The last line's end closes the list, and its button goes.
          await ends("b2");
          await line.waitFor({ state: "detached", timeout: 15_000 });
          await page.locator("[data-room-background]").waitFor({ state: "detached", timeout: 15_000 });
        } finally {
          await room.context.close();
        }
      }, 120_000);
    }
  }
});
