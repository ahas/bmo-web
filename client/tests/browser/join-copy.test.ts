import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium, firefox, webkit } from "playwright-core";

import { engineReady, pastedText } from "./clipboard";
import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";

import type { Browser, BrowserContext, BrowserType, Page } from "playwright-core";

// The join page's install lines and their copy marks (docs/web.md, 「The join page」): a press puts the line on the
// clipboard and turns the mark to a check, through the clipboard API where the browser offers it and through the
// older selection copy where it does not, and a copy that lands nowhere says so and turns nothing to a check; and it
// lands in Firefox and WebKit as they ship, with no clipboard permission granted. It
// drives the console tests/support/browser-console.ts stands up, the account service's join routes answered in
// the browser; the suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const TOKEN = "join-copy-token";
const WIDTHS = [1280, 360] as const;

// The invitation and its acceptance as the account service answers them, in the shapes its client names.
const view = {
  company: { id: 1, name: "company-a" },
  unit: { id: 2, name: "unit-a" },
  expiresAt: Date.now() + 3_600_000,
  fullName: "person-a",
  head: false,
  state: "open"
};
const accepted = {
  agent: "machine-a",
  credential: "credential-a",
  hubUrl: "https://hub.example.test",
  user: "person-a",
  install: { linux: "curl -fsSL https://hub.example.test/install.sh | sh -s -- linux-line", windows: "irm https://hub.example.test/install.ps1 | iex # windows-line" }
};

// How the page meets the clipboard: the browser's own, the clipboard API missing as on an address the browser
// holds insecure, or every road refused.
type ClipboardRoad = "api" | "missing" | "refused";

let browser: Browser | null = null;

beforeAll(async () => {
  if (!origin || !touchReady()) return;

  browser = await chromium.launch();
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();
}, BROWSER_HOOK_MS);

// A context at the width whose page stands on the accepted invitation's install lines; in the shared Chromium with
// the clipboard granted to read what landed, or in another browser as it ships.
async function acceptedPage(width: number, clipboard: ClipboardRoad, on: Browser = browser!): Promise<{ context: BrowserContext; page: Page }> {
  const context = await on.newContext({
    viewport: { width, height: 900 },
    serviceWorkers: "block",
    reducedMotion: "reduce",
    permissions: on === browser ? ["clipboard-read", "clipboard-write"] : []
  });

  // The clipboard API taken off the page while the test keeps its own handle on it to read what landed.
  if (clipboard !== "api") {
    await context.addInitScript((refused) => {
      const own = navigator.clipboard;

      Object.defineProperty(window, "__testClipboard", { value: own });
      Object.defineProperty(Navigator.prototype, "clipboard", { get: () => undefined, configurable: true });
      if (refused) document.execCommand = () => false;
    }, clipboard === "refused");
  }
  await context.route(new RegExp(`/api/join/${TOKEN}/accept$`), (route) => route.fulfill({ json: accepted }));
  await context.route(new RegExp(`/api/join/${TOKEN}/proof$`), (route) => route.fulfill({ json: { active: false } }));
  await context.route(new RegExp(`/api/join/${TOKEN}$`), (route) => route.fulfill({ json: view }));

  const page = await context.newPage();

  await page.goto(`${origin}/join/${TOKEN}`, { waitUntil: "load" });
  await page.locator('input[autocomplete="username"]').fill("person-a");
  await page.locator('input[autocomplete="new-password"]').fill("fixture-password-7741");
  await page.locator('button[type="submit"][form="join-form"]').click();
  await page.locator("[data-install-copy]").first().waitFor({ timeout: 20_000 });

  return { context, page };
}

async function clipboardText(page: Page): Promise<string> {
  return await page.evaluate(async () => {
    const own = (window as Window & { __testClipboard?: Clipboard }).__testClipboard ?? navigator.clipboard;

    return await own.readText();
  });
}

describe.skipIf(!origin || !touchReady())("the join page's install copy", () => {
  for (const width of WIDTHS) {
    test(`copies each line and marks it at ${width}px`, async () => {
      const { context, page } = await acceptedPage(width, "api");

      try {
        const marks = page.locator("[data-install-copy]");

        await marks.nth(0).click();
        await page.locator(`[data-install-copy][aria-label="${wording("invites.status.copied")}"]`).waitFor({ timeout: 5_000 });
        expect(await clipboardText(page)).toBe(accepted.install.linux);

        await marks.nth(1).click();
        await page.waitForFunction((label) => document.querySelectorAll("[data-install-copy]")[1]?.getAttribute("aria-label") === label, wording("invites.status.copied"), { timeout: 5_000 });
        expect(await clipboardText(page)).toBe(accepted.install.windows);
        expect(await marks.nth(0).getAttribute("aria-label")).toBe(wording("join.action.copy"));
      } finally {
        await context.close();
      }
    }, 60_000);

    test(`copies through the selection where the clipboard API is missing at ${width}px`, async () => {
      const { context, page } = await acceptedPage(width, "missing");

      try {
        await page.locator("[data-install-copy]").nth(0).click();
        await page.locator(`[data-install-copy][aria-label="${wording("invites.status.copied")}"]`).waitFor({ timeout: 5_000 });
        expect(await clipboardText(page)).toBe(accepted.install.linux);
      } finally {
        await context.close();
      }
    }, 60_000);
  }

  // One width to each engine, as each is mostly met: Firefox on a desktop, WebKit as Safari on a phone.
  for (const [engine, width] of [
    [firefox, 1280],
    [webkit, 360]
  ] as [BrowserType, number][]) {
    test.skipIf(!engineReady(engine))(`copies a line and marks it in ${engine.name()} as it ships at ${width}px`, async () => {
      const on = await engine.launch();

      try {
        const { page } = await acceptedPage(width, "api", on);

        await page.locator("[data-install-copy]").nth(1).click();
        await page.locator(`[data-install-copy][aria-label="${wording("invites.status.copied")}"]`).waitFor({ timeout: 5_000 });
        expect(await pastedText(page)).toBe(accepted.install.windows);
      } finally {
        await on.close();
      }
    }, 90_000);
  }

  test("says a copy that landed nowhere and marks nothing copied", async () => {
    const { context, page } = await acceptedPage(1280, "refused");

    try {
      await page.locator("[data-install-copy]").nth(0).click();
      await page.getByText(wording("common.error.copy_failed")).waitFor({ timeout: 5_000 });
      expect(await page.locator(`[data-install-copy][aria-label="${wording("invites.status.copied")}"]`).count()).toBe(0);
    } finally {
      await context.close();
    }
  }, 60_000);
});
