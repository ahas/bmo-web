import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser } from "playwright-core";

// The agent management screen's tabs (docs/web.md, 「Agent management screen」): the supervisors, the roles and the
// repositories each stand as one shared settings table with every row the agency answers, and a column's width dragged
// moves that column alone — every other column keeps the width it stood at and the table grows or shrinks by the
// drag. It drives the console tests/support/browser-console.ts stands up; the suite stands up no console, so there it
// skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "agents-general", password: "fixture-password-2301" };

// The draft process and its questions, served through the page's own route: enough rows that the supervisors' tab
// scrolls on a short screen, a long list of questions in a cell and a question's long text.
const QUESTIONS = ["sense", "plan", "check", "tone", "final"];
const CATALOGUE = ["sense", "plan", "check", "tone", "scope", "facts", "voice", "final"];
const DRAFTS = {
  rows: Array.from({ length: 6 }, (_, index) => ({
    provider: index === 0 ? "*" : "claude-code",
    tier: "*",
    agentName: index < 2 ? "*" : `agent-${index}`,
    rounds: QUESTIONS,
    sendFrom: "",
    light: ["final"],
    lightChars: 40,
    ceilingSeconds: 120,
    pastCeiling: "send",
    source: index === 0 ? "default" : "set"
  })),
  questions: CATALOGUE.map((name) => ({ name, text: `The question ${name} asks of a round, written out at length so that its line runs past any column's ceiling.`, source: "default" }))
};

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

