import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, Page } from "playwright-core";

// The one title bar (docs/web.md, 「The title bar」): every screen stands the same set of buttons in the same place,
// and the set is one instance the layout holds, so a page change moves it into the next screen's bar rather than
// standing it up again. Read between every pair of the console's own screens, at both widths. Nothing stands beside the
// screen's name but on a room's: what concerns one screen stands in its own row under the bar, and a room stands its
// menu beside its name. The set's buttons stand apart by one gap, a multiple of 4px as every spacing is. It drives the console
// tests/support/browser-console.ts stands up; the suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "title-bar", password: "fixture-password-2318" };
const SCREENS = ["/", "/siren", "/db", "/documents", "/agents", "/agents/worker", "/monitor", "/rooms", "/rooms/42"];
const WIDTHS = [
  { width: 1280, height: 900, phone: false },
  { width: 360, height: 780, phone: true }
] as const;

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

// A step to another screen from inside the console, as a reader takes it. A screen that writes its own tab into the
// address as it settles can cancel a step asked in that moment, so the step is asked again until it lands.
async function go(page: Page, path: string): Promise<void> {
  for (let tries = 0; tries < 4; tries += 1) {
    await page.evaluate((to) => {
      const root: (Element & { __vue_app__?: { config: { globalProperties: { $router: { push: (to: string) => Promise<unknown> } } } } }) | null = document.querySelector("#__nuxt");

      void root!.__vue_app__!.config.globalProperties.$router.push(to);

      return true;
    }, path);

    const landed = await page
      .waitForFunction(
        (to: string) => {
          const bar = document.querySelector("[data-title-bar]");

          return location.pathname.replace(/\/$/, "").endsWith(to.replace(/\/$/, "")) && bar !== null && bar.querySelector("[data-title-bar-actions]") !== null;
        },
        path,
        { timeout: 5_000 }
      )
      .then(
        () => true,
        () => false
      );

    if (landed) return;
  }

  throw new Error(`${path} never stood with its bar: ${await page.evaluate(() => location.pathname)}`);
}

// What the screen's bar holds now: whether its set is the one marked at the start, and how many sets stand.
async function held(page: Page): Promise<{ same: boolean; sets: number; inBar: boolean; buttons: number }> {
  return await page.evaluate(() => {
    const sets = [...document.querySelectorAll("[data-title-bar-actions]")] as (Element & { __held?: boolean })[];
    const set = sets[0];

    return { same: set?.__held === true, sets: sets.length, inBar: set?.closest("[data-title-bar]") !== null, buttons: set?.querySelectorAll("button, a").length ?? 0 };
  });
}

