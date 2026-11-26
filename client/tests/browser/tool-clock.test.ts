import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";

import type { Browser, BrowserContext, Route } from "playwright-core";
import type { AgentLogClock, AgentLogLine, AgentLogPage, JobLine, LiveRun, StatusView } from "../../apps/web/shared/types";

// A call's clock as the browser lays it out (docs/web.md, 「A call's clock lines are no line of the log either」 and 「A
// tool call」): every note the agency's call clock wrote of one call folds into that call's block — a running call
// ticking with its supervisor's moments under it and a long one wearing its quiet hourglass, an ended call settled to
// its outcome and length, a cut call to what cut it — a call whose own line is not on the page stands as one block of
// its own, and none of the notes stands as a line. A polling shell command's top line is its gist. It is laid out at
// both widths in both themes, and a picture of each block is kept where BMO_TOOL_CLOCK_SHOTS names a folder. It drives
// the console tests/support/browser-console.ts stands up; the suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const shots = process.env.BMO_TOOL_CLOCK_SHOTS?.trim() ?? "";
const ACCOUNT = { name: "tool-clock", password: "fixture-password-3071" };
const AGENT = "worker";
const REPOSITORY = "repo-a";
const RUN = "job-7";
const NOW = Math.floor(Date.now() / 1000);
const LOOKS = [
  { width: 1280, height: 900, phone: false, scheme: "light" },
  { width: 1280, height: 900, phone: false, scheme: "dark" },
  { width: 360, height: 780, phone: true, scheme: "light" },
  { width: 360, height: 780, phone: true, scheme: "dark" }
] as const;

const POLL =
  "F=/tmp/claude-1/-work/scratchpad/r3041/ask.out; for i in $(seq 1 240); do grep -q '^exit' \"$F\" 2>/dev/null && break; sleep 15; done; cat \"$F\"";

const LIVE: LiveRun = {
  id: 7, kind: "worker", agent: AGENT, chatId: null, messageId: null, startedAt: NOW - 3_600, unit: RUN, capSeconds: null,
  depth: null, model: null, startedBy: null, todoId: null, progress: null, stop: null
};

const JOB: JobLine = { job: 7, run: RUN, agent: AGENT, todoId: null, title: null, purpose: "a waiting job", startedAt: NOW - 3_600, finishedAt: null, tools: 4, models: [],
  spent: null };

let id = 0;

function line(at: number, kind: AgentLogLine["kind"], text: string, over: Partial<AgentLogLine> = {}): AgentLogLine {
  id += 1;

  return { id, agent: AGENT, run: RUN, chatId: null, at, kind, name: null, tool: null, parent: null, ref: null, state: null, truncated: false, text, patches: [], patchesMore: 0, ...over };
}

function call(at: number, ref: string, input: Record<string, string>): AgentLogLine {
  return line(at, "tool", JSON.stringify(input), { name: "Bash", tool: { name: "Bash", icon: null }, ref });
}

function note(at: number, ref: string | null, command: string, event: AgentLogClock["event"], over: Partial<AgentLogClock> = {}): AgentLogLine {
  const clock: AgentLogClock = {
    event, call: ref, tool: "Bash", command, pid: 1_681_736, elapsedMs: null, silentMs: null, keptMs: null, why: null, cut: null, outcome: null, ...over
  };

  return line(at, "note", `${RUN}: tool Bash ${event}`, { clock });
}

