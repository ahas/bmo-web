import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";

import type { Browser, BrowserContext, Page } from "playwright-core";

// The screens that create from a tab row stand bmo-ui's one create button there (docs/web.md, 「The title bar」): on a
// desk's width the grey icon last in the row, named with its key in its tooltip, the key pressing it; on a phone the
// button floating at the bottom right with nothing of it in the row, and the scrolling body keeping room at its foot
// for it. Each screen is read at both widths, in light and in dark.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "create-button", password: "fixture-password-2830" };

// Each screen with a tab row that creates, and what its create is named.
const SCREENS = [
  { path: "/agents", label: "agents.title.role_add" },
  { path: "/research", label: "research.title.ask" },
  { path: "/organization", label: "organization.action.add" },
  { path: "/organization?tab=invites", label: "invites.label.make" },
  { path: "/organization?tab=providers", label: "agents.title.account_add" },
  { path: "/organization?tab=secrets", label: "secrets.action.add" }
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

// A screen opened, the console's app standing on it and its create button drawn.
async function open(page: Page, path: string): Promise<void> {
  await page.goto(`${origin}${path}`, { waitUntil: "load" });
  await page.waitForFunction(() => window.useNuxtApp?.().isHydrating === false, null, { timeout: 30_000 });
  await page.locator("[data-tab-add]").waitFor({ timeout: 20_000 });
}

// Where the create button stands against the tab row and the screen, and the room the scrolling body keeps for it.
async function placeOf(page: Page) {
  return await page.evaluate(() => {
    const button = document.querySelector<HTMLElement>("[data-tab-add]")!;
    const row = document.querySelector<HTMLElement>('[role="tablist"]')!.closest<HTMLElement>(".h-12")!;
    const box = button.getBoundingClientRect();
    const foot = button.closest<HTMLElement>("[data-screen-foot]");
    const padded = document.querySelector<HTMLElement>('[class*="pb-(--bmo-create-room)"]');
    const rightmost = Math.max(...[...row.querySelectorAll<HTMLElement>("button, input")].map((one) => one.getBoundingClientRect().right));

    return {
      inRow: row.contains(button),
      lastInRow: Math.round(box.right) === Math.round(rightmost),
      background: getComputedStyle(button).backgroundColor,
      floating: foot !== null && getComputedStyle(foot).position === "fixed",
      fromRight: Math.round(window.innerWidth - box.right),
      fromBottom: Math.round(window.innerHeight - box.bottom),
      height: Math.round(box.height),
      room: padded === null ? -1 : parseFloat(getComputedStyle(padded).paddingBottom)
    };
  });
}

describe.skipIf(!origin)("the create button", () => {
  for (const scheme of ["light", "dark"] as const) {
    test(`stands last in the tab row on a desk's width, named with its key, in ${scheme}`, async () => {
      const context = await contextFor(WIDE, scheme);

      try {
        const page = await context.newPage();

        for (const screen of SCREENS) {
          await open(page, screen.path);

          const place = await placeOf(page);

          // The row's small square button, as every button of a tab row is.
          expect({ path: screen.path, inRow: place.inRow, lastInRow: place.lastInRow, floating: place.floating, height: place.height, room: place.room }).toEqual({
            path: screen.path,
            inRow: true,
            lastInRow: true,
            floating: false,
            height: 28,
            room: 0
          });
          // A ghost button paints nothing at rest.
          expect(place.background).toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
          expect(await page.locator("[data-tab-add]").getAttribute("aria-label")).toBe(wording(screen.label));

          await page.locator("[data-tab-add]").hover();

          // The shared tooltip, the library's floating content, named by what the button creates.
          const tooltip = page.locator("[data-reka-popper-content-wrapper]").filter({ hasText: wording(screen.label) }).first();

          await tooltip.waitFor({ timeout: 5_000 });
          expect((await tooltip.locator("kbd").allInnerTexts()).join("").toLowerCase()).toBe("n");
          await page.mouse.move(0, 0);
        }

        // A kind, the secrets' tab's second make, is the grey icon centred on the kinds' heading, named by its tooltip.
        const kindAdd = page.locator("[data-secret-kind-add]");

        await kindAdd.waitFor({ timeout: 20_000 });
        expect(await kindAdd.getAttribute("aria-label")).toBe(wording("secrets.action.kind_add"));
        expect(
          await kindAdd.evaluate((button) => {
            const mark = button.getBoundingClientRect();
            const head = button.closest("section")!.querySelector("h3")!.getBoundingClientRect();

            return Math.abs(mark.top + mark.height / 2 - (head.top + head.height / 2));
          })
        ).toBeLessThanOrEqual(1);

        // Its key presses it: on the secrets' tab, n opens the secret form, once the store's names are read.
        await page.locator("[data-tab-add]:enabled").waitFor({ timeout: 20_000 });
        await page.locator("body").click({ position: { x: 640, y: 780 } });
        await page.keyboard.press("n");
        await page.getByRole("dialog").waitFor({ timeout: 10_000 });

        // A link is made in the dialog the invitations' create opens: the unit, the administrator's head switch and
        // the span, with the make at its foot.
        await open(page, "/organization?tab=invites");
        await page.locator("[data-tab-add]:enabled").click({ timeout: 20_000 });

        const dialog = page.getByRole("dialog");

        await dialog.waitFor({ timeout: 10_000 });
        for (const field of ["invites.label.unit", "invites.label.head", "invites.label.hours"]) {
          await dialog.getByText(wording(field), { exact: true }).first().waitFor({ timeout: 5_000 });
        }
        await dialog.getByRole("button", { name: wording("invites.action.make"), exact: true }).waitFor({ timeout: 5_000 });
      } finally {
        await context.close();
      }
    }, 120_000);

    test(`floats at the bottom right on a phone, the body keeping room for it, in ${scheme}`, async () => {
      const context = await contextFor(PHONE, scheme);

      try {
        const page = await context.newPage();

        for (const screen of SCREENS) {
          await open(page, screen.path);

          const place = await placeOf(page);

          // The layer's largest icon button, whatever size the row hands its own.
          expect({ path: screen.path, inRow: place.inRow, floating: place.floating, height: place.height, fromRight: place.fromRight, fromBottom: place.fromBottom }).toEqual({
            path: screen.path,
            inRow: false,
            floating: true,
            height: 40,
            fromRight: 16,
            fromBottom: 16
          });
          // The last row scrolls clear of the button: the room is the button and its gap from the edge.
          expect(place.room).toBeGreaterThanOrEqual(place.height + place.fromBottom);
        }
      } finally {
        await context.close();
      }
    }, 120_000);
  }
});
