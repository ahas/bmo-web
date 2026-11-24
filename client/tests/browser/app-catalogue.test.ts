import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, BrowserContext, Locator, Page } from "playwright-core";
import type { Catalogue, CatalogueApp } from "../../apps/web/shared/app-catalogue";
import type { PermissionReach } from "../../apps/web/shared/app-permissions";
import type { PersonalApps } from "../../apps/web/shared/personal-apps";

// The app catalogue (docs/web.md, 「App catalogue」) and the personal apps section's share (「Settings」), worked by hand at a
// desk's width and a phone's: the notices and the apps listed, the filter by whom an app is shared with leaving the
// apps shared that way, an app's details opened with what it asks for, its install asked first and then made, its
// way to the apps tab of the unit the reader heads, and its source read in code blocks; the administrator's home
// company's catalogue with no choice of another; and a
// personal app shared with the team and the heads, the company left closed where the reader's organisation keeps it
// so; the kind filter leaving the apps, the skills or the MCP servers, each row's kind, a skill's details saying it asks
// for nothing and reaches its attached agents alone, an MCP server's how it connects, remote with the secret the reader
// lacks or run on the reader's PC; and a Korean reader reading an English item in Korean, its stored Korean text marked as
// a translation's, and putting the original back. Every press lands on the control it says, nothing standing over it. The console's own routes are served through
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
    kind: "app",
    name: id.split("-")[1]!,
    title,
    description: `${title} does its one thing.`,
    language: "en",
    titles: {},
    descriptions: {},
    machine: [],
    server: null,
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
    may: { install: true, update: false, uninstall: false, clone: false, withdraw: false, approve: false, promote: false, recall: ["unit:40"], turnOn: ["unit:40"], translate: false, text: false },
    ...more
  };
}