// Thirty minutes of a polling wait the supervisor was asked about and kept, still going; a short test still going; a
// build that ended, one that failed, one the supervisor cut; and a wait whose own line is not on the page.
const WAIT_STARTED = NOW - 1_566;
const LOG: AgentLogPage = {
  lines: [
    line(NOW - 3_600, "start", "model-a"),
    line(NOW - 3_000, "text", "Building and testing, then waiting on the ask."),
    call(NOW - 3_000, "c-done", { command: "cargo build --release", description: "Build the release" }),
    note(NOW - 2_998, "c-done", "cargo build --release", "started", { elapsedMs: 2_000 }),
    note(NOW - 2_940, "c-done", "cargo build --release", "running", { elapsedMs: 60_000 }),
    note(NOW - 1_253, "c-done", "cargo build --release", "ended", { outcome: "completed", elapsedMs: 1_747_400 }),
    line(NOW - 1_253, "tool-result", "Finished release", { ref: "c-done", name: "Bash", state: "succeeded" }),
    call(NOW - 1_700, "c-failed", { command: "bun test tests/app", description: "Run the app tests" }),
    note(NOW - 1_698, "c-failed", "bun test tests/app", "started", { elapsedMs: 2_000 }),
    note(NOW - 1_640, "c-failed", "bun test tests/app", "ended", { outcome: "failed", elapsedMs: 64_000 }),
    line(NOW - 1_636, "tool-result", "1 fail", { ref: "c-failed", name: "Bash", state: "failed" }),
    call(NOW - 1_630, "c-cut", { command: "sleep 3600" }),
    note(NOW - 1_628, "c-cut", "sleep 3600", "started", { elapsedMs: 2_000 }),
    note(NOW - 1_330, "c-cut", "sleep 3600", "asked", { elapsedMs: 300_000, silentMs: 300_000 }),
    note(NOW - 1_320, "c-cut", "sleep 3600", "cut", { cut: "supervisor", why: "It waits on another job's close, which does not come while the call holds the turn.", elapsedMs: 310_000 }),
    note(NOW - 1_319, "c-cut", "sleep 3600", "ended", { outcome: "failed", elapsedMs: 311_000 }),
    call(WAIT_STARTED, "c-wait", { command: POLL }),
    note(WAIT_STARTED + 2, "c-wait", POLL.slice(0, 160), "started", { pid: null, elapsedMs: 2_000 }),
    ...Array.from({ length: 25 }, (_, index) => note(WAIT_STARTED + 62 + index * 60, "c-wait", POLL.slice(0, 160), "running", { elapsedMs: (62 + index * 60) * 1000 })),
    note(WAIT_STARTED + 311, "c-wait", POLL.slice(0, 160), "asked", { elapsedMs: 311_000, silentMs: 311_000 }),
    note(WAIT_STARTED + 331, "c-wait", POLL.slice(0, 160), "kept", { elapsedMs: 331_000, keptMs: 3_592_000 }),
    call(NOW - 62, "c-short", { command: "cd /srv/checkouts/worker && bun test tests/app/domain > /tmp/out.log 2>&1" }),
    note(NOW - 60, "c-short", "cd /srv/checkouts/worker && bun test tests/app/domain > /tmp/out.log 2>&1", "running", { elapsedMs: 2_000 }),
    note(NOW - 300, "c-gone", "F=/tmp/w/ask.out; until test -s \"$F\"; do sleep 5; done", "running", { elapsedMs: 900_000 })
  ],
  hasMore: false
};

let browser: Browser | null = null;
let cookie = "";

beforeAll(async () => {
  if (!origin || !touchReady()) return;

  const login = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ACCOUNT) });

  expect(login.ok).toBe(true);
  cookie = login.headers.get("set-cookie")!.split(";")[0]!;
  browser = await chromium.launch();

  if (shots !== "") mkdirSync(shots, { recursive: true });
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();
}, BROWSER_HOOK_MS);

async function open(look: (typeof LOOKS)[number]): Promise<BrowserContext> {
  const context = await browser!.newContext({
    viewport: { width: look.width, height: look.height },
    isMobile: look.phone,
    hasTouch: look.phone,
    colorScheme: look.scheme,
    serviceWorkers: "block",
    reducedMotion: "reduce"
  });
  const at = cookie.indexOf("=");

  // The console keeps the theme it was set to in a cookie of its own, whatever the browser prefers.
  await context.addCookies([
    { name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! },
    { name: "nuxt-color-mode", value: look.scheme, url: origin! }
  ]);
  await context.route(/\/api\/status$/, async (route) => {
    const status = (await (await route.fetch()).json()) as StatusView;

    await route.fulfill({ json: { ...status, live: [LIVE] } });
  });
  // The worker's screen stands the job's own lines, read by the job (docs/web.md, 「Where the log comes from」).
  const jobLog = (route: Route): Promise<void> => {
    const after = new URL(route.request().url()).searchParams.get("after");

    return route.fulfill({ json: after === null ? LOG : { lines: [], hasMore: false } });
  };

  await context.route(new RegExp(`/api/agents/${AGENT}/log(\\?|$)`), jobLog);
  await context.route(new RegExp(`/api/jobs/${JOB.job}/log(\\?|$)`), jobLog);
  await context.route(new RegExp(`/api/agents/(${AGENT}|${REPOSITORY})/job(\\?|$)`), (route) => route.fulfill({ json: { job: JOB } }));
  await context.route(new RegExp(`/api/agents/${AGENT}/job-prompt(\\?|$)`), (route) => route.fulfill({ json: { prompt: { text: "prompt", english: null } } }));

  return context;
}

