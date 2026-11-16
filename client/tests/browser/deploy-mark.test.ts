import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";

import { DEPLOY_ICON } from "../../apps/web/app/domain/deploy";

import type { Browser } from "playwright-core";
import type { DeployView } from "../../apps/web/shared/types";

// The deployment's mark in the title bar through a run (docs/web.md, 「Deployment in the title bar」): while a run
// is under way the mark is the one spinning progress mark, read after read as the console's word moves it; the run
// ended stands its outcome; a page older than the console stands the deploy icon, trading places with the spinner as
// another unit's run begins and ends, and never a circular arrow. What is read is the glyph the browser draws, looked
// up in the installed set, so a name the set lacks, which draws nothing, fails as surely as the arrow. It drives the
// console tests/support/browser-console.ts stands up; the suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "topbar-square", password: "fixture-password-1444" };

// Each glyph of the installed set by its outline, so what the browser draws is named by the icon it is.
const SET = (await import(Bun.resolveSync("@iconify-json/material-symbols/icons.json", new URL("../../apps/web/", import.meta.url).pathname), { with: { type: "json" } })).default as { icons: Record<string, { body: string }> };
const GLYPHS = new Map<string, string>();

for (const [name, icon] of Object.entries(SET.icons)) {
  const outline = icon.body.match(/ d="([^"]+)"/)?.[1];

  if (outline !== undefined && !GLYPHS.has(outline)) GLYPHS.set(outline, name);
}

const run = (phase: "running" | "ended", stage: string, unitName = "unit-a"): NonNullable<DeployView["run"]> => ({
  unitName,
  phase,
  startedAt: Date.now() - 60_000,
  endedAt: phase === "ended" ? Date.now() : null,
  outcome: phase === "ended" ? "live" : null,
  commit: null,
  carried: [],
  plan: [],
  stages: [{ stage: stage as never, at: Date.now() }],
  steps: [],
  ahead: [],
  running: null
});

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

