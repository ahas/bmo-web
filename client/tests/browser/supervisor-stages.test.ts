import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium, devices } from "playwright-core";

import { carryByMouse, centre, rowMarks } from "./row-carry";
import { BROWSER_HOOK_MS, fingerOn, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";

import type { Browser, BrowserContext, Locator, Page } from "playwright-core";

// A supervisor's instruction stages stand in its own settings dialog as its draft block (docs/web.md, 「Agent
// management screen」, the settings dialog's draft block): the chain in order, the catalogue's other stages under it, a
// stage added, its text edited, taken out of the chain, put back to the policy's, and one save at the dialog's foot
// that sends only what changed. The agents tab holds none of it. It drives the console tests/support/browser-console.ts
// stands up, serving the supervisor's stages through the page's own route; the suite stands up no console, so there it
// skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "draft-close", password: "fixture-password-2259" };
const POLICY = ["review"];
const TEXTS = [
  { name: "review", text: "whether everyone is addressed rightly", source: "default", policyText: "whether everyone is addressed rightly" },
  { name: "sources", text: "whether every fact has a source", source: "set", policyText: "whether every fact is true" }
];
const VIEW = { source: "default", stages: POLICY, policy: POLICY, texts: TEXTS };
const STAGES_ROUTE = /\/api\/supervisors\/[^/]+\/instruction-stages$/;

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

async function signedIn(options: Parameters<Browser["newContext"]>[0]): Promise<BrowserContext> {
  const context = await browser!.newContext({ serviceWorkers: "block", reducedMotion: "reduce", ...options });
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

  return context;
}

// The supervisor's stages as the receiver would keep them: what a save sends is what the next read answers, so the
// order a drag saved is the order a reload reads again.
async function keptStages(context: BrowserContext, view: Record<string, unknown>): Promise<{ saves: Record<string, unknown>[] }> {
  let kept = view;
  const saves: Record<string, unknown>[] = [];

  await context.route(STAGES_ROUTE, async (route) => {
    if (route.request().method() === "PATCH") {
      const body = route.request().postDataJSON() as Record<string, unknown>;

      saves.push(body);
      kept = { ...kept, source: body.stages === null ? "default" : "set", stages: body.stages ?? kept.stages };
    }

    await route.fulfill({ json: kept });
  });

  return { saves };
}

// The first supervisor's settings dialog opened from its row's menu at its draft tab, and its draft block.
async function openBlock(page: Page): Promise<Locator> {
  await page.goto(`${origin}/agents?tab=supervisors`, { waitUntil: "load" });
  await page.locator("[data-supervisors-table] tbody tr").first().waitFor({ timeout: 30_000 });
  await page.locator("[data-supervisors-table] tbody tr").first().getByRole("button").last().click();
  await page.getByRole("menuitem", { name: wording("agents.action.settings") }).click();
  // The draft block stands in the dialog's own tab, shown once that tab is pressed.
  await page.locator("[data-supervisor-tabs]").getByRole("tab", { name: wording("agents.title.draft") }).click();

  const block = page.locator("[data-supervisor-stages]");

  await block.waitFor({ timeout: 15_000 });

  return block;
}

async function names(list: Locator): Promise<string[]> {
  return await list.locator("[data-stage]").evaluateAll((items) => items.map((item) => item.getAttribute("data-stage")!));
}

function handleOf(chain: Locator, name: string): Locator {
  return chain.locator(`[data-stage="${name}"]`).getByRole("button", { name: wording("common.aria.reorder_named", { name }), exact: true });
}

// Which element the keyboard answers now: the handle names itself by the row it carries.
async function focused(page: Page): Promise<string> {
  return await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "");
}