describe.skipIf(!origin || !touchReady())("a call's clock", () => {
  for (const look of LOOKS) {
    test(`the clock notes fold into their calls, ${look.width}px wide, ${look.scheme}`, async () => {
      const context = await open(look);

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/agents/${REPOSITORY}`, { waitUntil: "load" });

        const blocks = page.locator("[data-tool-call]");

        await page.locator("[data-tool-clock]").nth(5).waitFor({ timeout: 20_000 });

        // No clock note stands as a line, and every call stands once: the five on the page and the one standing in.
        expect(await page.locator("[data-agent-log] > li").filter({ hasText: `${RUN}: tool Bash` }).count()).toBe(0);
        expect(await blocks.count()).toBe(6);

        const states = await page.locator("[data-tool-clock]").evaluateAll((all) => all.map((one) => one.getAttribute("data-state")));

        expect(states).toEqual(["completed", "failed", "cut", "running", "running", "running"]);

        const done = blocks.nth(0);
        const failed = blocks.nth(1);
        const cut = blocks.nth(2);
        const wait = blocks.nth(3);
        const short = blocks.nth(4);
        const gone = blocks.nth(5);

        // Ended: the outcome and how long it took.
        expect(await done.locator("[data-tool-clock-state]").innerText()).toContain(wording("agents.label.call_done"));
        expect(await done.locator("[data-tool-clock-took]").innerText()).toBe(wording("common.label.minutes_seconds", { m: 29, s: 7 }));
        expect(await failed.locator("[data-tool-clock-state]").innerText()).toContain(wording("agents.label.call_failed"));
        // Cut: what cut it, and the supervisor's reason under it.
        expect(await cut.locator("[data-tool-clock-state]").innerText()).toContain(wording("agents.label.clock_cut_supervisor"));
        expect(await cut.locator("[data-tool-clock-why]").innerText()).toContain("another job's close");

        // Running: the time since it began, read off the reader's clock, with the supervisor's moments under it.
        expect(await wait.locator("[data-tool-top]").innerText()).toContain("Bash grep -q '^exit' ask.out");
        expect(await wait.locator("[data-tool-loop]").count()).toBe(1);
        // Its figures turn in windows of their own, one character each, so the words are read with no space between.
        expect((await wait.locator("[data-tool-clock-elapsed]").innerText()).replace(/\s/g, "")).toContain(wording("common.label.minutes", { m: 26 }).replace(/\s/g, ""));
        expect(await wait.locator("[data-tool-clock-long]").count()).toBe(1);
        expect(await wait.locator("[data-tool-clock-moments] li").count()).toBe(2);
        expect(await short.locator("[data-tool-top]").innerText()).toContain("Bash bun test tests/app/domain");
        expect(await short.locator("[data-tool-clock-long]").count()).toBe(0);
        // A call whose own line is not on the page stands in its block all the same, its command under the prompt.
        expect(await gone.locator("[data-tool-top]").innerText()).toContain("Bash test -s ask.out");
        expect(await gone.locator("[data-tool-command]").innerText()).toContain("until test -s");

        // No block runs past the log's width.
        const overflow = await blocks.evaluateAll((all) => all.some((one) => one.scrollWidth > one.clientWidth + 1));

        expect(overflow).toBe(false);

        if (shots !== "") {
          const named: [string, typeof done][] = [["ended-ok", done], ["ended-failed", failed], ["cut", cut], ["running-long", wait], ["running", short], ["stand-in", gone]];

          for (const [name, block] of named) {
            await block.scrollIntoViewIfNeeded();
            await block.screenshot({ path: join(shots, `${name}-${look.width}-${look.scheme}.png`) });
          }

          // The process named on demand: the clock's state names it in a tooltip, a hover's on a pointer and a tap's on a
          // finger.
          if (look.phone) await wait.locator("[data-tool-clock-state]").tap();
          else await wait.locator("[data-tool-clock-state]").hover();
          await page.getByText(wording("agents.label.clock_pid", { pid: 1_681_736 })).first().waitFor({ timeout: 5_000 });
          await page.screenshot({ path: join(shots, `pid-tooltip-${look.width}-${look.scheme}.png`) });
        }
      } finally {
        await context.close();
      }
    }, 60_000);
  }
});
