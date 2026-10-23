import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, BrowserContext, Page } from "playwright-core";
import type { DeployView } from "../../apps/web/shared/types";
import KO from "../fixtures/browser/topbar-square.test.ko.json";

// Every button in a title bar that shows only a mark is the bar's own icon button: a square, and
// the same square as every other one (docs/web.md, 「Tab bar and toolbar」). A mark whose words fold
// away at phone width is held to it from the moment it stands alone, and the deployment's
// mark for a newer release is held to it at every width. Each is measured as the browser lays it out, in both
// themes, since a size read off the source says nothing about what the library's styles made of it.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up:
// the development server on a scratch database, with stand-ins for the units it reads and this file's fixture
// account made there (docs/checks.md, 「How the suite runs the tests」). The suite stands up no console, so
// there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "topbar-square", password: "fixture-password-1444" };
// A desktop, and a Galaxy S25 held upright, where every folding mark stands alone.
const WIDTHS = [{ width: 1280, height: 800, phone: false }, { width: 360, height: 780, phone: true }];
const SCHEMES = ["light", "dark"] as const;

// The deployment as the bar is told of it: a page older than the console, and a run under way.
const NEWER: DeployView = { release: "fixture-release", detailed: true, run: null, hold: null };
const RUNNING: DeployView = {
  release: "fixture-release",
  detailed: true,
  hold: null,
  run: { unitName: "unit-a", phase: "running", startedAt: Date.now(), endedAt: null, outcome: null, commit: null, plan: [], stages: [{ stage: "tree", at: Date.now() }], steps: [], ahead: [], running: null }
};

type Mark = { name: string; width: number; height: number };

let browser: Browser | null = null;
let cookie = "";

beforeAll(async () => {
  if (!origin || !touchReady()) {
    return;
  }

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

async function open(viewport: (typeof WIDTHS)[number], scheme: (typeof SCHEMES)[number], deploy: DeployView | null): Promise<BrowserContext> {
  const context = await browser!.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.phone,
    hasTouch: viewport.phone,
    colorScheme: scheme,
    serviceWorkers: "block",
    reducedMotion: "reduce"
  });
  const at = cookie.indexOf("=");

  await context.addCookies([
    { name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! },
    { name: "nuxt-color-mode", value: scheme, url: origin! }
  ]);

  if (deploy !== null) {
    await context.route(/\/api\/deploy$/, (route) => route.fulfill({ json: deploy }));
  }

  return context;
}

// A screen that reads its figures again and again never goes quiet, so its first reads are given a
// bounded while to land and the bar is read as it then stands.
async function visit(page: Page, path: string): Promise<void> {
  await page.goto(`${origin}${path}`, { waitUntil: "load" });
  await page.waitForFunction(() => (document.querySelector("#__nuxt") as unknown as { __vue_app__?: { $nuxt?: { isHydrating?: boolean } } })?.__vue_app__?.$nuxt?.isHydrating === false);
  await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
}

// Every visible button of the title bar with no words on it, as the browser laid it out. The title
// bar is the one row holding the sidebar's toggle, which a toolbar under it never does.
async function marks(page: Page): Promise<Mark[]> {
  return await page.evaluate(() => {
    return [...document.querySelectorAll<HTMLElement>("[data-slot=root]:has(> [data-slot=left] > [data-slot=toggle])")]
      .flatMap((bar) => [...bar.querySelectorAll<HTMLElement>("button, a")])
      .filter((button) => button.getClientRects().length > 0 && button.innerText.trim() === "")
      .map((button) => {
        const box = button.getBoundingClientRect();

        return { name: button.getAttribute("aria-label") ?? "", width: box.width, height: box.height };
      });
  });
}

// Where the sidebar leads, as the addresses under the console's base path.
async function listed(page: Page): Promise<string[]> {
  const base = new URL(origin!).pathname.replace(/\/$/, "");
  const hrefs = await page.evaluate(() => [...document.querySelectorAll("nav")]
    .map((nav) => [...nav.querySelectorAll("a[href]")].map((link) => link.getAttribute("href")!))
    .filter((links) => links.length > 0)
    .flatMap((links, at) => (at === 0 ? links : links.slice(0, 1))));

  return [...new Set(hrefs.filter((href) => href.startsWith(`${base}/`)).map((href) => href.slice(base.length)))];
}

