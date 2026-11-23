import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, BrowserContext, Locator, Page } from "playwright-core";
import type { Catalogue, CatalogueApp } from "../../apps/web/shared/app-catalogue";
import type { PersonalApps } from "../../apps/web/shared/personal-apps";

// The app catalogue (docs/web.md, 「App catalogue」) and the personal apps section's share (「Settings」), worked by hand at a
// desk's width and a phone's: the notices and the apps listed, the filter by whom an app is shared with leaving the
// apps shared that way, an app's details opened with what it asks for, its install asked first and then made, its
// turning on for a unit the reader heads sent with the unit and the lock, and its source read in code blocks; and a
// personal app shared with the team and the heads, the company left closed where the reader's organisation keeps it
// so. Every press lands on the control it says, nothing standing over it. The console's own routes are served through
// the page, standing for the agency. It drives the console tests/support/browser-console.ts stands up; the suite
// stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "app-catalogue", password: "fixture-password-4103" };

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

function app(id: string, title: string, more: Partial<CatalogueApp>): CatalogueApp {
  return {
    id,
    key: `shared-3-${id}`,
    name: id.split("-")[1]!,
    title,
    description: `${title} does its one thing.`,
    maker: "17",
    owner: "17",
    targets: [{ team: true }, { heads: true }],
    version: "1763900000000-b2c3d4",
    versions: [
      {
        version: "1763900000000-b2c3d4",
        sharedAt: 1_763_900_000_000,
        sourceHash: "ab".repeat(32),
        permissions: { network: [], secrets: [] },
        review: { state: "written", report: "Sums up the week's notes.\nNothing in it reaches beyond its own data.", at: 1_763_900_100_000 }
      }
    ],
    permissions: { network: [], secrets: [] },
    review: { state: "written", report: "Sums up the week's notes.\nNothing in it reaches beyond its own data.", at: 1_763_900_100_000 },
    approval: { required: false, approved: false },
    installs: 1_204,
    withdrawn: null,
    promotion: null,
    installed: null,
    updateWaiting: false,
    permissionsGrown: false,
    may: { install: true, update: false, uninstall: false, clone: false, withdraw: false, approve: false, promote: false, recall: ["unit:40"], turnOn: ["unit:40"] },
    ...more
  };
}

function catalogue(apps: CatalogueApp[]): Catalogue {
  return {
    company: "3",
    ceiling: ["team", "heads"],
    apps,
    notices: [{ kind: "shared", app: "17-weekly", at: 1_763_900_000_000 }],
    seenAt: null,
    people: { "17": "Maker One" },
    units: { "40": "Unit Forty" }
  };
}

// Pressed as a hand presses it, once a confirmation that closed has faded away: the control in view, the point at its
// centre holding the control itself, then a tap on a phone and a click at a desk.
async function press(page: Page, control: Locator, phone: boolean): Promise<void> {
  await page.waitForFunction(() => document.querySelector("[data-slot='overlay'][data-state='closed']") === null, undefined, { timeout: 10_000 });
  await control.scrollIntoViewIfNeeded();

  const box = (await control.boundingBox())!;
  const viewport = page.viewportSize()!;

  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);

  const covered = await control.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);

    return top === null || element === top || element.contains(top) ? null : top.outerHTML.slice(0, 300);
  });

  expect(covered).toBeNull();
  if (phone) await control.tap();
  else await control.click();
}

async function contextAt(width: number, height: number, phone: boolean): Promise<BrowserContext> {
  const context = await browser!.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, locale: "ko-KR", serviceWorkers: "block", reducedMotion: "reduce" });
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
  return context;
}