function catalogue(apps: CatalogueApp[], reach: PermissionReach = { network: true, secrets: true, held: [] }): Catalogue {
  return {
    company: "3",
    ceiling: ["team", "heads"],
    apps,
    notices: [{ kind: "shared", app: "17-weekly", at: 1_763_900_000_000 }],
    seenAt: null,
    reach,
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

// A Korean reader's browser; the text of an item in another language is read as written unless `translates` says this
// browser reads it in the reader's own as it opens (docs/web.md, 「The original, and its translation in its place」).
async function contextAt(width: number, height: number, phone: boolean, translates = false): Promise<BrowserContext> {
  const context = await browser!.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, locale: "ko-KR", serviceWorkers: "block", reducedMotion: "reduce" });
  const at = cookie.indexOf("=");

  await context.addCookies([
    { name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! },
    { name: "console_auto_translate", value: String(translates), url: origin! }
  ]);
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
        await expect(weeklyRow.locator("[data-catalogue-app-line]").textContent()).resolves.toBe(`${wording("app_catalogue.label.kind_app")} · Maker One · Weekly summary does its one thing.`);
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
        await expect(dialog.locator("[data-catalogue-permissions] [data-app-permission='own']").textContent()).resolves.toBe(wording("app_permissions.label.own_data"));
        await expect(dialog.locator("[data-catalogue-review-text]").textContent()).resolves.toContain("Nothing in it reaches beyond its own data.");

        // The install is asked first, naming what it asks for, then made.
        await press(page, page.locator("[data-catalogue-install]"), phone);

        const installing = page.getByRole("dialog").filter({ hasText: wording("app_catalogue.title.install") });

        await installing.waitFor({ timeout: 10_000 });
        await expect(installing.textContent()).resolves.toContain(wording("app_permissions.label.own_data"));
        await press(page, installing.getByRole("button", { name: wording("app_catalogue.action.install") }), phone);
        await weeklyRow.locator("[data-catalogue-mark='installed']").waitFor({ timeout: 10_000 });
        expect(asked).toEqual(["POST /17-weekly/install {}"]);

        // A head is led to the unit's apps tab, where the app is turned on and recalled like every app.
        await expect(dialog.locator("[data-catalogue-units]").textContent()).resolves.toContain("Unit Forty");
        await expect(dialog.locator("[data-catalogue-unit-door]").getAttribute("href")).resolves.toContain("/organization?company=3&unit=40&tab=apps");

        // The source, each file under its path in a code block.
        await press(page, dialog.locator("[data-catalogue-source-open]"), phone);
        await dialog.locator("[data-catalogue-file='main.py'] pre").waitFor({ timeout: 10_000 });
        await expect(dialog.locator("[data-catalogue-file='main.py']").textContent()).resolves.toContain("print('{}')");
      } finally {
        await context.close();
      }
    }, 120_000);

    test(`says plainly what an app asks for, what the reader lacks and what the organisation does not allow, ${width}px wide`, async () => {
      const context = await contextAt(width, height, phone);
      const asked: string[] = [];
      const rates = app("21-rates", "Rates", {
        maker: "21",
        targets: [{ company: true }],
        permissions: { network: ["rates.example.org", "*.example.net:8443"], secrets: ["rates-key", "team-key"] }
      });

      await context.route(/\/api\/account\/app-catalogue(?:\/|$|\?)/, async (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname.replace(/^.*\/api\/account\/app-catalogue/, "");

        if (request.method() === "GET" && path === "") return await route.fulfill({ json: catalogue([rates], { network: true, secrets: false, held: ["team-key"] }) });

        asked.push(`${request.method()} ${path}`);
        await route.fulfill({ json: rates });
      });

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/app-catalogue`, { waitUntil: "load" });

        const ratesRow = page.locator("[data-catalogue-app='21-rates']");

        await ratesRow.waitFor({ timeout: 30_000 });
        await press(page, ratesRow, phone);

        const listed = page.locator("[data-catalogue-dialog] [data-catalogue-permissions]");
        const line = (key: string) => listed.locator(`[data-app-permission='${key}']`);
        const values = async (key: string) => await line(key).locator("[data-app-permission-value]").allTextContents();

        await listed.waitFor({ timeout: 10_000 });
        // The addresses, each in its own face, and that nothing else is reached.
        await expect(line("network").textContent()).resolves.toContain(wording("app_permissions.label.network"));
        await expect(values("network")).resolves.toEqual(["rates.example.org", "*.example.net:8443"]);
        await expect(line("network-note").textContent()).resolves.toBe(wording("app_permissions.label.network_note"));
        await expect(line("network-withheld").count()).resolves.toBe(0);
        // The secrets, read only as it runs; the one the reader's space lacks, and the organisation's word against them.
        await expect(values("secrets")).resolves.toEqual(["rates-key", "team-key"]);
        await expect(line("secrets-note").textContent()).resolves.toBe(wording("app_permissions.label.secrets_note"));
        await expect(values("secrets-missing")).resolves.toEqual(["rates-key"]);
        await expect(line("secrets-withheld").textContent()).resolves.toBe(wording("app_permissions.label.secrets_withheld"));

        // Every line within the screen's width, and the warnings drawn in the warning colour.
        const widest = await listed.locator("[data-app-permission]").evaluateAll((items) => Math.max(...items.map((item) => item.getBoundingClientRect().right)));

        expect(widest).toBeLessThanOrEqual(width);
        await expect(line("secrets-missing").getAttribute("class")).resolves.toContain("text-warning");

        // The install asks first, naming the same, and a cancel installs nothing.
        await press(page, page.locator("[data-catalogue-install]"), phone);

        const installing = page.getByRole("dialog").filter({ hasText: wording("app_catalogue.title.install") });

        await installing.waitFor({ timeout: 10_000 });

        const question = (await installing.textContent()) ?? "";

        expect(question).toContain(`${wording("app_permissions.label.network")} rates.example.org, *.example.net:8443`);
        expect(question).toContain(`${wording("app_permissions.label.secrets_missing")} rates-key`);
        expect(question).toContain(wording("app_permissions.label.secrets_withheld"));
        await press(page, installing.getByRole("button", { name: wording("common.action.cancel") }), phone);
        await installing.waitFor({ state: "detached", timeout: 10_000 });
        expect(asked).toEqual([]);
      } finally {
        await context.close();
      }
    }, 120_000);

    test(`shares a personal app with the team and the heads, ${width}px wide`, async () => {
      const context = await contextAt(width, height, phone);
      const shared: unknown[] = [];

      await context.route(/\/api\/account\/personal-apps(?:\/|$|\?)/, async (route) => {
        const listed: PersonalApps = {
          items: [{ name: "weekly", kind: "app", version: "1763900000000-b2c3d4", putAt: 1_763_900_000_000, entries: [{ name: "my/weekly", title: "Weekly summary", description: "Sums up the week." }], permissions: { network: [], secrets: [] }, kept: [] }],
          reached: true,
          reach: { network: false, secrets: false, held: [] }
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
        expect(shared).toEqual([{ name: "weekly", targets: [{ team: true }, { heads: true }], kind: "app", language: "ko" }]);
      } finally {
        await context.close();
      }
    }, 120_000);

    test(`shows the administrator their home company's catalogue with no choice of another, ${width}px wide`, async () => {
      const context = await contextAt(width, height, phone);
      const asked: string[] = [];

      await context.route(/\/api\/account\/app-catalogue(?:\/|$|\?)/, async (route) => {
        const url = new URL(route.request().url());

        asked.push(`${route.request().method()} ${url.pathname.replace(/^.*\/api\/account\/app-catalogue/, "")} company=${url.searchParams.get("company") ?? ""}`);
        await route.fulfill({ json: { ...catalogue([app("17-weekly", "Weekly summary", {})]), company: "1", notices: [] } });
      });

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/app-catalogue`, { waitUntil: "load" });
        await page.locator("[data-catalogue-app='17-weekly']").waitFor({ timeout: 30_000 });
        expect(asked[0]).toBe("GET  company=");
        expect(await page.locator("[data-catalogue-company]").count()).toBe(0);
      } finally {
        await context.close();
      }
    }, 120_000);

    test(`filters by kind and shows a skill's and an MCP server's details, ${width}px wide`, async () => {
      const context = await contextAt(width, height, phone);
      const asked: string[] = [];
      const weekly = app("17-weekly", "Weekly summary", {});
      const notes = app("17-notes", "Notes", { kind: "skill", name: "notes" });
      const tickets = app("17-tickets", "Tickets", {
        kind: "mcp",
        name: "tickets",
        permissions: { network: ["tickets.example.org"], secrets: ["tickets-token"] },
        server: { transport: "remote", url: "https://tickets.example.org/mcp", auth: "bearer", header: null, secret: "tickets-token" }
      });
      const lint = app("21-lint", "Lint", { kind: "mcp", name: "lint", maker: "21", server: { transport: "local", command: ["node", "server.js"] } });

      await context.route(/\/api\/account\/app-catalogue(?:\/|$|\?)/, async (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname.replace(/^.*\/api\/account\/app-catalogue/, "");

        if (request.method() === "GET" && path === "") return await route.fulfill({ json: catalogue([weekly, notes, tickets, lint], { network: true, secrets: true, held: [] }) });

        asked.push(`${request.method()} ${path}`);
        await route.fulfill({ json: notes });
      });

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/app-catalogue`, { waitUntil: "load" });

        const row = (id: string) => page.locator(`[data-catalogue-app='${id}']`);

        await row("17-notes").waitFor({ timeout: 30_000 });

        // Each row says its kind, by its icon and its word.
        await expect(row("17-weekly").locator("[data-catalogue-app-kind='app']").textContent()).resolves.toContain(wording("app_catalogue.label.kind_app"));
        await expect(row("17-notes").locator("[data-catalogue-app-kind='skill']").textContent()).resolves.toContain(wording("app_catalogue.label.kind_skill"));
        await expect(row("17-tickets").locator("[data-catalogue-app-icon='mcp']").count()).resolves.toBe(1);

        // The kind filter leaves the skills, then the MCP servers, then everything again.
        const kindTo = async (word: string) => {
          await press(page, page.locator("[data-catalogue-kind]"), phone);
          await press(page, page.getByRole("option", { name: wording(word), exact: true }), phone);
        };

        await kindTo("app_catalogue.label.kind_skill");
        await row("17-weekly").waitFor({ state: "detached", timeout: 10_000 });
        await expect(page.locator("[data-catalogue-app]").count()).resolves.toBe(1);
        await kindTo("app_catalogue.label.kind_mcp");
        await row("17-tickets").waitFor({ timeout: 10_000 });
        await expect(page.locator("[data-catalogue-app]").count()).resolves.toBe(2);
        await kindTo("app_catalogue.label.kind_all");
        await row("17-weekly").waitFor({ timeout: 10_000 });

        // A skill asks for nothing and reaches its attached agents alone; its install says so first, and a cancel
        // installs nothing.
        await press(page, row("17-notes"), phone);

        const skill = page.locator("[data-catalogue-dialog='skill']");

        await skill.waitFor({ timeout: 10_000 });
        await expect(skill.locator("[data-app-permission='none']").textContent()).resolves.toBe(wording("app_catalogue.label.skill_permissions"));
        await expect(skill.locator("[data-app-permission='none-note']").textContent()).resolves.toBe(wording("app_catalogue.label.skill_permissions_note"));
        await expect(skill.locator("[data-catalogue-connection]").count()).resolves.toBe(0);
        await press(page, page.locator("[data-catalogue-install]"), phone);

        const installing = page.getByRole("dialog").filter({ hasText: wording("app_catalogue.title.install_skill") });

        await installing.waitFor({ timeout: 10_000 });
        await expect(installing.textContent()).resolves.toContain(wording("app_catalogue.message.install_skill_effect").split("\n")[0]!);
        await press(page, installing.getByRole("button", { name: wording("common.action.cancel") }), phone);
        await installing.waitFor({ state: "detached", timeout: 10_000 });
        await page.keyboard.press("Escape");
        await skill.waitFor({ state: "detached", timeout: 10_000 });

        // A remote MCP server: its address in the monospace face, its auth, and the secret the reader's space lacks in
        // the warning colour; what it asks for, as an app's.
        await press(page, row("17-tickets"), phone);

        const remote = page.locator("[data-catalogue-dialog='mcp'] [data-catalogue-connection]");

        await remote.getByText("https://tickets.example.org/mcp").waitFor({ timeout: 10_000 });
        await expect(remote.textContent()).resolves.toContain(wording("app_catalogue.label.transport_remote"));
        await expect(remote.textContent()).resolves.toContain(wording("app_catalogue.label.auth_bearer"));
        await expect(remote.getByText("https://tickets.example.org/mcp").getAttribute("class")).resolves.toContain("font-mono");
        await expect(remote.locator("[data-catalogue-connection-missing]").textContent()).resolves.toContain("tickets-token");
        await expect(remote.locator("[data-catalogue-connection-missing]").getAttribute("class")).resolves.toContain("text-warning");
        await expect(page.locator("[data-catalogue-dialog='mcp'] [data-app-permission='network'] [data-app-permission-value]").allTextContents()).resolves.toEqual(["tickets.example.org"]);

        const widest = await page.locator("[data-catalogue-dialog='mcp']").evaluate((element) => element.getBoundingClientRect().right);

        expect(widest).toBeLessThanOrEqual(width);
        await page.keyboard.press("Escape");
        await remote.waitFor({ state: "detached", timeout: 10_000 });

        // One run on the reader's PC: its command.
        await press(page, row("21-lint"), phone);

        const local = page.locator("[data-catalogue-dialog='mcp'] [data-catalogue-connection]");

        await local.getByText("node server.js").waitFor({ timeout: 10_000 });
        await expect(local.textContent()).resolves.toContain(wording("app_catalogue.label.transport_local"));
        await expect(local.locator("[data-catalogue-connection-missing]").count()).resolves.toBe(0);
        expect(asked).toEqual([]);
      } finally {
        await context.close();
      }
    }, 120_000);

    test(`reads an item in the reader's language and puts the original back, ${width}px wide`, async () => {
      const context = await contextAt(width, height, phone, true);
      const translated: string[] = [];
      const weekly = app("17-weekly", "Weekly summary", { description: "Sums up the week's notes." });
      // An item carrying the reader's language, written by a translation, which is read as it stands.
      const rates = app("21-rates", "Rates", { maker: "21", titles: { ko: "Rates in the reader's language" }, descriptions: { ko: "Today's rates, in the reader's language." }, machine: ["ko"] });

      await context.route(/\/api\/account\/app-catalogue(?:\/|$|\?)/, async (route) => await route.fulfill({ json: catalogue([weekly, rates]) }));
      // The translator reads each text with a mark before it, so its reading is told apart from the original.
      await context.route(/\/api\/translations$/, async (route) => {
        const asked = route.request().postDataJSON() as { originals: string[] };

        translated.push(...asked.originals);
        await route.fulfill({ json: { readings: asked.originals.map((text) => ({ text: `[read] ${text}`, whole: true })) } });
      });

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/app-catalogue`, { waitUntil: "load" });

        const weeklyRow = page.locator("[data-catalogue-app='17-weekly']");
        const ratesRow = page.locator("[data-catalogue-app='21-rates']");

        // The English item's row stands read in the reader's language; the item carrying it stands as it is, marked as a
        // translation's.
        await weeklyRow.locator("[data-catalogue-app-title]").getByText("[read] Weekly summary").waitFor({ timeout: 30_000 });
        await expect(weeklyRow.locator("[data-catalogue-app-line]").textContent()).resolves.toContain("[read] Sums up the week's notes.");
        await expect(ratesRow.locator("[data-catalogue-app-title]").textContent()).resolves.toBe("Rates in the reader's language");
        await expect(ratesRow.locator("[data-catalogue-mark='machine']").count()).resolves.toBe(1);
        expect(translated).not.toContain("Rates");

        // Its details stand read the same, the title following the description; the original is put back by a press.
        await press(page, weeklyRow, phone);

        const dialog = page.locator("[data-catalogue-dialog]");

        await dialog.locator("[data-catalogue-description]").getByText("[read] Sums up the week's notes.").waitFor({ timeout: 10_000 });
        await page.getByRole("dialog").getByText("[read] Weekly summary").first().waitFor({ timeout: 10_000 });
        await press(page, dialog.locator("[data-catalogue-description] [data-reading-original]"), phone);
        await dialog.locator("[data-catalogue-description]").getByText("Sums up the week's notes.", { exact: true }).waitFor({ timeout: 10_000 });
        await page.getByRole("dialog").getByText("Weekly summary", { exact: true }).first().waitFor({ timeout: 10_000 });
        await expect(dialog.locator("[data-catalogue-description] [data-reading-translate]").count()).resolves.toBe(1);
        await page.keyboard.press("Escape");

        // The item carrying the reader's language says its text was written by a translation.
        await press(page, ratesRow, phone);
        await expect(page.locator("[data-catalogue-dialog] [data-catalogue-machine]").textContent()).resolves.toContain(wording("app_catalogue.label.machine"));
      } finally {
        await context.close();
      }
    }, 120_000);
  }
});