describe.skipIf(!origin || !touchReady())("a supervisor's draft block", () => {
  test("stands in its settings dialog, adds, edits and takes out stages, and saves what changed with the form", async () => {
    const context = await signedIn({ viewport: { width: 1280, height: 900 } });
    const { saves } = await keptStages(context, VIEW);

    try {
      const page = await context.newPage();

      await page.goto(`${origin}/agents?tab=supervisors`, { waitUntil: "load" });
      await page.locator("[data-supervisors-table] tbody tr").first().waitFor({ timeout: 30_000 });

      // The tab holds none of it; the block stands in the supervisor's own dialog.
      expect(await page.locator("[data-supervisor-stages]").count()).toBe(0);

      const block = await openBlock(page);
      const chain = block.locator("[data-stage-chain]");
      const rest = block.locator("[data-stage-rest]");

      // A supervisor with no chain of its own follows the policy's, and its title says so; a stage whose text is the
      // policy's carries the default's mark, and one the console changed does not.
      expect(await block.locator("[data-stages-title]").innerText()).toBe(wording("agents.label.default_marked", { value: wording("agents.title.draft") }));
      expect(await block.locator("[data-stages-to-default]").count()).toBe(0);
      expect(await names(chain)).toEqual(["review"]);
      expect(await names(rest)).toEqual(["sources"]);
      expect(await chain.locator("[data-stage-name]").innerText()).toBe(wording("agents.label.default_marked", { value: "review" }));
      expect(await rest.locator("[data-stage-name]").innerText()).toBe("sources");

      const save = page.getByRole("button", { name: wording("common.action.save"), exact: true });

      expect(await save.isDisabled()).toBe(true);

      // A stage added under a new name joins the chain's end.
      await block.locator("[data-stage-add]").click();
      await block.locator("[data-stage-add-form] input").fill("tone");
      await block.locator("[data-stage-add-form] textarea").fill("whether the tone fits");
      await block.locator("[data-stage-add-form]").getByRole("button", { name: wording("common.action.add") }).click();
      expect(await until(async () => await names(chain), (now) => now.length === 2)).toEqual(["review", "tone"]);
      expect(await block.locator("[data-stages-to-default]").count()).toBe(1);

      // `sources` put back to the policy's text; `review` edited and taken out of the chain, standing under it then.
      await rest.locator('[data-stage="sources"]').getByRole("button", { name: wording("agents.aria.stage_text_of", { name: "sources" }) }).click();
      await rest.locator("[data-stage-to-default]").click();
      await chain.locator('[data-stage="review"]').getByRole("button", { name: wording("agents.aria.stage_text_of", { name: "review" }) }).click();
      await chain.locator('[data-stage="review"] textarea').fill("whether the brain's terms are used");
      await chain.getByRole("button", { name: wording("agents.aria.stage_out", { name: "review" }) }).click();
      expect(await until(async () => await names(rest), (now) => now.includes("review"))).toEqual(["review", "sources"]);
      expect(await names(chain)).toEqual(["tone"]);

      expect(await until(async () => await save.isDisabled(), (disabled) => !disabled)).toBe(false);
      await save.click();

      expect(await until(async () => saves.length, (count) => count > 0)).toBe(1);
      expect(saves[0]).toEqual({ texts: { review: "whether the brain's terms are used", tone: "whether the tone fits" }, stages: ["tone"], removed: ["sources"] });
    } finally {
      await context.close();
    }
  }, 120_000);

  test("saves a stage still being added with the form, and reads the stages again after a refused save", async () => {
    const context = await signedIn({ viewport: { width: 1280, height: 900 } });
    const saves: Record<string, unknown>[] = [];
    let reads = 0;

    await context.route(STAGES_ROUTE, async (route) => {
      if (route.request().method() !== "PATCH") {
        reads += 1;

        return await route.fulfill({ json: VIEW });
      }

      saves.push(route.request().postDataJSON() as Record<string, unknown>);
      await route.fulfill({ status: 400, json: { statusCode: 400, statusMessage: "refused", message: "refused" } });
    });

    try {
      const page = await context.newPage();
      const block = await openBlock(page);
      const save = page.getByRole("button", { name: wording("common.action.save"), exact: true });

      // What is typed into the add form is a change of the dialog, and its save adds the stage before it sends.
      await block.locator("[data-stage-add]").click();
      await block.locator("[data-stage-add-form] input").fill("tone");
      expect(await until(async () => await save.isDisabled(), (disabled) => !disabled)).toBe(false);
      await block.locator("[data-stage-add-form] textarea").fill("whether the tone fits");

      const before = reads;

      await save.click();
      expect(await until(async () => saves.length, (count) => count > 0)).toBe(1);
      expect(saves[0]).toEqual({ texts: { tone: "whether the tone fits" }, stages: ["review", "tone"] });

      // Refused, the block says so, keeps the stage as written and reads the stages again.
      await block.getByRole("alert").waitFor({ timeout: 10_000 });
      expect(await until(async () => reads, (count) => count > before)).toBe(before + 1);
      expect(await names(block.locator("[data-stage-chain]"))).toEqual(["review", "tone"]);
    } finally {
      await context.close();
    }
  }, 120_000);

  test("puts a chain of its own back to the policy's, which the save sends as taking it away", async () => {
    const context = await signedIn({ viewport: { width: 1280, height: 900 } });
    const { saves } = await keptStages(context, { ...VIEW, source: "set", stages: ["sources", "review"] });

    try {
      const page = await context.newPage();
      const block = await openBlock(page);

      await block.locator("[data-stages-to-default]").click();
      expect(await until(async () => await names(block.locator("[data-stage-chain]")), (now) => now.length === 1)).toEqual(["review"]);

      await page.getByRole("button", { name: wording("common.action.save"), exact: true }).click();
      expect(await until(async () => saves.length, (count) => count > 0)).toBe(1);
      expect(saves[0]).toEqual({ stages: null });
    } finally {
      await context.close();
    }
  }, 120_000);
});