describe.skipIf(!origin || !touchReady())("the agent management screen's tabs", () => {
  for (const [width, height, phone] of [[1280, 900, false], [360, 780, true]] as const) {
    test(`stand every supervisor, role and repository as a row, ${width}px wide`, async () => {
      const context = await browser!.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, serviceWorkers: "block", reducedMotion: "reduce" });
      const at = cookie.indexOf("=");

      await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/agents`, { waitUntil: "load" });
        await page.locator("#setting-supervisor-agent-a").waitFor({ timeout: 15_000 });
        expect(await page.locator("#setting-supervisor-companion-a").count()).toBe(1);
        expect((await page.locator(`[aria-label="${wording("agents.aria.settings_sections")}"]`).getByRole("tab").allInnerTexts()).map((one) => one.trim())).toEqual(
          ["agents.label.tab_supervisors", "agents.label.tab_roles", "agents.label.tab_repositories", "agents.label.tab_models", "agents.label.tab_model_files"].map((key) => wording(key))
        );

        await page.goto(`${origin}/agents?tab=roles`, { waitUntil: "load" });
        await page.locator("#setting-role-worker").waitFor({ timeout: 15_000 });
        for (const name of ["delegator", "helper", "builder", "scout", "searcher"]) expect(await page.locator(`#setting-role-${name}`).count()).toBe(1);

        await page.goto(`${origin}/agents?tab=repositories`, { waitUntil: "load" });
        await page.locator("#setting-repository-repo-a").waitFor({ timeout: 15_000 });
        expect(await page.locator("#setting-repository-repo-c").count()).toBe(1);

        // The page itself never scrolls sideways; a wide table scrolls inside its own box.
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      } finally {
        await context.close();
      }
    }, 60_000);
  }

  test("move only the dragged column, every other one keeping its width", async () => {
    const context = await browser!.newContext({ viewport: { width: 1600, height: 900 }, serviceWorkers: "block", reducedMotion: "reduce" });
    const at = cookie.indexOf("=");

    await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

    try {
      const page = await context.newPage();

      await page.goto(`${origin}/agents`, { waitUntil: "load" });
      await page.locator("#setting-supervisor-agent-a").waitFor({ timeout: 15_000 });

      // The supervisors' own table, the first of the tab's; the draft tables under it are tables of their own.
      const heads = page.locator("[data-settings-table]").first().locator("thead > tr > th");
      const widths = async (): Promise<number[]> =>
        await heads.evaluateAll((cells) => cells.map((cell) => Math.round(cell.getBoundingClientRect().width)));
      const before = await widths();
      const edge = heads.nth(2).getByRole("separator");
      const box = (await edge.boundingBox())!;

      // A first drag holds every width, then narrows the third column by 40 pixels.
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 - 40, box.y + box.height / 2, { steps: 5 });
      await page.mouse.up();

      const after = await widths();

      expect(after[2]).toBeLessThan(before[2]!);
      expect(after.filter((_, index) => index !== 2)).toEqual(before.filter((_, index) => index !== 2));
    } finally {
      await context.close();
    }
  }, 60_000);

  for (const [width, height, phone] of [[1280, 260, false], [360, 400, true]] as const) {
    test(`scroll each tab in one box, the supervisors' table heads sticking to the tab's top, ${width}px wide`, async () => {
      const context = await browser!.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, serviceWorkers: "block", reducedMotion: "reduce" });
      const at = cookie.indexOf("=");

      await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
      await context.route(/\/api\/draft-processes$/, (route) => route.fulfill({ json: DRAFTS }));

      try {
        const page = await context.newPage();

        // A tab of one table scrolls in the table's own box alone; the body around it stands still.
        await page.goto(`${origin}/agents?tab=roles`, { waitUntil: "load" });
        await page.locator("#setting-role-worker").waitFor({ timeout: 15_000 });
        expect(await page.locator("[data-settings-table]").first().evaluate(scrollersAbove)).toEqual({ scrollers: 1, body: "hidden" });

        // The supervisors' tab scrolls in its body, and each table's head stands at the body's top as its rows pass.
        await page.goto(`${origin}/agents`, { waitUntil: "load" });
        await page.locator("[data-draft-questions] tbody tr").first().waitFor({ timeout: 15_000 });

        for (const table of ["[data-settings-table]:not([data-draft-processes]):not([data-draft-questions])", "[data-draft-processes]", "[data-draft-questions]"]) {
          const stuck = await page.locator(table).evaluate(async (root) => {
            let body = root.parentElement!;

            while (!["auto", "scroll"].includes(getComputedStyle(body).overflowY)) body = body.parentElement!;

            const head = root.querySelector("thead")!;

            // Scrolled a little way into the table, its head's own place gone past the body's top.
            body.scrollTop += root.getBoundingClientRect().top - body.getBoundingClientRect().top + 20;
            await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));

            return { overflow: getComputedStyle(root).overflowY, gap: Math.round(head.getBoundingClientRect().top - body.getBoundingClientRect().top), body: getComputedStyle(body).overflowY };
          });

          expect({ table, ...stuck }).toEqual({ table, overflow: "visible", gap: 0, body: "auto" });
        }

        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      } finally {
        await context.close();
      }
    }, 60_000);

    test(`drop a cell's dropdown as wide as what it holds and inside the screen, ${width}px wide`, async () => {
      const context = await browser!.newContext({ viewport: { width, height: 800 }, isMobile: phone, hasTouch: phone, serviceWorkers: "block", reducedMotion: "reduce" });
      const at = cookie.indexOf("=");
      const name = wording("agents.aria.max_concurrent_of", { name: "" }).trim();

      await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/agents?tab=roles`, { waitUntil: "load" });

        const cell = page.locator(`button[aria-label$="${name}"]`).first();

        await cell.waitFor({ timeout: 15_000 });
        await cell.click();

        const drop = page.locator(`[role="group"][aria-label$="${name}"]`);

        await drop.waitFor();

        const measured = await drop.evaluate((box) => {
          const shown = box.getBoundingClientRect();
          // The same box laid out at its content's own width, with no floor and no ceiling.
          const copy = box.cloneNode(true) as HTMLElement;

          copy.style.cssText = "position: fixed; visibility: hidden; min-width: 0; max-width: none; width: max-content";
          document.body.append(copy);

          const own = copy.getBoundingClientRect().width;

          copy.remove();

          return { width: shown.width, left: shown.left, right: shown.right, own, cut: box.scrollWidth - box.clientWidth, screen: innerWidth };
        });
        const floor = (await cell.boundingBox())!.width;

        expect(measured.cut).toBeLessThanOrEqual(0);
        expect(measured.left).toBeGreaterThanOrEqual(0);
        expect(measured.right).toBeLessThanOrEqual(measured.screen);
        expect(Math.abs(measured.width - Math.min(Math.max(measured.own, floor), measured.screen - 16))).toBeLessThanOrEqual(1);
      } finally {
        await context.close();
      }
    }, 60_000);
  }

  test("give the draft tables' title column what is left, every other column its content's width", async () => {
    const context = await browser!.newContext({ viewport: { width: 1600, height: 900 }, serviceWorkers: "block", reducedMotion: "reduce" });
    const at = cookie.indexOf("=");

    await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
    await context.route(/\/api\/draft-processes$/, (route) => route.fulfill({ json: DRAFTS }));

    try {
      const page = await context.newPage();

      await page.goto(`${origin}/agents`, { waitUntil: "load" });
      await page.locator("[data-draft-questions] tbody tr").first().waitFor({ timeout: 15_000 });

      for (const [table, title] of [["[data-draft-processes]", 2], ["[data-draft-questions]", 0]] as const) {
        // The widths as the table stands, then as it stands laid out at its content's width with no column flexible:
        // a column at its content's own width is the same in both.
        const widths = await page.locator(table).evaluate((root) => {
          const table = root.querySelector("table")!;
          const heads = [...table.querySelectorAll<HTMLElement>("thead > tr > th")];
          const read = () => heads.map((head) => Math.round(head.getBoundingClientRect().width));
          const standing = read();
          const flexible = heads.filter((head) => head.classList.contains("w-full"));

          flexible.forEach((head) => head.classList.remove("w-full"));
          table.style.width = "max-content";
          table.style.minWidth = "0";

          const own = read();

          flexible.forEach((head) => head.classList.add("w-full"));
          table.style.width = "";
          table.style.minWidth = "";

          return { standing, own, flexible: heads.map((head) => flexible.includes(head)) };
        });

        expect(widths.flexible.map((one, index) => (one ? index : -1)).filter((index) => index >= 0)).toEqual([title]);
        for (const [index, width] of widths.standing.entries()) {
          if (index === title) expect(width).toBeGreaterThan(widths.own[index]! + 8);
          else expect({ table, index, width }).toEqual({ table, index, width: widths.own[index]! });
        }
      }
    } finally {
      await context.close();
    }
  }, 60_000);
});

// Which scrolling boxes stand between a table's first row and the page: the table's own alone, the body around it
// not scrolling.
function scrollersAbove(root: Element): { scrollers: number; body: string } {
  let scrollers = 0;

  for (let at: Element | null = root.querySelector("tbody tr"); at !== null; at = at.parentElement) {
    const style = getComputedStyle(at);

    if ((style.overflowY === "auto" || style.overflowY === "scroll") && at.scrollHeight > at.clientHeight) scrollers += 1;
  }

  return { scrollers, body: getComputedStyle(root.closest("section")!.parentElement!).overflowY };
}
