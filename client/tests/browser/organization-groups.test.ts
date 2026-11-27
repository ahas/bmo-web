import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";

import type { Browser, Page } from "playwright-core";

// The platform screen's tabs stand in four groups (docs/web.md, 「System and organisation」): the groups stand at the
// tab row's start, on a phone on a line of their own above it, the open tab's group chosen, and the tab row holds that group's tabs alone; pressing another group
// opens its first tab. Worked as a hand works it at a phone's width and a desk's: the group pressed is the one the
// finger lands on, the row is reached whole by scrolling it, and what the press does is read back off the screen.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ADMINISTRATOR = { name: "org-groups", password: "fixture-password-3905" };
const WIDTHS = [360, 1280] as const;

let browser: Browser | null = null;
let cookie = "";

beforeAll(async () => {
  if (!origin || !touchReady()) return;

  const answer = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ADMINISTRATOR) });

  expect(answer.ok).toBe(true);
  cookie = answer.headers.get("set-cookie")!.split(";")[0]!;
  browser = await chromium.launch();
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();
}, BROWSER_HOOK_MS);

// The tab row's tab names as the screen draws them.
async function tabNames(page: Page): Promise<string[]> {
  return (await page.locator(`[aria-label="${wording("organization.aria.tabs")}"]`).getByRole("tab").allInnerTexts()).map((one) => one.trim());
}

describe.skipIf(!origin || !touchReady())("the platform screen's groups of tabs", () => {
  for (const width of WIDTHS) {
    test(`stand with the tab row, the open tab's chosen, and a press opens its group's first tab, ${width}px wide`, async () => {
      const phone = width < 600;
      const context = await browser!.newContext({ viewport: { width, height: phone ? 780 : 900 }, isMobile: phone, hasTouch: phone, serviceWorkers: "block", reducedMotion: "reduce", locale: "ko-KR" });
      const at = cookie.indexOf("=");

      await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/organization?company=platform&tab=supply`, { waitUntil: "load" });
        // A press before the page has hydrated reaches no handler, so the hand presses once it stands.
        await page.waitForFunction(() => window.useNuxtApp?.().isHydrating === false, null, { timeout: 30_000 });

        const groups = page.locator(`[aria-label="${wording("organization.aria.groups")}"]`);
        const group = (key: string) => groups.getByRole("tab", { name: wording(`organization.label.group_${key}`), exact: true });

        await groups.waitFor({ timeout: 30_000 });

        // The supply tab stands among the values, so the current-values group is chosen and the tab row holds no setting of how a service runs.
        expect(await group("status").getAttribute("aria-selected")).toBe("true");
        await page.locator(`[aria-label="${wording("organization.aria.tabs")}"]`).getByRole("tab").first().waitFor({ timeout: 15_000 });
        expect(await tabNames(page)).not.toContain(wording("settings.label.providers"));

        // The group is pressed where it stands, scrolled to where it is hidden, and nothing stands over it.
        await group("settings").scrollIntoViewIfNeeded();
        const box = (await group("settings").boundingBox())!;

        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
        await (phone ? group("settings").tap() : group("settings").click());

        await page.waitForURL((url) => url.searchParams.get("tab") === "agents", { timeout: 15_000 });
        expect(await group("settings").getAttribute("aria-selected")).toBe("true");
        await page.waitForFunction(
          (name) => [...document.querySelectorAll('[role="tablist"] [role="tab"]')].some((tab) => tab.textContent?.includes(name)),
          wording("settings.label.providers"),
          { timeout: 15_000 }
        );
        expect(await tabNames(page)).not.toContain(wording("supply.label.tab"));
      } finally {
        await context.close();
      }
    }, 90_000);
  }
});