describe.skipIf(!origin || !touchReady())("the one title bar", () => {
  for (const viewport of WIDTHS) {
    test(`keeps the one set of buttons across a change between every pair of screens, ${viewport.width}px wide`, async () => {
      const context = await browser!.newContext({ viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.phone, hasTouch: viewport.phone, serviceWorkers: "block", reducedMotion: "reduce" });
      const at = cookie.indexOf("=");

      await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/`, { waitUntil: "load" });
        await page.waitForFunction(() => {
          const root: (Element & { __vue_app__?: { $nuxt?: { isHydrating?: boolean } } }) | null = document.querySelector("#__nuxt");

          return root?.__vue_app__?.$nuxt?.isHydrating === false && document.querySelector("[data-title-bar-actions]") !== null;
        }, undefined, { timeout: 30_000 });
        await page.evaluate(() => {
          (document.querySelector("[data-title-bar-actions]") as Element & { __held?: boolean }).__held = true;
        });

        const first = await held(page);
        const seen: string[] = [];

        for (const from of SCREENS) {
          for (const to of SCREENS) {
            if (from === to) continue;

            await go(page, from);
            await go(page, to);

            const now = await held(page);

            if (!(now.same && now.sets === 1 && now.inBar && now.buttons === first.buttons)) seen.push(`${from} → ${to}: ${JSON.stringify(now)}`);
          }
        }

        expect(seen).toEqual([]);
        expect(first.buttons).toBeGreaterThan(0);
      } finally {
        await context.close();
      }
    }, 600_000);
  }
});

// Everything the screen's bar holds past its name, other than the set at its right end.
async function besideName(page: Page): Promise<string[]> {
  return await page.evaluate(() =>
    [...document.querySelectorAll("[data-title-bar]")].flatMap((bar) => {
      const after: string[] = [];

      for (let next = bar.querySelector(":scope > [data-slot=left] > [data-slot=title]")?.nextElementSibling; next; next = next.nextElementSibling) after.push(next.outerHTML.slice(0, 80));

      const right = [...bar.querySelectorAll(":scope > [data-slot=right] :is(button, a)")].filter((part) => part.closest("[data-title-bar-actions]") === null);

      return [...after, ...right.map((part) => part.outerHTML.slice(0, 80))];
    })
  );
}

describe.skipIf(!origin || !touchReady())("the screen's name alone in the bar", () => {
  for (const viewport of WIDTHS) {
    test(`an agent's actions stand in the row under the bar and a room's menu beside its name, ${viewport.width}px wide`, async () => {
      const context = await browser!.newContext({ viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.phone, hasTouch: viewport.phone, serviceWorkers: "block", reducedMotion: "reduce" });
      const at = cookie.indexOf("=");

      await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

      try {
        const page = await context.newPage();

        // The worker is a role, so its settings stand on its screen, folded into the row's menu on a phone.
        await page.goto(`${origin}/agents/worker`, { waitUntil: "load" });

        const agentRow = page.locator("[data-screen-row]");
        const settings = viewport.phone ? agentRow.locator("[aria-haspopup=menu]") : agentRow.getByRole("button", { name: wording("agents.action.settings") });

        await settings.waitFor({ timeout: 30_000 });
        expect(await besideName(page)).toEqual([]);

        // The room's menu stands beside the room's name, with no row of the room's own under the bar.
        await page.goto(`${origin}/rooms/42`, { waitUntil: "load" });
        await page.locator("[data-title-bar] [data-room-menu]").waitFor({ timeout: 30_000 });
        expect(await page.locator("[data-room-row]").count()).toBe(0);
      } finally {
        await context.close();
      }
    }, 120_000);
  }
});

describe.skipIf(!origin || !touchReady())("the set's spacing", () => {
  for (const viewport of WIDTHS) {
    test(`the set's parts stand one 4px-multiple gap apart, ${viewport.width}px wide`, async () => {
      const context = await browser!.newContext({ viewport: { width: viewport.width, height: viewport.height }, isMobile: viewport.phone, hasTouch: viewport.phone, serviceWorkers: "block", reducedMotion: "reduce" });
      const at = cookie.indexOf("=");

      await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/`, { waitUntil: "load" });
        const set = page.locator("[data-title-bar] [data-title-bar-actions]");

        await set.waitFor({ timeout: 30_000 });

        // The gaps the bar and its set lay between their parts, and the room between each pair of the set's parts that
        // stand; which of the set's parts stand turns on what the units answer.
        const spacing = await page.locator("[data-title-bar]").first().evaluate((bar) => {
          const set = bar.querySelector("[data-title-bar-actions]")!;
          const boxes = [...set.children].map((one) => one.getBoundingClientRect()).filter((box) => box.width > 0).sort((a, b) => a.left - b.left);
          const gapOf = (element: Element | null) => (element === null ? 0 : parseFloat(getComputedStyle(element).columnGap));

          return {
            gaps: [gapOf(bar), gapOf(bar.querySelector("[data-slot=left]")), gapOf(bar.querySelector("[data-slot=right]")), gapOf(set)],
            set: gapOf(set),
            between: boxes.slice(1).map((box, place) => Math.round(box.left - boxes[place]!.right))
          };
        });

        expect(spacing.gaps.every((gap) => gap > 0 && gap % 4 === 0)).toBe(true);
        expect(spacing.between.every((room) => room === spacing.set)).toBe(true);
      } finally {
        await context.close();
      }
    }, 120_000);
  }
});
