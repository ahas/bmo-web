import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";

import type { Browser, BrowserContext, Page } from "playwright-core";

// An add that belongs to a row stays in that row at every width (docs/web.md, 「The title bar」): a tab row's add is
// the row's grey icon last in the row, named by its tooltip, on a desk's width and on a phone alike, with nothing
// floating over the screen for it and no room kept for a floating button at the body's foot; the sidebar's new chat
// stays beside the rooms' heading in the phone's drawer. Each is read at both widths, in light and in dark.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "row-add", password: "fixture-password-2885" };

// Each screen with a tab row that adds, and what its add is named. The providers tab of /admin holds none: its Claude
// login is added from the accounts heading.
const SCREENS = [
  { path: "/agents", label: "agents.title.role_add" },
  { path: "/research", label: "research.title.ask" },
  { path: "/organization", label: "organization.action.add" },
  { path: "/organization?tab=invites", label: "invites.label.make" },
  { path: "/admin?tab=secret-kinds", label: "secrets.action.kind_add" }
];

const WIDE = { width: 1280, height: 800 };
const PHONE = { width: 360, height: 740 };

let browser: Browser | null = null;
let cookie = "";

beforeAll(async () => {
  if (!origin || !touchReady()) return;

  const answer = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ACCOUNT) });

  expect(answer.ok).toBe(true);
  cookie = answer.headers.get("set-cookie")!.split(";")[0]!;
  browser = await chromium.launch();
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();
}, BROWSER_HOOK_MS);

async function contextFor(size: { width: number; height: number }, scheme: "light" | "dark"): Promise<BrowserContext> {
  const phone = size.width < 640;
  const context = await browser!.newContext({ viewport: size, colorScheme: scheme, hasTouch: phone, isMobile: phone, serviceWorkers: "block", reducedMotion: "reduce" });
  const at = cookie.indexOf("=");

  await context.addCookies([
    { name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! },
    { name: "nuxt-color-mode", value: scheme, url: origin! }
  ]);

  return context;
}

// A screen opened, the console's app standing on it and its add drawn.
async function open(page: Page, path: string): Promise<void> {
  await page.goto(`${origin}${path}`, { waitUntil: "load" });
  await page.waitForFunction(() => window.useNuxtApp?.().isHydrating === false, null, { timeout: 30_000 });
  await page.locator("[data-tab-add]").waitFor({ timeout: 20_000 });
}

// Where the tab row's add stands against its row, and whether anything floats or keeps room for a floating button.
async function placeOf(page: Page) {
  return await page.evaluate(() => {
    const button = document.querySelector<HTMLElement>("[data-tab-add]")!;
    const row = document.querySelector<HTMLElement>('[role="tablist"]')!.closest<HTMLElement>(".h-12")!;
    const box = button.getBoundingClientRect();
    const line = row.getBoundingClientRect();
    // The tabs scroll sideways inside their own list, so a tab past the screen's edge is no control after the add.
    const controls = [...row.querySelectorAll<HTMLElement>("button, input")].filter((one) => one.closest('[role="tablist"]') === null);
    const rightmost = Math.max(...controls.map((one) => one.getBoundingClientRect().right));

    return {
      inRow: row.contains(button),
      lastInRow: Math.round(box.right) === Math.round(rightmost) && box.right <= line.right && box.right <= window.innerWidth,
      centred: Math.abs(box.top + box.height / 2 - (line.top + line.height / 2)) <= 1,
      background: getComputedStyle(button).backgroundColor,
      floats: document.querySelectorAll("[data-screen-foot]").length > 0,
      roomKept: document.querySelectorAll('[class*="pb-(--bmo-create-room)"]').length > 0,
      height: Math.round(box.height)
    };
  });
}

// The tab row's add on every screen: in its row, last, centred on it, a ghost at rest and nothing floating.
async function readEveryScreen(page: Page): Promise<number[]> {
  const heights: number[] = [];

  for (const screen of SCREENS) {
    await open(page, screen.path);

    const place = await placeOf(page);

    expect({ path: screen.path, inRow: place.inRow, lastInRow: place.lastInRow, centred: place.centred, floats: place.floats, roomKept: place.roomKept }).toEqual({
      path: screen.path,
      inRow: true,
      lastInRow: true,
      centred: true,
      floats: false,
      roomKept: false
    });
    // A ghost button paints nothing at rest.
    expect(place.background).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
    expect(await page.locator("[data-tab-add]").getAttribute("aria-label")).toBe(wording(screen.label));
    heights.push(place.height);
  }

  return heights;
}