describe.skipIf(!origin || !touchReady())("the app catalogue", () => {
  for (const [width, height, phone] of [[1280, 900, false], [360, 780, true]] as const) {
    test(`lists, filters, installs, turns on for a unit and reads the source of an app, ${width}px wide`, async () => {
      const context = await contextAt(width, height, phone);
      const asked: string[] = [];
      let weekly = app("17-weekly", "Weekly summary", {});
      const rates = app("21-rates", "Rates", { maker: "21", targets: [{ company: true }], permissions: { network: ["rates.example.org"], secrets: [] } });

      await context.route(/\/api\/account\/app-catalogue(?:\/|$|\?)/, async (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname.replace(/^.*\/api\/account\/app-catalogue/, "");

        if (request.method() === "GET" && path === "") return await route.fulfill({ json: catalogue([weekly, rates]) });
        if (request.method() === "GET" && path === "/17-weekly/source") {
          return await route.fulfill({ json: { version: weekly.version, sourceHash: "ab".repeat(32), files: { "main.py": "print('{}')\n", "tool.toml": "[tool]\nname = \"weekly\"\n" } } });
        }

        asked.push(`${request.method()} ${path} ${request.postData() ?? ""}`.trim());

        if (path === "/17-weekly/install") weekly = { ...weekly, installed: { version: weekly.version, how: "self" }, installs: weekly.installs + 1, may: { ...weekly.may, install: false, uninstall: true, clone: true } };

        await route.fulfill({ json: weekly });
      });

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/app-catalogue`, { waitUntil: "load" });

        const weeklyRow = page.locator("[data-catalogue-app='17-weekly']");
        const ratesRow = page.locator("[data-catalogue-app='21-rates']");

        await weeklyRow.waitFor({ timeout: 30_000 });

        // The notice and each row: its title, who made it and what it does, and how many installed it, thousands parted.
        await expect(page.locator("[data-catalogue-notice='shared']").textContent()).resolves.toContain(wording("app_catalogue.label.notice_shared", { app: "Weekly summary" }));
        await expect(weeklyRow.locator("[data-catalogue-app-line]").textContent()).resolves.toBe("Maker One · Weekly summary does its one thing.");
        await expect(weeklyRow.locator("[data-catalogue-app-installs]").textContent()).resolves.toBe("1,204");
        await ratesRow.waitFor({ timeout: 5_000 });

        // The filter leaves the apps shared with the whole company.
        await press(page, page.locator("[data-catalogue-filter]"), phone);
        await press(page, page.getByRole("option", { name: wording("app_catalogue.label.scope_company"), exact: true }), phone);
        await weeklyRow.waitFor({ state: "detached", timeout: 10_000 });
        await ratesRow.waitFor({ timeout: 5_000 });
        await press(page, page.locator("[data-catalogue-filter]"), phone);
        await press(page, page.getByRole("option", { name: wording("app_catalogue.label.scope_all"), exact: true }), phone);
        await weeklyRow.waitFor({ timeout: 10_000 });

        // The details: what it asks for and its review.
        await press(page, weeklyRow, phone);

        const dialog = page.locator("[data-catalogue-dialog]");

        await dialog.waitFor({ timeout: 10_000 });
        await expect(dialog.locator("[data-catalogue-properties]").textContent()).resolves.toContain(wording("app_catalogue.label.own_data"));
        await expect(dialog.locator("[data-catalogue-review-text]").textContent()).resolves.toContain("Nothing in it reaches beyond its own data.");

        // The install is asked first, naming what it asks for, then made.
        await press(page, page.locator("[data-catalogue-install]"), phone);

        const installing = page.getByRole("dialog").filter({ hasText: wording("app_catalogue.title.install") });

        await installing.waitFor({ timeout: 10_000 });
        await expect(installing.textContent()).resolves.toContain(wording("app_catalogue.label.permissions_line", { permissions: wording("app_catalogue.label.own_data") }));
        await press(page, installing.getByRole("button", { name: wording("app_catalogue.action.install") }), phone);
        await weeklyRow.locator("[data-catalogue-mark='installed']").waitFor({ timeout: 10_000 });
        expect(asked).toEqual(["POST /17-weekly/install {}"]);

        // Turned on for the unit the reader heads, locked.
        await expect(dialog.locator("[data-catalogue-unit]").textContent()).resolves.toContain("Unit Forty");
        await press(page, dialog.locator("[data-catalogue-lock]"), phone);
        const turnedOn = page.waitForResponse((response) => response.url().includes("/17-weekly/units/40"), { timeout: 10_000 });

        await press(page, dialog.locator("[data-catalogue-unit-on]"), phone);
        await turnedOn;
        expect(asked.at(-1)).toBe('POST /17-weekly/units/40 {"on":true,"lock":true}');

        // The source, each file under its path in a code block.
        await press(page, dialog.locator("[data-catalogue-source-open]"), phone);
        await dialog.locator("[data-catalogue-file='main.py'] pre").waitFor({ timeout: 10_000 });
        await expect(dialog.locator("[data-catalogue-file='main.py']").textContent()).resolves.toContain("print('{}')");
      } finally {
        await context.close();
      }
    }, 120_000);

    test(`shares a personal app with the team and the heads, ${width}px wide`, async () => {
      const context = await contextAt(width, height, phone);
      const shared: unknown[] = [];

      await context.route(/\/api\/account\/personal-apps(?:\/|$|\?)/, async (route) => {
        const listed: PersonalApps = {
          items: [{ name: "weekly", version: "1763900000000-b2c3d4", putAt: 1_763_900_000_000, entries: [{ name: "my/weekly", title: "Weekly summary", description: "Sums up the week." }], permissions: { network: [], secrets: [] }, kept: [] }],
          reached: true
        };

        await route.fulfill({ json: listed });
      });
      await context.route(/\/api\/account\/app-catalogue$/, async (route) => {
        const request = route.request();

        if (request.method() === "GET") return await route.fulfill({ json: catalogue([]) });

        shared.push(request.postDataJSON());
        await route.fulfill({ json: app("17-weekly", "Weekly summary", {}) });
      });

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/siren?settings=personal-apps`, { waitUntil: "load" });

        const row = page.locator("[data-personal-app='weekly']");

        await row.waitFor({ timeout: 30_000 });
        await press(page, row.locator("[data-personal-app-share]"), phone);

        const dialog = page.locator("[data-catalogue-share]");

        const scope = (word: string) => dialog.getByRole("checkbox", { name: wording(`app_catalogue.label.scope_${word}`) });

        await scope("team").waitFor({ timeout: 10_000 });

        // The company stays closed where the reader's organisation keeps it so; the team and the heads are chosen.
        await expect(scope("company").isDisabled()).resolves.toBe(true);
        await expect(scope("team").getAttribute("aria-checked")).resolves.toBe("true");
        await expect(scope("heads").getAttribute("aria-checked")).resolves.toBe("true");
        await press(page, page.locator("[data-catalogue-share-confirm]"), phone);
        await page.locator("[data-personal-apps-shared]").waitFor({ timeout: 10_000 });
        expect(shared).toEqual([{ name: "weekly", targets: [{ team: true }, { heads: true }] }]);
      } finally {
        await context.close();
      }
    }, 120_000);
  }
});