// Every mark a square, and every square the same one.
function expectSquares(found: Record<string, Mark[]>): void {
  const all = Object.values(found).flat();
  const side = all[0]!.height;

  expect(all.length).toBeGreaterThan(0);
  expect(Object.entries(found).flatMap(([at, list]) => list.filter((mark) => mark.width !== side || mark.height !== side).map((mark) => ({ at, ...mark })))).toEqual([]);
}

describe.skipIf(!origin || !touchReady())("the title bar's icon buttons", () => {
  for (const viewport of WIDTHS) {
    for (const scheme of SCHEMES) {
      test(`the deployment's marks are the bar's square at ${viewport.width}px in ${scheme}`, async () => {
        const found: Record<string, Mark[]> = {};

        for (const [state, deploy] of [["newer", NEWER], ["running", RUNNING]] as const) {
          const context = await open(viewport, scheme, deploy);

          try {
            const page = await context.newPage();

            await visit(page, "/");

            // The mark has come up before the bar is read.
            const name = state === "newer" ? KO.line_141 : new RegExp(KO.line_141_2);

            await page.getByRole("button", { name }).first().waitFor();
            found[state] = await marks(page);
          } finally {
            await context.close();
          }
        }

        expect(found.newer!.some((mark) => mark.name === wording("common.aria.refresh_standing", { standing: KO.line_150 }))).toBe(true);
        // Standing alone only where its words fold away.
        expect(found.running!.some((mark) => mark.name.startsWith(wording("deploy.status.running")))).toBe(viewport.phone);
        expectSquares(found);
      }, 60_000);
    }

    test(`every screen's title bar keeps the one square at ${viewport.width}px`, async () => {
      const context = await open(viewport, "light", null);

      try {
        const page = await context.newPage();
        const found: Record<string, Mark[]> = {};

        await visit(page, "/");

        for (const path of ["/", ...await listed(page)]) {
          await visit(page, path);
          found[path] = await marks(page);
        }

        expect(Object.keys(found).length).toBeGreaterThan(12);
        expectSquares(found);
      } finally {
        await context.close();
      }
    }, 180_000);
  }
});

// The deployment's popover grows out of its mark as a whole: nothing inside it slides in from where the popover was
// drawn before it was placed (docs/web.md, 「Floating things」), its stages and steps standing in place from the
// first frame. Motion is left on, since it is the movement that is read.
describe.skipIf(!origin || !touchReady())("the deployment's popover", () => {
  for (const viewport of WIDTHS) {
    test(`opens with its stages in place at ${viewport.width}px`, async () => {
      const context = await browser!.newContext({ viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.phone, hasTouch: viewport.phone, serviceWorkers: "block" });
      const at = cookie.indexOf("=");

      await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
      await context.route(/\/api\/deploy$/, (route) => route.fulfill({ json: { ...RUNNING, run: { ...RUNNING.run!, startedAt: Date.now() - 60_000, plan: ["check", "tree", "after"], stages: [{ stage: "check", at: Date.now() - 60_000 }, { stage: "tree", at: Date.now() - 20_000 }] } } }));

      try {
        const page = await context.newPage();

        await visit(page, "/");

        const mark = page.getByRole("button", { name: new RegExp(KO.line_141_2) }).first();

        await mark.waitFor();
        await page.evaluate(() => {
          const kept = window as unknown as { __shifts: number[] };

          kept.__shifts = [];
          const started = performance.now();
          const look = (): void => {
            for (const item of document.querySelectorAll("[data-reka-popper-content-wrapper] li")) {
              const moved = new DOMMatrixReadOnly(getComputedStyle(item).transform === "none" ? undefined : getComputedStyle(item).transform);

              kept.__shifts.push(Math.abs(moved.m41) + Math.abs(moved.m42));
            }

            if (performance.now() - started < 1_200) requestAnimationFrame(look);
          };

          requestAnimationFrame(look);
        });
        await mark.click();
        await page.waitForTimeout(1_500);

        const shifts = await page.evaluate(() => (window as unknown as { __shifts: number[] }).__shifts);

        expect(shifts.length).toBeGreaterThan(0);
        expect(Math.max(...shifts)).toBeLessThan(1);
      } finally {
        await context.close();
      }
    }, 60_000);
  }
});
