import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { tokenText, totalText, unsplitText } from "../../apps/web/app/domain/usage";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, BrowserContext } from "playwright-core";
import type { AgentTokenUsage } from "../../apps/web/shared/types";

// A repository's line on the home screen (docs/web.md, 「Home screen」): its week is every checkout's week added
// together, divided into the four kinds as one bar where the agency counts them, and blank where it counts none, with
// the unsplit count saying so and never a row of dashes; it is at work while a job runs in it, whatever agent the
// job's item named. It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts
// stands up, whose agency lists repo-a with a job in its base checkout; the week and the live picture are served
// through the page's own routes.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "home-repository", password: "fixture-password-3052" };

function week(agent: string, over: Partial<AgentTokenUsage>): AgentTokenUsage {
  return { agent, tokens: 0, runs: 0, inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheWriteTokens: null, unsplitRuns: 0, unsplitTokens: 0, ...over };
}

// The base checkout and a support checkout, each with its spend apart.
const SPLIT = [
  week("repo-a", { tokens: 1_000_000, runs: 3, inputTokens: 1_000, outputTokens: 9_000, cacheReadTokens: 980_000, cacheWriteTokens: 10_000 }),
  week("repo-a-w2", { tokens: 500_000, runs: 1, inputTokens: 500, outputTokens: 4_500, cacheReadTokens: 490_000, cacheWriteTokens: 5_000 })
];
// The same repository where no job reported its spend apart.
const WHOLE = [week("repo-a", { tokens: 2_000_000, runs: 2, unsplitRuns: 2, unsplitTokens: 2_000_000 })];

// A job running in the repository, filed under the agent its item named.
const STARTED = Math.floor(Date.now() / 1000) - 90;
const RUN = {
  id: 7,
  kind: "worker",
  agent: "agent-b",
  repository: "repo-a",
  checkout: "repo-a",
  chatId: null,
  messageId: null,
  startedAt: STARTED,
  unit: "run-7",
  capSeconds: null,
  depth: null,
  model: null,
  startedBy: null,
  todoId: 12,
  purpose: null,
  progress: null
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

async function open(width: number, height: number, agents: AgentTokenUsage[]): Promise<BrowserContext> {
  const context = await browser!.newContext({ viewport: { width, height }, serviceWorkers: "block", reducedMotion: "reduce" });
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
  await context.route(/\/api\/usage(\?|$)/, (route) => route.fulfill({ json: { active: null, roads: [], accounts: [], agents, contexts: [] } }));
  await context.route(/\/api\/status(\?|$)/, (route) =>
    route.fulfill({ json: { reachable: true, live: [RUN], compacting: [], liveAt: null, gates: [], runners: [], jobs: [] } })
  );

  return context;
}

// The repository's line, under the block the job workers stand in.
async function lineText(context: BrowserContext): Promise<{ text: string; bars: number; legend: string; column: boolean }> {
  const page = await context.newPage();

  await page.goto(`${origin}/`, { waitUntil: "domcontentloaded" });
  const block = page.locator("section").filter({ has: page.getByRole("heading", { name: wording("agents.label.group_worker"), exact: true }) });
  const line = block.locator("li").filter({ hasText: "Repository A" });

  await line.getByText(wording("agents.label.weekly"), { exact: true }).waitFor({ timeout: 60_000 });

  const bar = line.locator("[data-usage-split]");

  const read = { text: await line.innerText(), bars: await bar.count(), legend: (await bar.count()) === 0 ? "" : await bar.innerText() };

  // A repository many jobs run in has a long subtitle; the line truncates it rather than standing wider than its list.
  await line.locator("p").nth(1).evaluate((subtitle) => {
    subtitle.textContent = Array.from({ length: 12 }, (_, at) => `item ${at}`).join(", ");
  });
  const column = await line.evaluate((item) => item.getBoundingClientRect().right <= item.parentElement!.getBoundingClientRect().right + 1);

  return { ...read, column };
}

describe.skipIf(!origin || !touchReady())("a repository's line on the home screen", () => {
  for (const [width, height] of [[1280, 900], [360, 780]] as const) {
    test(`adds every checkout's week into one bar and is at work while a job runs in it, at ${width}`, async () => {
      const context = await open(width, height, SPLIT);

      try {
        const line = await lineText(context);

        expect(line.text).toContain(totalText(wording, { tokens: 1_500_000 }));
        expect(line.text).toContain(wording("agents.status.run_worker"));
        expect(line.bars).toBe(1);
        expect(line.column).toBe(true);
        expect(line.text).not.toContain("—");
        // The four are named under the track where a desk has the room; a phone folds them and keeps the track.
        if (width >= 640) {
          for (const tokens of [1_500, 13_500, 1_470_000, 15_000]) expect(line.legend).toContain(tokenText(tokens));
        }
      } finally {
        await context.close();
      }
    }, 120_000);

    test(`leaves the kinds blank where no job reported them apart, with no dashes, at ${width}`, async () => {
      const context = await open(width, height, WHOLE);

      try {
        const line = await lineText(context);

        expect(line.text).toContain(totalText(wording, { tokens: 2_000_000 }));
        expect(line.text).toContain(unsplitText(wording, WHOLE));
        expect(line.bars).toBe(0);
        expect(line.text).not.toContain("—");
      } finally {
        await context.close();
      }
    }, 120_000);
  }
});