describe.skipIf(!origin || !touchReady())("the deployment's mark", () => {
  test("spins one progress mark through a run, stands its outcome, then the deploy icon, never an arrow", async () => {
    const context = await browser!.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: "block" });
    const at = cookie.indexOf("=");
    // What the console answers, read after read: a run moving through its stages and past the console's restart,
    // where the release the console serves changes, then its end, then no run.
    const views: DeployView[] = [
      ...["tree", "backup", "build", "restart"].map((stage) => ({ release: "release-old", detailed: true, hold: null, run: run("running", stage) })),
      ...["health", "finish"].map((stage) => ({ release: "release-new", detailed: true, hold: null, run: run("running", stage) })),
      { release: "release-new", detailed: true, hold: null, run: run("ended", "finish") },
      { release: "release-new", detailed: true, hold: null, run: null },
      // Another unit's run begins and ends while the page is older.
      { release: "release-new", detailed: true, hold: null, run: run("running", "build", "unit-b") },
      { release: "release-new", detailed: true, hold: null, run: null }
    ];
    let step = 0;

    await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
    await context.route(/\/api\/deploy$/, (route) => route.fulfill({ json: views[Math.min(step, views.length - 1)] }));
    // Each connection of the stream says the deployment moved and closes, and the next one opens half a second later.
    await context.route(/\/api\/events(\?|$)/, (route) =>
      route.fulfill({ contentType: "text/event-stream", body: `retry: 300\n\nevent: run\ndata: {"run":"fixture"}\n\nevent: deploy\ndata: {}\n\n` })
    );

    try {
      const page = await context.newPage();

      await page.goto(`${origin}/`, { waitUntil: "load" });
      await page.locator("[data-title-bar-actions] [data-deploy-mark]").waitFor({ timeout: 20_000 });

      const marks: string[] = [];
      // The glyph drawn, by the outline its mask carries, and a star where it spins; "nothing" where no glyph is drawn.
      const mark = async (): Promise<string> => {
        const drawn = await page.evaluate(() => {
          const icon = document.querySelector<HTMLElement>("[data-title-bar-actions] [data-deploy-mark] .iconify");

          if (icon === null) return { mask: "", spins: false };

          const style = getComputedStyle(icon);

          return { mask: style.maskImage || style.webkitMaskImage, spins: style.animationName !== "none" };
        });
        const outline = decodeURIComponent(drawn.mask).match(/ d='([^']+)'/)?.[1];
        const name = outline === undefined ? "nothing" : (GLYPHS.get(outline) ?? "unknown");

        return `${name}${drawn.spins ? "*" : ""}`;
      };

      // Each step is read once the stream has said the deployment moved and the console answered it.
      for (step = 0; step < views.length; step++) {
        await page.waitForTimeout(900);
        marks.push(await mark());
      }

      const running = marks.slice(0, 6);

      const rest = DEPLOY_ICON.replace("i-material-symbols-", "");

      expect(running).toEqual(Array(6).fill("progress-activity*"));
      expect(marks[6]).toBe("check-circle-outline");
      // The page is older than the console after the run: the deploy icon, still, trading places with the spinner.
      expect(marks.slice(7)).toEqual([rest, "progress-activity*", rest]);
      expect(marks.some((one) => /refresh|autorenew|sync|cached|nothing|unknown/.test(one))).toBe(false);
    } finally {
      await context.close();
    }
  }, 90_000);

  // The popover opens on the stages, the mark's own words heading it at phone width alone, since a wide bar already
  // says them; what goes up stands folded to its first three entries and how many more, a press opening it whole in
  // place and the next closing it again.
  for (const viewport of [{ width: 1280, height: 800 }, { width: 360, height: 780 }]) {
    test(`opens on the stages with what goes up folded at ${viewport.width}`, async () => {
      const context = await browser!.newContext({ viewport, serviceWorkers: "block" });
      const at = cookie.indexOf("=");
      const carried = Array.from({ length: 6 }, (_, index) => ({ commit: `${index}`.repeat(40), subject: `Change number ${index + 1}`, todoId: index === 0 ? 1001 : null }));
      const view: DeployView = { release: "release-a", detailed: true, hold: null, run: { ...run("running", "build"), plan: ["tree", "backup", "build", "restart"] as never, carried, commit: "f".repeat(40) } };

      await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
      await context.route(/\/api\/deploy$/, (route) => route.fulfill({ json: view }));
      await context.route(/\/api\/deploy\/log$/, (route) => route.fulfill({ json: [] }));

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/`, { waitUntil: "load" });
        await page.locator("[data-title-bar-actions] [data-deploy-mark]").click({ timeout: 20_000 });

        const stages = page.locator("[data-deploy-stages]");
        const status = page.locator("[data-deploy-status]");
        const fold = page.locator("[data-deploy-items]");

        await stages.waitFor();

        // The status line stands at phone width alone, and above the stages; the stages stand above what goes up.
        expect(await status.isVisible()).toBe(viewport.width < 640);

        const top = async (locator: typeof stages): Promise<number> => (await locator.boundingBox())!.y;

        if (viewport.width < 640) expect(await top(status)).toBeLessThan(await top(stages));
        expect(await top(stages)).toBeLessThan(await top(fold));

        // Folded: the first three, how many more, and a press that opens it whole and the next that closes it.
        const entries = fold.locator("[data-deploy-entry]");

        expect(await entries.count()).toBe(3);
        expect(await fold.getAttribute("aria-expanded")).toBe("false");
        // The rest is counted, whatever words the pack puts round the count.
        expect(await fold.locator("[data-deploy-rest]").textContent()).toMatch(/(^|\D)3(\D|$)/);

        await fold.locator("[data-deploy-rest]").click();
        await entries.nth(5).waitFor();
        expect(await entries.count()).toBe(6);
        expect(await fold.getAttribute("aria-expanded")).toBe("true");
        // The count of the rest is a row of the list, which folds away as the rest unfold.
        await fold.locator("[data-deploy-rest]").waitFor({ state: "detached" });

        const box = (await fold.boundingBox())!;

        await fold.click({ position: { x: box.width - 8, y: box.height - 8 } });
        await entries.nth(3).waitFor({ state: "detached" });
        expect(await entries.count()).toBe(3);
        expect(await fold.getAttribute("aria-expanded")).toBe("false");

        // Left open, closed and opened again, it stands folded.
        await fold.locator("[data-deploy-rest]").click();
        await entries.nth(5).waitFor();
        await page.keyboard.press("Escape");
        await fold.waitFor({ state: "detached" });
        await page.locator("[data-title-bar-actions] [data-deploy-mark]").click();
        await fold.waitFor();
        expect(await entries.count()).toBe(3);
        expect(await fold.getAttribute("aria-expanded")).toBe("false");
      } finally {
        await context.close();
      }
    }, 120_000);
  }
});
