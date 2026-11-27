import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { HARNESS_SCREEN_UNITS, harnessNamedTitle } from "../support/harness-screens";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, BrowserContext, Locator, Page } from "playwright-core";
import KO from "../fixtures/browser/sidebar-sections.test.ko.json";

// The sidebar's screens in their sections, the administrator services (the organisation screen among them) and the
// applications each under its heading, in the order of the names the reader sees, and a section with no screen the
// reader may open left out, heading and all (docs/web.md, 「Sidebar」): the
// administrator's shell, a member who reads some of the console's own sections and a member who reads none, at a
// desk's width and in a phone's drawer.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up, whose
// stand-in units bring screens named by their unit's name at addresses no section keeps for the administrator.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ADMINISTRATOR = { name: "sidebar-sections", password: "fixture-password-3051" };
const SECTION_READER = { name: "section-reader", password: "fixture-password-2881" };
const ROOM_READER = { name: "room-reader", password: "fixture-password-2402" };

const ADMINISTRATION = wording("screens.label.section_administration");
const APPLICATION = wording("screens.label.section_application");
// The stand-in units' screens, each named by its unit.
const BROUGHT = [...HARNESS_SCREEN_UNITS];
// The store every reader opens, standing among the administrator services.
const STORE = wording("screens.label.catalogue");

// The sidebar as each reader reads it, section by section: the heading it shows and its screens' names.
// The sidebar orders a section's screens by their names in the reader's language, so the platform screen stands after the cache siren.
const EXPECTED = {
  [ADMINISTRATOR.name]: [
    [ADMINISTRATION, [wording("screens.label.db"), harnessNamedTitle("administrator"), ...["research", "monitor", "documents", "catalogue", "siren", "organization"].map((key) => wording(`screens.label.${key}`))]],
    [APPLICATION, BROUGHT]
  ],
  [SECTION_READER.name]: [
    [ADMINISTRATION, ["db", "research", "monitor", "documents", "catalogue", "siren", "organization"].map((key) => wording(`screens.label.${key}`))],
    [APPLICATION, BROUGHT]
  ],
  [ROOM_READER.name]: [
    [ADMINISTRATION, [STORE, wording("screens.label.organization")]],
    [APPLICATION, BROUGHT]
  ]
} as const;

const WIDTHS = [
  { width: 1280, height: 800, phone: false },
  { width: 360, height: 740, phone: true }
] as const;

let browser: Browser | null = null;
const cookies = new Map<string, string>();

async function login(account: { name: string; password: string }): Promise<string> {
  const answer = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(account) });

  expect(answer.ok).toBe(true);

  return answer.headers.get("set-cookie")!.split(";")[0]!;
}

beforeAll(async () => {
  if (!origin || !touchReady()) return;

  for (const account of [ADMINISTRATOR, SECTION_READER, ROOM_READER]) cookies.set(account.name, await login(account));

  browser = await chromium.launch();
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();
}, BROWSER_HOOK_MS);

async function contextFor(account: string, width: number, height: number): Promise<BrowserContext> {
  const context = await browser!.newContext({ viewport: { width, height }, serviceWorkers: "block", reducedMotion: "reduce" });
  const cookie = cookies.get(account)!;
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

  return context;
}

// The sidebar the reader holds on their home screen: on a phone, the drawer opened from the top bar.
async function sidebar(page: Page, phone: boolean): Promise<Locator> {
  await page.goto(`${origin}/`, { waitUntil: "load" });
  await page.waitForFunction(() => window.useNuxtApp?.().isHydrating === false, null, { timeout: 30_000 });

  if (!phone) return page.locator("[id^='console-sidebar-']").first();

  await page.getByRole("button", { name: KO.open_sidebar }).click();

  return page.getByRole("dialog");
}

// The screens' sections read top to bottom, each a menu named by its section: the heading it shows and the names of
// the screens under it.
async function sections(holder: Locator): Promise<[string, string[]][]> {
  const administration = holder.locator(`nav[aria-label="${ADMINISTRATION}"]`);

  await holder.locator(`nav[aria-label="${APPLICATION}"]`).waitFor({ timeout: 20_000 });
  // The store's entry comes in once the reader's screens are read, after the units' own; the sections are read once it
  // stands, so the read never catches the list half drawn.
  await administration.locator("[data-slot='link'] [data-slot='linkLabel']", { hasText: STORE }).waitFor({ timeout: 20_000 });

  return holder.evaluate((root, headings) => {
    const read: [string, string[]][] = [];

    for (const menu of root.querySelectorAll("nav[aria-label]")) {
      if (!headings.includes(menu.getAttribute("aria-label")!)) continue;

      const shown = menu.querySelector("[data-slot='label']")?.textContent?.trim() ?? "";
      const names = [...menu.querySelectorAll("[data-slot='link'] [data-slot='linkLabel']")].map((label) => label.textContent?.trim() ?? "");

      read.push([shown, names]);
    }

    return read;
  }, [ADMINISTRATION, APPLICATION]);
}

describe.skipIf(!origin || !touchReady())("the sidebar's sections", () => {
  for (const viewport of WIDTHS) {
    for (const account of [ADMINISTRATOR, SECTION_READER, ROOM_READER]) {
      test(`${account.name} reads the screens in their sections by name at ${viewport.width}px`, async () => {
        const context = await contextFor(account.name, viewport.width, viewport.height);

        try {
          const page = await context.newPage();

          expect(await sections(await sidebar(page, viewport.phone))).toEqual(EXPECTED[account.name]!.map(([heading, names]) => [heading, [...names]]));
        } finally {
          await context.close();
        }
      }, 120_000);
    }
  }
});