// The sidebar's new chat button beside the rooms' heading: the heading's grey icon, centred on its line, never floating.
async function roomAddBesideHeading(page: Page): Promise<void> {
  // A phone keeps the desk's sidebar in the page, hidden, beside the drawer it opens, so the add read is the one shown.
  const add = page.locator("[data-new-chat]:visible");

  await add.waitFor({ timeout: 20_000 });
  expect(await add.getAttribute("aria-label")).toBe(wording("room.title.new_chat"));
  expect(
    await add.evaluate((button) => {
      const mark = button.getBoundingClientRect();
      const head = button.closest("nav")!.firstElementChild!.getBoundingClientRect();

      return { centred: Math.abs(mark.top + mark.height / 2 - (head.top + head.height / 2)) <= 1, floats: button.closest("[data-screen-foot]") !== null };
    })
  ).toEqual({ centred: true, floats: false });
}

describe.skipIf(!origin)("the row adds", () => {
  for (const scheme of ["light", "dark"] as const) {
    test(`stand last in their tab rows on a desk's width, named by their tooltips, in ${scheme}`, async () => {
      const context = await contextFor(WIDE, scheme);

      try {
        const page = await context.newPage();

        // The row's small square button, as every button of a tab row is.
        expect(new Set(await readEveryScreen(page))).toEqual(new Set([28]));

        // The shared tooltip, the library's floating content, names what the add makes.
        await page.locator("[data-tab-add]").hover();
        await page.locator("[data-reka-popper-content-wrapper]").filter({ hasText: wording("secrets.action.kind_add") }).first().waitFor({ timeout: 5_000 });
        await page.mouse.move(0, 0);

        // A secret, made in the reader's own store in the settings dialog, is the grey icon centred on the list's
        // heading, named by its tooltip.
        await page.goto(`${origin}/?settings=secrets`, { waitUntil: "load" });

        const secretAdd = page.locator("[data-secret-add]");

        await secretAdd.waitFor({ timeout: 20_000 });
        expect(await secretAdd.getAttribute("aria-label")).toBe(wording("secrets.action.add"));
        expect(
          await secretAdd.evaluate((button) => {
            const mark = button.getBoundingClientRect();
            const head = button.closest("section")!.querySelector("h3")!.getBoundingClientRect();

            return Math.abs(mark.top + mark.height / 2 - (head.top + head.height / 2));
          })
        ).toBeLessThanOrEqual(1);

        await roomAddBesideHeading(page);

        // A link is made in the dialog the invitations' add opens: the company, the unit, the role and the span,
        // with the make at its foot.
        await open(page, "/organization?tab=invites");
        await page.locator("[data-tab-add]:enabled").click({ timeout: 20_000 });

        const dialog = page.getByRole("dialog");

        await dialog.waitFor({ timeout: 10_000 });
        for (const field of ["invites.label.company", "invites.label.unit", "invites.label.role", "invites.label.hours"]) {
          await dialog.getByText(wording(field), { exact: true }).first().waitFor({ timeout: 5_000 });
        }
        await dialog.getByRole("button", { name: wording("invites.action.make"), exact: true }).waitFor({ timeout: 5_000 });
      } finally {
        await context.close();
      }
    }, 120_000);

    test(`stay in their rows on a phone, with nothing floating over the screen for them, in ${scheme}`, async () => {
      const context = await contextFor(PHONE, scheme);

      try {
        const page = await context.newPage();

        // One size on every screen, the row's own small button.
        expect(new Set(await readEveryScreen(page)).size).toBe(1);

        // The new chat button stands beside the rooms' heading in the drawer the title bar's toggle opens.
        await page.locator("[data-title-bar] [data-slot='toggle']").tap();
        await roomAddBesideHeading(page);
      } finally {
        await context.close();
      }
    }, 120_000);
  }
});
