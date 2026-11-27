import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { rmSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, Page } from "playwright-core";
import KO from "../fixtures/browser/sidebar-features.test.ko.json";

// A personal install's console at a phone's width (docs/web.md, 「The console's features」): with the features file
// leaving the organisations out, the research, cache siren and monitor screens go and the administrator keeps the
// merged screen and its platform settings, the drawer a finger opens holds what stays and a tap opens it, and the old
// administrator screen's address lands on the merged screen's platform node.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up, and writes
// the features file that console reads, which the script names as BMO_CONSOLE_TEST_FEATURES; it takes the file back
// once done, so every feature stands again for the files after it.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const featuresFile = process.env.BMO_CONSOLE_TEST_FEATURES;
const ADMINISTRATOR = { name: "sidebar-sections", password: "fixture-password-3051" };
const PHONE = { width: 360, height: 740 };

// The administrator keeps the merged screen whatever the feature says; the member's hold of it is the store's fellow.
const LEFT_OUT = ["research", "siren", "monitor"].map((key) => wording(`screens.label.${key}`));
const STAYING = ["db", "documents", "organization"].map((key) => wording(`screens.label.${key}`));

let browser: Browser | null = null;
let cookie = "";

beforeAll(async () => {
  if (!origin || !featuresFile || !touchReady()) return;

  writeFileSync(featuresFile, "organizations = false\nresearch = false\nsiren = false\nmonitor = false\n");

  const answer = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ADMINISTRATOR) });

  expect(answer.ok).toBe(true);
  cookie = answer.headers.get("set-cookie")!.split(";")[0]!;
  browser = await chromium.launch();
}, BROWSER_HOOK_MS);

afterAll(async () => {
  if (featuresFile) rmSync(featuresFile, { force: true });
  await browser?.close();
}, BROWSER_HOOK_MS);

async function phonePage(): Promise<Page> {
  const context = await browser!.newContext({ viewport: PHONE, isMobile: true, hasTouch: true, serviceWorkers: "block", reducedMotion: "reduce" });
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

  return await context.newPage();
}

async function drawn(page: Page, path: string): Promise<void> {
  await page.goto(`${origin}${path}`, { waitUntil: "load" });
  await page.waitForFunction(() => window.useNuxtApp?.().isHydrating === false, null, { timeout: 30_000 });
}

describe.skipIf(!origin || !featuresFile || !touchReady())("a personal install's sidebar at a phone's width", () => {
  test("the drawer holds no screen the features leave out, and a screen that stays is reached and opens", async () => {
    const page = await phonePage();

    try {
      await drawn(page, "/");
      await page.getByRole("button", { name: KO.open_sidebar }).tap();

      const drawer = page.getByRole("dialog");
      const names = drawer.locator("[data-slot='link'] [data-slot='linkLabel']");

      await names.first().waitFor({ timeout: 20_000 });

      const shown = (await names.allTextContents()).map((name) => name.trim());

      for (const name of LEFT_OUT) expect(shown).not.toContain(name);
      for (const name of STAYING) expect(shown).toContain(name);

      // The last screen of the administrator services is reached by scrolling the drawer, nothing of that section
      // stands over it, and a tap opens it. The agent sections joined the organisation screen, so its own entry is last.
      const last = drawer.locator("[data-slot='link']", { hasText: wording("screens.label.organization") }).first();

      await last.scrollIntoViewIfNeeded();

      const box = (await last.boundingBox())!;

      expect(box.y + box.height).toBeLessThanOrEqual(PHONE.height);
      expect(
        await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.closest("[data-slot='link']")?.textContent?.trim() ?? "", [box.x + box.width / 2, box.y + box.height / 2])
      ).toContain(wording("screens.label.organization"));

      await last.tap();
      await page.waitForURL((url) => url.pathname.endsWith("/organization"), { timeout: 20_000 });
    } finally {
      await page.context().close();
    }
  }, 120_000);

  test("the administrator keeps the merged screen, and the old administrator and agent addresses land on its platform node", async () => {
    const page = await phonePage();

    try {
      await drawn(page, "/organization");

      expect(new URL(page.url()).pathname).toMatch(/\/organization$/);

      await drawn(page, "/admin?tab=secret-kinds");

      const url = new URL(page.url());

      expect(url.pathname).toMatch(/\/organization$/);
      expect(url.searchParams.get("company")).toBe("platform");
      expect(url.searchParams.get("tab")).toBe("secret-kinds");

      // The agent screen's own address is no page: its tab is chosen at the platform node, and a key naming none
      // opens the screen's own first tab.
      await drawn(page, "/agents?tab=roles");

      const agents = new URL(page.url());

      expect(agents.pathname).toMatch(/\/organization$/);
      expect(agents.searchParams.get("company")).toBe("platform");
      expect(agents.searchParams.get("tab")).toBe("roles");

      await drawn(page, "/agents");

      const bare = new URL(page.url());

      expect(bare.pathname).toMatch(/\/organization$/);
      expect(bare.searchParams.get("company")).toBe("platform");
      expect(bare.searchParams.get("tab")).toBeNull();
    } finally {
      await page.context().close();
    }
  }, 120_000);
});
