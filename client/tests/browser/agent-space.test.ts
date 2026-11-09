import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";

import type { Browser } from "playwright-core";

// The agents' space is the live status screen's first tab (docs/web.md, 「Live status screen」, the space): one canvas
// painted in code with the floor's counts over its corner, the role slots in the tab beside it and no other tab, and
// an agent's card opened from the list that stands beside the canvas for a reader who does not see it. It drives the
// console tests/support/browser-console.ts stands up, serving the space through the page's own route; the suite
// stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "draft-close", password: "fixture-password-2259" };
const WORK = { repository: "repo-a", chatId: null, place: "Repo A", title: "Fix it", since: 1_000, provider: "Provider A", model: "model-a", log: "job-7", session: null, stop: null };
const VIEW = {
  readAt: 2_000,
  nodes: [{ name: "node-a", label: "Node A", busy: true }],
  repositories: [{ name: "repo-a", label: "Repo A", node: "node-a" }],
  agents: [
    { name: "agent-a", label: "Agent A", role: null, enabled: true, road: "Provider A · model-s", work: null },
    { name: "worker-01", label: "worker-01", role: "worker", enabled: true, road: null, work: WORK },
    { name: "worker-02", label: "worker-02", role: "worker", enabled: false, road: null, work: null }
  ],
  waiting: [{ role: "worker", count: 1 }]
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

describe.skipIf(!origin || !touchReady())("the agents' space", () => {
  test("is the live status screen's first tab, painted on one canvas, and opens an agent's card", async () => {
    const context = await browser!.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block", reducedMotion: "reduce" });
    const at = cookie.indexOf("=");

    await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
    await context.route(/\/api\/space$/, (route) => route.fulfill({ json: VIEW }));

    try {
      const page = await context.newPage();

      await page.goto(`${origin}/live`, { waitUntil: "load" });

      const space = page.locator("[data-agent-space]");

      await space.locator("[data-space-counts]").waitFor({ timeout: 30_000 });

      // Two tabs stand, the space first, and the floor's counts over its corner.
      const tabs = await page.getByRole("tab").allInnerTexts();

      expect(tabs.slice(0, 2)).toEqual([wording("live.label.tab_space"), wording("live.label.tab_slots")]);
      // The tabs of the gates, the runners, the job workers and the transport records stand no more.
      for (const gone of [wording("agents.label.group_gate"), wording("agents.label.group_runner"), wording("agents.label.group_worker"), "Herdr"]) expect(tabs).not.toContain(gone);
      expect((await space.locator("[data-space-counts]").innerText()).split("\n")).toEqual([
        wording("live.label.space_working", { n: "1" }),
        wording("live.label.space_waiting", { n: "1" }),
        wording("live.label.space_idle", { n: "1" }),
        wording("live.label.space_off", { n: "1" })
      ]);

      // The canvas is painted: it holds pixels of more than a few colours once the floor has been drawn.
      const colours = async (): Promise<number> =>
        await space.locator("canvas").evaluate((canvas: HTMLCanvasElement) => {
          const data = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data;
          const seen = new Set<number>();

          for (let index = 0; index < data.length; index += 4 * 97) if (data[index + 3]! > 0) seen.add((data[index]! << 16) | (data[index + 1]! << 8) | data[index + 2]!);

          return seen.size;
        });
      let painted = await colours();

      for (let waited = 0; painted < 12 && waited < 50; waited += 1) {
        await page.waitForTimeout(100);
        painted = await colours();
      }

      expect(painted).toBeGreaterThanOrEqual(12);

      // An agent's line beside the canvas opens its card: what it is at, where, on what and on which road.
      await space.locator("ul.sr-only button").nth(1).evaluate((button: HTMLElement) => button.click());

      const card = space.locator("[data-space-card]");

      await card.waitFor();
      expect(await card.locator("[data-space-state]").innerText()).toBe(wording("live.label.space_state_working"));

      const said = await card.innerText();

      for (const part of ["worker-01", "Repo A", "Fix it", "Provider A · model-a"]) expect(said).toContain(part);
      expect(await card.getByRole("button", { name: wording("live.action.open_log") }).count()).toBe(1);

      // Esc on the floor closes the card.
      await space.locator("canvas").focus();
      await page.keyboard.press("Escape");
      expect(await card.count()).toBe(0);
    } finally {
      await context.close();
    }
  }, 120_000);
});
