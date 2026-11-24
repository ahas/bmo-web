import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, Locator, Page } from "playwright-core";
import type { PersonalApp, PersonalApps } from "../../apps/web/shared/personal-apps";
import type { PersonalSkills, SkillForm } from "../../apps/web/shared/personal-skills";

// The personal apps section (docs/web.md, 「Settings」, the personal apps section), worked by hand at a desk's width and
// a phone's: each app's row shows its name, its kind, what it does, its version and what it may reach, line by line, with what
// the reader's organisation does not allow and the secrets their space lacks; its way back is off where
// the PC keeps no older version, and sends an app back once asked; its delete asks, a cancel leaves the app, and a delete that
// goes through takes the row away. The skills section beside it lists the reader's own and installed skills with where
// each came from, opens an own one's form with its reference files listed as they stand, and makes a new one from its
// form, a name off the alphabet said under its field and the save open only once a description is written. Every press lands on the control it says, nothing standing over it. The console's
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
      kind: "app",
      version: "1763900000000-b2c3d4",
      putAt: 1_763_900_000_000,
      entries: [{ name: "my/weekly_summary", title: "Weekly summary", description: "Sums up the week's notes." }],
      permissions: { network: [], secrets: [] },
      kept: ["1763800000000-a1b2c3"]
    },
    {
      name: "fetch_rates",
      kind: "mcp",
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

      // The rows' text is read as written, so the browser's own translation of it is off (docs/web.md, 「The original, and
      // its translation in its place」).
      await context.addCookies([
        { name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! },
        { name: "console_auto_translate", value: "false", url: origin! }
      ]);
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
        // Each row's kind, an app or an MCP server.
        await expect(weekly.locator("[data-personal-app-kind-word]").textContent()).resolves.toBe(wording("app_catalogue.label.kind_app"));
        await expect(rates.locator("[data-personal-app-kind-word]").textContent()).resolves.toBe(wording("app_catalogue.label.kind_mcp"));

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

    test(`lists the reader's skills, opens one's form and makes a new one, ${width}px wide`, async () => {
      const context = await browser!.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, locale: "ko-KR", serviceWorkers: "block", reducedMotion: "reduce" });
      const at = cookie.indexOf("=");
      const written: unknown[] = [];
      const listed: PersonalSkills = {
        skills: [
          { name: "notes", description: "Keep notes of a meeting.", title: "Notes", summary: null, titles: {}, summaries: {}, language: "en", version: "v1", origin: "own", app: null, attachedTo: ["agent-a"] },
          { name: "review-steps", description: "Steps of a review.", title: null, summary: null, titles: {}, summaries: {}, language: "en", version: "v2", origin: "installed", app: "21-review-steps", attachedTo: [] }
        ]
      };
      const notes: SkillForm = { name: "notes", version: "v1", origin: "own", description: "Keep notes of a meeting.", body: "Write the notes as a list.", references: [{ path: "references/format.md", text: "One line a point." }] };

      await context.addCookies([
        { name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! },
        { name: "console_auto_translate", value: "false", url: origin! }
      ]);
      await context.route(/\/api\/account\/personal-skills(?:\/|$|\?)/, async (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname.replace(/^.*\/api\/account\/personal-skills/, "");

        if (request.method() === "GET" && path === "") return await route.fulfill({ json: listed });
        if (request.method() === "GET" && path === "/notes") return await route.fulfill({ json: notes });

        written.push({ method: request.method(), path, body: request.postDataJSON() });
        await route.fulfill({ json: { ...notes, name: "fresh-one", references: [] } });
      });

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/siren?settings=skills`, { waitUntil: "load" });

        const own = page.locator("[data-skill='notes']");
        const installed = page.locator("[data-skill='review-steps']");

        await own.waitFor({ timeout: 30_000 });

        // Each skill by its title, else its name, with where it came from; only the reader's own is edited and shared.
        await expect(own.locator("[data-skill-title]").textContent()).resolves.toBe("Notes");
        await expect(own.locator("[data-skill-origin-word]").textContent()).resolves.toBe(wording("skills.label.own"));
        await expect(installed.locator("[data-skill-title]").textContent()).resolves.toBe("review-steps");
        await expect(installed.locator("[data-skill-origin-word]").textContent()).resolves.toBe(wording("skills.label.installed"));
        await expect(installed.locator("[data-skill-edit]").count()).resolves.toBe(0);
        await expect(own.locator("[data-skill-attached]").textContent()).resolves.toBe(wording("skills.label.attached", { agents: "agent-a" }));

        // An own skill's form: its name fixed, its description and body, and its reference files listed as they stand.
        await press(page, own.locator("[data-skill-edit]"), phone);

        const form = page.locator("[data-skill-form]");

        await form.locator("[data-skill-reference='references/format.md']").waitFor({ timeout: 10_000 });
        await expect(form.locator("[data-skill-name]").isDisabled()).resolves.toBe(true);
        await expect(form.locator("[data-skill-description]").inputValue()).resolves.toBe("Keep notes of a meeting.");
        await expect(page.locator("[data-skill-save]").isDisabled()).resolves.toBe(true);
        await page.keyboard.press("Escape");
        await form.waitFor({ state: "detached", timeout: 10_000 });

        // A new skill: a name off the alphabet is said under its field, and the save opens once a description is written.
        await press(page, page.locator("[data-skill-add]"), phone);
        await form.waitFor({ timeout: 10_000 });
        await form.locator("[data-skill-name]").fill("Fresh One");
        await form.getByText(wording("skills.error.name_invalid")).waitFor({ timeout: 10_000 });
        await form.locator("[data-skill-name]").fill("fresh-one");
        await form.getByText(wording("skills.error.name_invalid")).waitFor({ state: "detached", timeout: 10_000 });
        await expect(page.locator("[data-skill-save]").isDisabled()).resolves.toBe(true);
        await form.locator("[data-skill-description]").fill("Turn a meeting into notes.");
        await form.locator("[data-skill-body]").fill("List each point.");
        await press(page, page.locator("[data-skill-save]"), phone);
        await form.waitFor({ state: "detached", timeout: 10_000 });
        expect(written).toEqual([{ method: "PUT", path: "/fresh-one", body: { description: "Turn a meeting into notes.", body: "List each point." } }]);
      } finally {
        await context.close();
      }
    }, 120_000);
  }
});
