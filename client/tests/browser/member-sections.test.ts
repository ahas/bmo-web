import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { harnessNamedTitle } from "../support/harness-screens";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, BrowserContext, Page } from "playwright-core";

// A member opens each of the console's own screens whose section they read, in the member's shell, and an address
// they may not open takes them to the first screen they may, never round again to itself (docs/web.md, 「Access」).
// The research screen holds back its research supervisor, the administrator's alone. The store opens to them at its own
// address, from its entry and from its other address (「App catalogue」), and a screen a unit brings into their own menu
// is named there by the word its manifest names for a member (「Screens a unit brings」). Its two members are the test
// console's own, each with the sections tests/support/browser-console.ts writes for them.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const RESEARCH_READER = { name: "research-reader", password: "fixture-password-2880" };
const SECTION_READER = { name: "section-reader", password: "fixture-password-2881" };
// The console's own screens the section reader reads, one section each.
const SCREENS = ["/siren", "/db", "/documents", "/agents", "/research", "/monitor"];
// The member's shell, by the sidebar it stands.
const MEMBER_SHELL = "#console-sidebar-member";

let browser: Browser | null = null;
const cookies = new Map<string, string>();

async function login(account: { name: string; password: string }): Promise<string> {
  const answer = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(account) });

  expect(answer.ok).toBe(true);

  return answer.headers.get("set-cookie")!.split(";")[0]!;
}

beforeAll(async () => {
  if (!origin || !touchReady()) return;

  cookies.set(RESEARCH_READER.name, await login(RESEARCH_READER));
  cookies.set(SECTION_READER.name, await login(SECTION_READER));
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

// An address opened as a page drawn on the server: the status it was answered with and the path it ended on once
// the console's app took the page over.
async function opened(page: Page, address: string): Promise<{ status: number | null; path: string }> {
  const answer = await page.goto(`${origin}${address}`, { waitUntil: "load" });

  await page.waitForFunction(() => window.useNuxtApp?.().isHydrating === false, null, { timeout: 30_000 });

  return { status: answer?.status() ?? null, path: new URL(page.url()).pathname.replace(/^\/console/, "") };
}

describe.skipIf(!origin || !touchReady())("a member's own console screens", () => {
  for (const [width, height] of [[1280, 800], [360, 740]] as const) {
    test(`the research screen opens to a member who reads research first, with no research supervisor, at ${width}px`, async () => {
      const context = await contextFor(RESEARCH_READER.name, width, height);

      try {
        const page = await context.newPage();

        expect(await opened(page, "/research")).toEqual({ status: 200, path: "/research" });
        // The sidebar stands beside the screen at a desk's width; on a phone it is a drawer not yet opened.
        if (width >= 1024) expect(await page.locator(MEMBER_SHELL).count()).toBe(1);

        expect(await opened(page, "/research?tab=settings")).toEqual({ status: 200, path: "/research" });
        await page.locator("#research-engines-title").waitFor({ timeout: 20_000 });
        expect(await page.locator("#research-supervisor-title").count()).toBe(0);

        // A screen of a section they do not read, and the administrator's home, take them to the research screen.
        expect(await opened(page, "/db")).toEqual({ status: 200, path: "/research" });
        expect(await opened(page, "/")).toEqual({ status: 200, path: "/research" });
      } finally {
        await context.close();
      }
    }, 120_000);
  }

  test("the store opens to a member at /store, its entry leading there and its other address forwarding there", async () => {
    const context = await contextFor(SECTION_READER.name, 1280, 800);

    try {
      const page = await context.newPage();

      expect(await opened(page, "/store")).toEqual({ status: 200, path: "/store" });
      expect(await page.locator(MEMBER_SHELL).count()).toBe(1);

      const entry = page.locator(`nav[aria-label="${wording("screens.label.section_administration")}"] a`, { hasText: wording("screens.label.catalogue") });

      await entry.waitFor({ timeout: 20_000 });
      expect(new URL(await entry.evaluate((link) => (link as HTMLAnchorElement).href)).pathname.replace(/^\/console/, "")).toBe("/store");

      expect((await opened(page, "/app-catalogue?from=link")).path).toBe("/store");
      expect(new URL(page.url()).searchParams.get("from")).toBe("link");
    } finally {
      await context.close();
    }
  }, 120_000);

  test("a member's own menu names a unit's screen by the word its manifest names for a member", async () => {
    const context = await contextFor(SECTION_READER.name, 1280, 800);

    try {
      const page = await context.newPage();

      await opened(page, "/store");
      await page.locator(MEMBER_SHELL).getByRole("button", { name: SECTION_READER.name }).last().click();
      await page.getByRole("menuitem", { name: harnessNamedTitle("member") }).waitFor({ timeout: 20_000 });
      expect(await page.getByRole("menuitem", { name: harnessNamedTitle("administrator") }).count()).toBe(0);
    } finally {
      await context.close();
    }
  }, 120_000);

  test("each of the console's own screens opens to a member who reads its section, in the member's shell", async () => {
    const context = await contextFor(SECTION_READER.name, 1280, 800);

    try {
      const page = await context.newPage();

      for (const screen of SCREENS) {
        expect({ screen, ...(await opened(page, screen)) }).toEqual({ screen, status: 200, path: screen });
        expect({ screen, shell: await page.locator(MEMBER_SHELL).count() }).toEqual({ screen, shell: 1 });
      }
    } finally {
      await context.close();
    }
  }, 180_000);
});