const ORDERED = { ...VIEW, source: "set", stages: ["review", "sources", "tone"], texts: [...TEXTS, { name: "tone", text: "whether the tone fits", source: "set", policyText: null }] };

describe.skipIf(!origin || !touchReady())("an instruction stage carried by its handle", () => {
  test("with the mouse lands where its row is lit, and the order saved stands after a reload", async () => {
    const context = await signedIn({ viewport: { width: 1280, height: 900 } });
    const { saves } = await keptStages(context, ORDERED);

    try {
      const page = await context.newPage();
      let chain = (await openBlock(page)).locator("[data-stage-chain]");

      // One handle per stage, each named for the stage it carries.
      for (const name of ["review", "sources", "tone"]) expect(await handleOf(chain, name).count()).toBe(1);

      // The chain stands low in the dialog's own scroll; a mouse presses only what is on the screen.
      await chain.scrollIntoViewIfNeeded();

      // `tone` carried up onto `review`: while held, it stands marked as held and `review`'s row is lit where it lands.
      const marks = await carryByMouse(page, await centre(handleOf(chain, "tone")), await centre(chain.locator('[data-stage="review"]')), async () => await rowMarks(chain));

      expect(marks).toEqual({ held: [2], over: [0] });
      expect(await names(chain)).toEqual(["tone", "review", "sources"]);
      expect(await rowMarks(chain)).toEqual({ held: [], over: [] });

      // A press on a handle that lets go where it went down moves nothing.
      const still = await centre(handleOf(chain, "sources"));

      await carryByMouse(page, still, still, async () => null);
      expect(await names(chain)).toEqual(["tone", "review", "sources"]);

      // The handle's arrow keys carry its stage one place and the focus comes to rest on it there, so
      // the keys go on answering: down from the first place and back up, the order landing as it stood.
      await handleOf(chain, "tone").press("ArrowDown");
      expect(await until(async () => await names(chain), (now) => now.join(",") === "review,tone,sources")).toEqual(["review", "tone", "sources"]);
      expect(await until(async () => await focused(page), (label) => label === wording("common.aria.reorder_named", { name: "tone" }))).toBe(wording("common.aria.reorder_named", { name: "tone" }));

      await page.keyboard.press("ArrowUp");
      expect(await until(async () => await names(chain), (now) => now.join(",") === "tone,review,sources")).toEqual(["tone", "review", "sources"]);

      await page.getByRole("button", { name: wording("common.action.save"), exact: true }).click();
      expect(await until(async () => saves.length, (count) => count > 0)).toBe(1);
      expect(saves[0]).toEqual({ stages: ["tone", "review", "sources"] });

      // The save closes the dialog; the screen loaded afresh reads the order it left.
      await page.locator("[data-supervisor-stages]").waitFor({ state: "detached", timeout: 15_000 });
      await page.reload({ waitUntil: "load" });
      chain = (await openBlock(page)).locator("[data-stage-chain]");
      expect(await names(chain)).toEqual(["tone", "review", "sources"]);
    } finally {
      await context.close();
    }
  }, 120_000);

  test("with a finger on a phone lands where it is let go", async () => {
    const context = await signedIn({ ...devices["Pixel 5"] });
    const { saves } = await keptStages(context, ORDERED);

    try {
      const page = await context.newPage();
      const finger = await fingerOn(page);
      const chain = (await openBlock(page)).locator("[data-stage-chain]");

      // A finger on the handle carries the row rather than scrolling the dialog.
      await handleOf(chain, "review").scrollIntoViewIfNeeded();
      await finger.swipe(await centre(handleOf(chain, "review")), await centre(chain.locator('[data-stage="tone"]')), { steps: 12 });
      expect(await names(chain)).toEqual(["sources", "tone", "review"]);

      await page.getByRole("button", { name: wording("common.action.save"), exact: true }).click();
      expect(await until(async () => saves.length, (count) => count > 0)).toBe(1);
      expect(saves[0]).toEqual({ stages: ["sources", "tone", "review"] });
    } finally {
      await context.close();
    }
  }, 120_000);
});
