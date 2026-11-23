import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, Locator, Page } from "playwright-core";
import type { PersonalApp, PersonalApps } from "../../apps/web/shared/personal-apps";

// The personal apps section (docs/web.md, 「Settings」, the personal apps section), worked by hand at a desk's width and
// a phone's: each app's row shows its name, what it does, its version and what it may reach, line by line, with what
// the reader's organisation does not allow and the secrets their space lacks; its way back is off where
// the PC keeps no older version, and sends an app back once asked; its delete asks, a cancel leaves the app, and a delete that
// goes through takes the row away. Every press lands on the control it says, nothing standing over it. The console's
// own routes are served through the page, standing for the agency. It drives the console
// tests/support/browser-console.ts stands up; the suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "personal-apps", password: "fixture-password-4101" };

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

function apps(): PersonalApp[] {
  return [
    {
      name: "weekly_summary",
      version: "1763900000000-b2c3d4",
      putAt: 1_763_900_000_000,
      entries: [{ name: "my/weekly_summary", title: "Weekly summary", description: "Sums up the week's notes." }],
      permissions: { network: [], secrets: [] },
      kept: ["1763800000000-a1b2c3"]
    },
    {
      name: "fetch_rates",
      version: "1763700000000-0f0f0f",
      putAt: 1_763_700_000_000,
      entries: [{ name: "my/fetch_rates", title: null, description: "Reads today's rates." }],
      permissions: { network: ["rates.example.org"], secrets: ["rates-key"] },
      kept: []
    }
  ];
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

describe.skipIf(!origin || !touchReady())("the personal apps section", () => {
  for (const [width, height, phone] of [[1280, 900, false], [360, 780, true]] as const) {
    test(`shows each app and sends one back and deletes another once asked, ${width}px wide`, async () => {
      const context = await browser!.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, locale: "ko-KR", serviceWorkers: "block", reducedMotion: "reduce" });
      const at = cookie.indexOf("=");
      const asked: string[] = [];
      let standing = apps();

      await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
      await context.route(/\/api\/account\/personal-apps(?:\/|$|\?)/, async (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname.replace(/^.*\/api\/account\/personal-apps/, "");

        if (request.method() === "GET") {
          const listed: PersonalApps = { items: standing, reached: true, reach: { network: false, secrets: true, held: [] } };

          return await route.fulfill({ json: listed });
        }

        asked.push(`${request.method()} ${path}`);

        if (request.method() === "POST" && path === "/weekly_summary/back") {
          standing = standing.map((app) => (app.name === "weekly_summary" ? { ...app, version: "1763800000000-a1b2c3", kept: [] } : app));
        }

        if (request.method() === "DELETE") standing = standing.filter((app) => `/${app.name}` !== path);

        await route.fulfill({ json: null });
      });

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/siren?settings=personal-apps`, { waitUntil: "load" });

        const weekly = page.locator("[data-personal-app='weekly_summary']");
        const rates = page.locator("[data-personal-app='fetch_rates']");

        await weekly.waitFor({ timeout: 30_000 });

        // What each row says: its title or name, what it does, its version and what it may reach.
        await expect(weekly.textContent()).resolves.toContain("Weekly summary");
        await expect(weekly.textContent()).resolves.toContain("Sums up the week's notes.");
        await expect(weekly.locator("[data-personal-app-version]").textContent()).resolves.toContain("1763900000000-b2c3d4");
        await expect(weekly.locator("[data-personal-app-permissions]").textContent()).resolves.toBe(wording("app_permissions.label.own_data"));
        await expect(rates.textContent()).resolves.toContain("fetch_rates");

        // What an app asking for more may reach, line by line: the address and that it reaches nothing else, the
        // organisation's word against the network, and the secret its reader's space lacks.
        const line = (key: string) => rates.locator(`[data-app-permission='${key}']`);

        await expect(line("network").locator("[data-app-permission-value]").allTextContents()).resolves.toEqual(["rates.example.org"]);
        await expect(line("network-note").textContent()).resolves.toBe(wording("app_permissions.label.network_note"));
        await expect(line("network-withheld").textContent()).resolves.toBe(wording("app_permissions.label.network_withheld"));
        await expect(line("secrets-missing").locator("[data-app-permission-value]").allTextContents()).resolves.toEqual(["rates-key"]);
        await expect(line("secrets-withheld").count()).resolves.toBe(0);

        // No older version kept: its way back is off.
        await expect(rates.locator("[data-personal-app-back]").isDisabled()).resolves.toBe(true);
        await expect(weekly.locator("[data-personal-app-back]").isDisabled()).resolves.toBe(false);

        // Going back asks first, then sends the app back.
        await press(page, weekly.locator("[data-personal-app-back]"), phone);

        // Each confirmation is a dialog of its own over the settings dialog, told by its title.
        const goingBack = page.getByRole("dialog").filter({ hasText: wording("personal_apps.message.back_confirm") });
        const deleting = page.getByRole("dialog").filter({ hasText: wording("personal_apps.message.delete_confirm") });

        await goingBack.waitFor({ timeout: 10_000 });
        await press(page, goingBack.getByRole("button", { name: wording("personal_apps.action.back") }), phone);
        await weekly.locator("[data-personal-app-version]").getByText("1763800000000-a1b2c3").waitFor({ timeout: 10_000 });
        await expect(weekly.locator("[data-personal-app-back]").isDisabled()).resolves.toBe(true);
        expect(asked).toEqual(["POST /weekly_summary/back"]);

        // A delete asks; a cancel leaves the app, and going through takes its row away.
        await press(page, rates.locator("[data-personal-app-delete]"), phone);
        await deleting.waitFor({ timeout: 10_000 });
        await press(page, deleting.getByRole("button", { name: wording("common.action.cancel") }), phone);
        await deleting.waitFor({ state: "detached", timeout: 10_000 });
        expect(asked).toEqual(["POST /weekly_summary/back"]);
        await rates.waitFor({ timeout: 5_000 });

        await press(page, rates.locator("[data-personal-app-delete]"), phone);
        await deleting.waitFor({ timeout: 10_000 });
        await press(page, deleting.getByRole("button", { name: wording("common.action.delete") }), phone);
        await rates.waitFor({ state: "detached", timeout: 10_000 });
        expect(asked).toEqual(["POST /weekly_summary/back", "DELETE /fetch_rates"]);
        await weekly.waitFor({ timeout: 5_000 });
      } finally {
        await context.close();
      }
    }, 120_000);
  }
});
