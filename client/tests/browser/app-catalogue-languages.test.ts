import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, BrowserContext, Locator, Page } from "playwright-core";
import type { Catalogue, CatalogueApp } from "../../apps/web/shared/app-catalogue";

// The store read in a Japanese and a Simplified Chinese reader's own language (docs/web.md, 「App catalogue」 and 「The
// original, and its translation in its place」), worked by hand at a phone's width and a desk's: an item whose text is
// English alone stands in its row read into the reader's language, asked of the console's translator in that language,
// and so do its details, the original a press away; an item carrying the reader's locale stands as it is, never asked.
// The console's own routes are served through the page, standing for the agency and the gate, the translator reading
// each text with its language before it. It drives the console tests/support/browser-console.ts stands up; the suite
// stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "app-catalogue", password: "fixture-password-4103" };

const READERS = [
  { locale: "ja-JP", language: "ja" },
  { locale: "zh-CN", language: "zh-CN" }
] as const;

const WIDTHS = [
  { width: 360, height: 740, phone: true },
  { width: 1280, height: 800, phone: false }
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
    targets: [{ team: true }],
    version: "1763900000000-b2c3d4",
    versions: [{ version: "1763900000000-b2c3d4", sharedAt: 1_763_900_000_000, sourceHash: "ab".repeat(32), permissions: { network: [], secrets: [] }, review: { state: "written", report: "Nothing in it reaches beyond its own data.", at: 1_763_900_100_000 } }],
    permissions: { network: [], secrets: [] },
    review: { state: "written", report: "Nothing in it reaches beyond its own data.", at: 1_763_900_100_000 },
    approval: { required: false, approved: false },
    installs: 3,
    withdrawn: null,
    promotion: null,
    installed: null,
    updateWaiting: false,
    permissionsGrown: false,
    may: { install: true, update: false, uninstall: false, clone: false, withdraw: false, approve: false, promote: false, recall: [], turnOn: [], translate: false, text: false },
    ...more
  };
}

function catalogue(apps: CatalogueApp[]): Catalogue {
  return { company: "3", ceiling: ["team"], apps, notices: [], seenAt: null, reach: { network: true, secrets: true, held: [] }, people: { "17": "Maker One" }, units: {} };
}

// Pressed as a hand presses it: the control in view, the point at its centre holding the control itself, then a tap on
// a phone and a click at a desk.
async function press(page: Page, control: Locator, phone: boolean): Promise<void> {
  await control.scrollIntoViewIfNeeded();

  const box = (await control.boundingBox())!;

  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);

  const covered = await control.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const top = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);

    return top === null || element === top || element.contains(top) ? null : top.outerHTML.slice(0, 300);
  });

  expect(covered).toBeNull();
  if (phone) await control.tap();
  else await control.click();
}

// A browser reading in `locale`, which the console follows for an account that chose no language, translating a text
// in another language as it opens.
async function contextAt(locale: string, width: number, height: number, phone: boolean): Promise<BrowserContext> {
  const context = await browser!.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, locale, serviceWorkers: "block", reducedMotion: "reduce" });
  const at = cookie.indexOf("=");

  await context.addCookies([
    { name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! },
    { name: "console_auto_translate", value: "true", url: origin! }
  ]);
  return context;
}

describe.skipIf(!origin || !touchReady())("the store in a reader's own language", () => {
  for (const reader of READERS) {
    for (const { width, height, phone } of WIDTHS) {
      test(`reads an English item into ${reader.language} for a ${reader.locale} reader, ${width}px wide`, async () => {
        const context = await contextAt(reader.locale, width, height, phone);
        const asked: { language: string; originals: string[] }[] = [];
        const weekly = app("17-weekly", "Weekly summary", { description: "Sums up the week's notes." });
        // An item carrying the reader's own locale, which stands as it is.
        const rates = app("21-rates", "Rates", { maker: "21", titles: { [reader.language]: "Rates in the reader's locale" }, descriptions: { [reader.language]: "Today's rates in the reader's locale." }, machine: [reader.language] });

        await context.route(/\/api\/account\/app-catalogue(?:\/|$|\?)/, async (route) => await route.fulfill({ json: catalogue([weekly, rates]) }));
        await context.route(/\/api\/translations$/, async (route) => {
          const body = route.request().postDataJSON() as { language: string; originals: string[] };

          asked.push(body);
          await route.fulfill({ json: { readings: body.originals.map((text) => ({ text: `[${body.language}] ${text}`, whole: true })) } });
        });

        try {
          const page = await context.newPage();

          await page.goto(`${origin}/app-catalogue`, { waitUntil: "load" });

          // The page speaks the reader's language.
          await expect(page.locator("html").getAttribute("lang")).resolves.toBe(reader.locale);

          const weeklyRow = page.locator("[data-catalogue-app='17-weekly']");
          const ratesRow = page.locator("[data-catalogue-app='21-rates']");
          const read = (text: string): string => `[${reader.language}] ${text}`;

          await weeklyRow.locator("[data-catalogue-app-title]").getByText(read("Weekly summary")).waitFor({ timeout: 30_000 });
          await expect(weeklyRow.locator("[data-catalogue-app-line]").textContent()).resolves.toContain(read("Sums up the week's notes."));
          await expect(ratesRow.locator("[data-catalogue-app-title]").textContent()).resolves.toBe("Rates in the reader's locale");

          // Every text was asked for in the reader's language, and the item carrying it never was.
          expect(asked.length).toBeGreaterThan(0);
          expect(asked.every((one) => one.language === reader.language)).toBe(true);
          expect(asked.flatMap((one) => one.originals)).not.toContain("Rates");

          // The details stand read the same, the original put back by a press.
          await press(page, weeklyRow, phone);

          const dialog = page.locator("[data-catalogue-dialog]");

          await dialog.locator("[data-catalogue-description]").getByText(read("Sums up the week's notes.")).waitFor({ timeout: 10_000 });
          await press(page, dialog.locator("[data-catalogue-description] [data-reading-original]"), phone);
          await dialog.locator("[data-catalogue-description]").getByText("Sums up the week's notes.", { exact: true }).waitFor({ timeout: 10_000 });
        } finally {
          await context.close();
        }
      }, 120_000);
    }
  }
});
