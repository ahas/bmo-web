import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium, devices } from "playwright-core";

import { carryByMouse, centre, rowMarks } from "./row-carry";
import { BROWSER_HOOK_MS, fingerOn, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";

import type { Browser, BrowserContext, Locator, Page } from "playwright-core";

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

// The supervisor's draft settings as the agency would keep them: what a save sends is what the next read answers,
// so the order a drag saved is the order a reload reads again.
async function keptDraft(context: BrowserContext, rounds: string[]): Promise<{ saves: Record<string, unknown>[] }> {
  const policy = { ...POLICY, rounds, off: [] as string[] };
  let view: Record<string, unknown> = { ...VIEW, process: policy, policy };
  const saves: Record<string, unknown>[] = [];

  await context.route(/\/api\/supervisors\/[^/]+\/draft$/, async (route) => {
    if (route.request().method() === "PATCH") {
      const body = route.request().postDataJSON() as Record<string, unknown>;

      saves.push(body);
      view = { ...view, source: "set", process: body.process ?? view.process };
    }

    await route.fulfill({ json: view });
  });

  return { saves };
}

// The first supervisor's settings dialog opened from its row's menu, and its list of the round's questions.
async function openRounds(page: Page): Promise<Locator> {
  await page.goto(`${origin}/agents?tab=supervisors`, { waitUntil: "load" });
  await page.locator("[data-supervisors-table] tbody tr").first().waitFor({ timeout: 30_000 });
  await page.locator("[data-supervisors-table] tbody tr").first().getByRole("button").last().click();
  await page.getByRole("menuitem", { name: wording("agents.action.settings") }).click();
  await page.locator("[data-supervisor-draft]").waitFor({ timeout: 15_000 });

  return page.locator("[data-supervisor-draft] [data-draft-list=rounds]");
}

async function order(rounds: Locator): Promise<string[]> {
  return await rounds.locator("[data-draft-question]").evaluateAll((items) => items.map((item) => item.getAttribute("data-draft-question")!));
}

function handleOf(rounds: Locator, name: string): Locator {
  return rounds.locator(`[data-draft-question="${name}"]`).getByRole("img", { name: wording("agents.aria.drag_reorder") });
}

describe.skipIf(!origin || !touchReady())("a draft question carried by its handle", () => {
  test("with the mouse lands where its row is lit, keeps final last, and the order saved stands after a reload", async () => {
    const context = await browser!.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block", reducedMotion: "reduce" });
    const at = cookie.indexOf("=");

    await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

    const { saves } = await keptDraft(context, ["intent", "facts", "tone", "final"]);

    try {
      const page = await context.newPage();
      let rounds = await openRounds(page);

      expect(await order(rounds)).toEqual(["intent", "facts", "tone", "final"]);
      // `final` has no handle; every question before it has one.
      expect(await rounds.getByRole("img", { name: wording("agents.aria.drag_reorder") }).count()).toBe(3);

      // `tone` carried up onto `intent`: while held, it stands marked as held and `intent`'s row is lit where it lands.
      const marks = await carryByMouse(page, await centre(handleOf(rounds, "tone")), await centre(rounds.locator('[data-draft-question="intent"]')), async () => await rowMarks(rounds));

      expect(marks).toEqual({ held: [2], over: [0] });
      expect(await order(rounds)).toEqual(["tone", "intent", "facts", "final"]);
      expect(await rowMarks(rounds)).toEqual({ held: [], over: [] });

      // `final` is no row to land on: over it nothing is lit, and let go there nothing moves.
      const onFinal = await carryByMouse(page, await centre(handleOf(rounds, "tone")), await centre(rounds.locator('[data-draft-question="final"]')), async () => await rowMarks(rounds));

      expect(onFinal).toEqual({ held: [0], over: [] });
      expect(await order(rounds)).toEqual(["tone", "intent", "facts", "final"]);

      // Carried down onto the last question, it takes that place, `final` staying last.
      const toEnd = await carryByMouse(page, await centre(handleOf(rounds, "tone")), await centre(rounds.locator('[data-draft-question="facts"]')), async () => await rowMarks(rounds));

      expect(toEnd).toEqual({ held: [0], over: [2] });
      expect(await order(rounds)).toEqual(["intent", "facts", "tone", "final"]);

      // A press on a handle that lets go where it went down moves nothing.
      const still = await centre(handleOf(rounds, "facts"));

      await carryByMouse(page, still, still, async () => null);
      expect(await order(rounds)).toEqual(["intent", "facts", "tone", "final"]);

      await carryByMouse(page, await centre(handleOf(rounds, "facts")), await centre(rounds.locator('[data-draft-question="intent"]')), async () => null);
      expect(await order(rounds)).toEqual(["facts", "intent", "tone", "final"]);

      await page.getByRole("button", { name: wording("common.action.save"), exact: true }).click();
      expect(await until(async () => saves.length, (count) => count > 0)).toBe(1);
      expect(saves[0]).toMatchObject({ process: { rounds: ["facts", "intent", "tone", "final"] } });

      // The save closes the dialog; the screen loaded afresh reads the order it left.
      await page.locator("[data-supervisor-draft]").waitFor({ state: "detached", timeout: 15_000 });
      await page.reload({ waitUntil: "load" });
      rounds = await openRounds(page);
      expect(await order(rounds)).toEqual(["facts", "intent", "tone", "final"]);
    } finally {
      await context.close();
    }
  }, 120_000);

  test("with a finger on a phone lands where it is let go, and the order saved stands after a reload", async () => {
    const context = await browser!.newContext({ ...devices["Pixel 5"], serviceWorkers: "block", reducedMotion: "reduce" });
    const at = cookie.indexOf("=");

    await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

    const { saves } = await keptDraft(context, ["intent", "facts", "tone", "final"]);

    try {
      const page = await context.newPage();
      const finger = await fingerOn(page);
      let rounds = await openRounds(page);

      // A finger on the handle carries the row rather than scrolling the dialog.
      await handleOf(rounds, "intent").scrollIntoViewIfNeeded();
      await finger.swipe(await centre(handleOf(rounds, "intent")), await centre(rounds.locator('[data-draft-question="tone"]')), { steps: 12 });
      expect(await order(rounds)).toEqual(["facts", "tone", "intent", "final"]);

      await page.getByRole("button", { name: wording("common.action.save"), exact: true }).click();
      expect(await until(async () => saves.length, (count) => count > 0)).toBe(1);
      expect(saves[0]).toMatchObject({ process: { rounds: ["facts", "tone", "intent", "final"] } });

      // The save closes the dialog; the screen loaded afresh reads the order it left.
      await page.locator("[data-supervisor-draft]").waitFor({ state: "detached", timeout: 15_000 });
      await page.reload({ waitUntil: "load" });
      rounds = await openRounds(page);
      expect(await order(rounds)).toEqual(["facts", "tone", "intent", "final"]);
    } finally {
      await context.close();
    }
  }, 120_000);
});
