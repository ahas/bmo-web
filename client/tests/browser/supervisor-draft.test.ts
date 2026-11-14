import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";

import type { Browser, Locator } from "playwright-core";

// A supervisor's draft process stands in its own settings dialog (docs/web.md, 「Agent management screen」, the
// settings dialog's draft block): the two lists with a question switched off struck through, a checkbox on every
// question but the one that writes the message, the texts of its catalogue, and one save at the dialog's foot that
// sends only what changed. The agents tab holds no draft table. It drives the console
// tests/support/browser-console.ts stands up, serving the supervisor's draft settings through the page's own route;
// the suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "draft-close", password: "fixture-password-2259" };
const POLICY = { rounds: ["intent", "facts", "final"], sendFrom: "", off: ["facts"], ceilingSeconds: 0, pastCeiling: "send" };
const QUESTIONS = [
  { name: "supervisor", text: "whether to answer", source: "default", policyText: "whether to answer" },
  { name: "intent", text: "why the words were said", source: "default", policyText: "why the words were said" },
  { name: "facts", text: "whether it is true", source: "default", policyText: "whether it is true" },
  { name: "tone", text: "whether the tone fits", source: "set", policyText: null },
  { name: "final", text: "the last question of the round", source: "default", policyText: "the last question of the round" }
];
const VIEW = { source: "default", process: POLICY, policy: POLICY, questions: QUESTIONS };

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

async function until<T>(read: () => Promise<T>, done: (value: T) => boolean): Promise<T> {
  let value = await read();

  for (let waited = 0; !done(value) && waited < 100; waited += 1) {
    await new Promise((next) => setTimeout(next, 100));
    value = await read();
  }

  return value;
}

describe.skipIf(!origin || !touchReady())("a supervisor's draft block", () => {
  test("stands in its settings dialog, switches a question off by its checkbox and saves what changed with the form", async () => {
    const context = await browser!.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block", reducedMotion: "reduce" });
    const at = cookie.indexOf("=");
    const saves: Record<string, unknown>[] = [];

    await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
    await context.route(/\/api\/supervisors\/[^/]+\/draft$/, async (route) => {
      if (route.request().method() !== "PATCH") return await route.fulfill({ json: VIEW });

      const body = route.request().postDataJSON() as Record<string, unknown>;

      saves.push(body);
      await route.fulfill({ json: { ...VIEW, source: "set", process: body.process ?? POLICY } });
    });

    try {
      const page = await context.newPage();

      await page.goto(`${origin}/agents?tab=supervisors`, { waitUntil: "load" });
      await page.locator("[data-supervisors-table] tbody tr").first().waitFor({ timeout: 30_000 });

      // The tab holds no draft table; the block stands in the supervisor's own dialog.
      expect(await page.locator("[data-draft-processes], [data-draft-questions]").count()).toBe(0);

      await page.locator("[data-supervisors-table] tbody tr").first().getByRole("button").last().click();
      await page.getByRole("menuitem", { name: wording("agents.action.settings") }).click();

      const block = page.locator("[data-supervisor-draft]");

      await block.waitFor({ timeout: 15_000 });

      // A supervisor with no process of its own follows the policy's, and its title says so.
      expect(await block.locator("[data-draft-title]").innerText()).toBe(wording("agents.label.default_marked", { value: wording("agents.title.draft") }));
      expect(await block.locator("[data-draft-to-default]").count()).toBe(0);

      const rounds: Locator = block.locator("[data-draft-list=rounds]");

      // The list stands every question at its place, the one switched off struck through, and offers the questions it
      // does not hold but never the supervisor's own judgement.
      expect(await rounds.locator("[data-draft-question]").evaluateAll((items) => items.map((item) => item.getAttribute("data-draft-question")))).toEqual(["intent", "facts", "final"]);
      expect(await rounds.locator(".line-through").count()).toBe(1);

      const boxes = rounds.getByRole("checkbox");

      expect(await boxes.count()).toBe(2);
      expect(await boxes.nth(0).getAttribute("aria-checked")).toBe("true");
      expect(await boxes.nth(1).getAttribute("aria-checked")).toBe("false");

      // Only a question the console added or changed carries the press that takes its text away.
      expect(await block.getByRole("button", { name: wording("agents.aria.draft_question_remove_of", { name: "tone" }) }).count()).toBe(1);
      expect(await block.getByRole("button", { name: wording("agents.aria.draft_question_remove_of", { name: "intent" }) }).count()).toBe(0);

      const save = page.getByRole("button", { name: wording("common.action.save"), exact: true });

      expect(await save.isDisabled()).toBe(true);

      // The first switched off and the second on again, each staying where it stands: the supervisor now has a process
      // of its own, and the dialog's one save sends it.
      await boxes.nth(0).click();
      await boxes.nth(1).click();
      expect(await until(async () => await block.locator("[data-draft-title]").innerText(), (text) => text === wording("agents.title.draft"))).toBe(wording("agents.title.draft"));
      expect(await block.locator("[data-draft-to-default]").count()).toBe(1);

      // A question's text opens under its line and is sent with the same save.
      await block.locator("[data-draft-text=intent]").getByRole("button").first().click();
      await block.locator("[data-draft-text=intent] textarea").fill("why they said it");

      expect(await until(async () => await save.isDisabled(), (disabled) => !disabled)).toBe(false);
      await save.click();

      expect(await until(async () => saves.length, (count) => count > 0)).toBe(1);
      expect(saves[0]).toEqual({ texts: { intent: "why they said it" }, process: { ...POLICY, off: ["intent"] } });
    } finally {
      await context.close();
    }
  }, 120_000);
});
