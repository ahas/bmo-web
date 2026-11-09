import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";

import type { Browser } from "playwright-core";

// A question of the draft process is switched off where it stands (docs/web.md, 「Agent management screen」, the
// supervisors tab's draft process): the row's list stands a question switched off struck through, its dropdown
// carries a checkbox on every question but the one that writes the message, a save sends the list with what is
// switched off, and only a question the console added or changed can be taken away. It drives the console
// tests/support/browser-console.ts stands up, serving the table through the page's own route; the suite stands up
// no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "draft-close", password: "fixture-password-2259" };
const ROW = { provider: "*", tier: "*", agentName: "*", rounds: ["intent", "facts", "final"], sendFrom: "", light: ["final"], off: ["facts"], lightChars: 12, ceilingSeconds: 0, pastCeiling: "send", source: "default" };
const QUESTIONS = [
  { name: "intent", text: "why the words were said", source: "default" },
  { name: "facts", text: "whether it is true", source: "default" },
  { name: "tone", text: "whether the tone fits", source: "set" },
  { name: "final", text: "the last question of the round", source: "default" }
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

describe.skipIf(!origin || !touchReady())("a draft process row's list", () => {
  test("stands a question switched off struck through and switches one off or on by its checkbox", async () => {
    const context = await browser!.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
    const at = cookie.indexOf("=");
    const sets: Record<string, unknown>[] = [];

    await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
    await context.route(/\/api\/draft-processes$/, async (route) => {
      if (route.request().method() !== "POST") return await route.fulfill({ json: { rows: [ROW], questions: QUESTIONS } });

      const body = route.request().postDataJSON() as Record<string, unknown>;

      sets.push(body);
      await route.fulfill({ json: { ...ROW, ...body, source: "set" } });
    });

    try {
      const page = await context.newPage();

      await page.goto(`${origin}/agents?tab=supervisors`, { waitUntil: "load" });

      const table = page.locator("[data-draft-processes]");
      const key = [wording("agents.label.draft_any"), wording("agents.label.draft_any"), wording("agents.label.draft_any")].join(" · ");
      const cell = table.getByRole("button", { name: wording("agents.aria.draft_rounds_of", { key }) });

      await cell.waitFor({ timeout: 30_000 });

      // The list stands every question at its place, the one switched off struck through.
      expect(await table.locator(".line-through").allInnerTexts()).toEqual(["facts"]);
      expect((await cell.innerText()).replaceAll(/\s+/g, " ")).toContain("intent → facts → final");

      await cell.click();

      const boxes = page.getByRole("checkbox");

      await boxes.first().waitFor();
      expect(await boxes.count()).toBe(2);
      expect(await boxes.nth(0).getAttribute("aria-checked")).toBe("true");
      expect(await boxes.nth(1).getAttribute("aria-checked")).toBe("false");

      // The first switched off and the second on again, each staying where it stands.
      await boxes.nth(0).click();
      await boxes.nth(1).click();
      await page.getByRole("button", { name: wording("common.action.save"), exact: true }).click();

      for (let waited = 0; sets.length === 0 && waited < 150; waited += 1) await page.waitForTimeout(100);

      expect(sets).toHaveLength(1);
      expect(sets[0]).toMatchObject({ rounds: ["intent", "facts", "final"], off: ["intent"], light: ["final"] });

      // Only a question the console added or changed carries the removal.
      const questions = page.locator("[data-draft-questions]");

      expect(await questions.getByRole("button", { name: wording("agents.aria.draft_question_remove_of", { name: "tone" }) }).count()).toBe(1);
      expect(await questions.getByRole("button", { name: wording("agents.aria.draft_question_remove_of", { name: "intent" }) }).count()).toBe(0);
    } finally {
      await context.close();
    }
  }, 120_000);
});
