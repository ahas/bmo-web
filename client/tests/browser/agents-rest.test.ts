import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, Locator } from "playwright-core";

// The deployment's rest on agent management's agents tab (docs/web.md, 「What each agent is doing now」): while it
// rests, an agent its rest closes reads the rest and until when in place of idle, a supervisor as well as a role's agent;
// the band at the tab's head says the same, and its end, asked first, ends the rest through the console's route,
// after which the marks go. Each is read as the browser draws it, on a phone and on a desktop: the words shown, nothing
// standing over them, and the button reached and pressed. It drives the console tests/support/browser-console.ts stands
// up, its rest stood in by this file; the suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "agents-rest", password: "fixture-password-4417" };

let browser: Browser | null = null;
let cookie = "";

beforeAll(async () => {
  if (!origin || !touchReady()) return;

  const login = await fetch(`${origin}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(ACCOUNT)
  });

  expect(login.ok).toBe(true);
  cookie = login.headers.get("set-cookie")!.split(";")[0]!;
  browser = await chromium.launch();
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();
}, BROWSER_HOOK_MS);

// Whether the browser draws the element on the screen, whole across its width inside the viewport, with nothing over
// its centre: what a reader sees and a finger reaches.
async function drawnInView(element: Locator): Promise<boolean> {
  await element.scrollIntoViewIfNeeded();

  return await element.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);

    return rect.width > 0 && rect.height > 0 && rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight && hit !== null && node.contains(hit);
  });
}

describe.skipIf(!origin || !touchReady())("the deployment's rest", () => {
  for (const [width, height, phone] of [[360, 780, true], [1280, 900, false]] as const) {
    test(`marks the agents it closes and is ended from the tab's head, ${width}px wide`, async () => {
      const context = await browser!.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, locale: "ko-KR", serviceWorkers: "block", reducedMotion: "reduce" });
      const at = cookie.indexOf("=");
      // Resting for an hour more, closing the supervisor agent-c and the role agent worker-03, which carries no run.
      const until = Math.floor(Date.now() / 1000) + 3_600;
      const resting = { resting: true, until, kind: "limit", supervisors: ["agent-c"], agents: ["worker-03"], mayEnd: true };
      const rested = { resting: false, until: null, kind: null, supervisors: [], agents: [], mayEnd: true };
      const ended: string[] = [];
      let rest: object = resting;

      await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
      await context.route(/\/api\/rest$/, async (route) => {
        if (route.request().method() === "DELETE") {
          ended.push(route.request().method());
          rest = rested;

          return await route.fulfill({ json: { ...rested, ended: true } });
        }

        return await route.fulfill({ json: rest });
      });

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/agents?tab=supervisors`, { waitUntil: "load" });

        // The band says until when, the clock alone on the day it ends or with its date on another.
        const band = page.locator("[data-rest-band]");
        const mark = band.locator("[data-rest-mark]");

        await mark.waitFor({ timeout: 15_000 });
        expect(await mark.innerText()).toMatch(new RegExp(`^${wording("live.label.agent_resting_until", { until: "(\\d{2}-\\d{2} )?\\d{2}:\\d{2}" }).replace(/[·]/g, "\\$&")}$`));
        expect(await band.innerText()).toContain(wording("agents.label.rest_limit"));
        expect(await drawnInView(mark)).toBe(true);

        // The supervisor and the role's agent it closes read the rest in their state cells, apart from idle.
        const supervisorCell = page.locator("[data-supervisors-table] tbody tr").filter({ hasText: "agent-c" }).locator('[data-agent-state="resting"]');
        const agentCell = page.locator("[data-role-agents-table] tbody tr").filter({ hasText: "worker-03" }).locator('[data-agent-state="resting"]');

        for (const cell of [supervisorCell, agentCell]) {
          await cell.waitFor({ timeout: 15_000 });
          expect(await cell.innerText()).toBe(await mark.innerText());
          expect(await drawnInView(cell)).toBe(true);
        }

        // An agent the rest does not close stands as before.
        expect(await page.locator("[data-role-agents-table] tbody tr").filter({ hasText: "worker-01" }).locator('[data-agent-state="resting"]').count()).toBe(0);

        // The end is reached, asked first, and ends the rest through the console's route; the marks then go.
        const button = band.getByRole("button", { name: wording("agents.action.rest_end") });

        expect(await drawnInView(button)).toBe(true);
        await button.click();

        const question = page.getByRole("dialog").filter({ hasText: wording("agents.message.rest_end_confirm") });

        await question.waitFor({ timeout: 15_000 });
        await question.getByRole("button", { name: wording("agents.action.rest_end") }).click();
        await band.waitFor({ state: "detached", timeout: 15_000 });
        expect(ended).toEqual(["DELETE"]);
        await agentCell.waitFor({ state: "detached", timeout: 15_000 });
        expect(await page.locator('[data-agent-state="resting"]').count()).toBe(0);
      } finally {
        await context.close();
      }
    }, 120_000);
  }

  test("offers no end to a reader who is no administrator", async () => {
    const context = await browser!.newContext({ viewport: { width: 1280, height: 900 }, locale: "ko-KR", serviceWorkers: "block", reducedMotion: "reduce" });
    const at = cookie.indexOf("=");

    await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
    await context.route(/\/api\/rest$/, (route) => route.fulfill({ json: { resting: true, until: null, kind: "outage", supervisors: ["agent-c"], agents: [], mayEnd: false } }));

    try {
      const page = await context.newPage();
      const band = page.locator("[data-rest-band]");

      await page.goto(`${origin}/agents?tab=supervisors`, { waitUntil: "load" });
      await band.locator("[data-rest-mark]").waitFor({ timeout: 15_000 });

      // A rest kept to no known moment reads the rest alone.
      expect(await band.locator("[data-rest-mark]").innerText()).toBe(wording("live.label.agent_resting"));
      expect(await band.innerText()).toContain(wording("agents.label.rest_outage"));
      expect(await band.getByRole("button", { name: wording("agents.action.rest_end") }).count()).toBe(0);
    } finally {
      await context.close();
    }
  }, 120_000);
});
