import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { harnessScreens } from "./harness-screens";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, BrowserContext, Locator, Page } from "playwright-core";
import type { SharedId } from "./measure";
import KO from "../fixtures/browser/console-ids.test.ko.json";

// No id stands twice on a console screen, and each agent branch in the sidebar is one control
// whose aria-controls names its own list (docs/web.md, 「Sidebar」). Two elements carrying one id
// look like nothing at all — the screen, the snapshot and a click all read the same — while a
// screen reader and keyboard movement quietly go to the first of them, so the page is asked to
// count them rather than anybody being asked to look.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up:
// the development server, which alone serves the measuring module, on a scratch database, with stand-ins for
// the units it reads and this file's fixture account made there (docs/checks.md, 「How the suite runs the
// tests」). The suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "console-ids", password: "fixture-password-789" };
// A desktop, and a Galaxy S25 held upright, where the sidebar is a drawer.
const WIDTHS = [{ width: 1440, height: 900, phone: false }, { width: 360, height: 780, phone: true }];

let browser: Browser | null = null;
let cookie = "";

beforeAll(async () => {
  if (!origin || !touchReady()) {
    return;
  }

  const login = await fetch(`${origin}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(ACCOUNT)
  });

  expect(login.ok).toBe(true);
  cookie = login.headers.get("set-cookie")!.split(";")[0]!;
  browser = await chromium.launch();
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();
}, BROWSER_HOOK_MS);

async function open(viewport: (typeof WIDTHS)[number]): Promise<BrowserContext> {
  const context = await browser!.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.phone,
    hasTouch: viewport.phone,
    serviceWorkers: "block",
    reducedMotion: "reduce"
  });
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

  return context;
}

async function visit(page: Page, path: string): Promise<void> {
  await page.goto(`${origin}${path}`, { waitUntil: "networkidle" });
  await page.evaluate(async (base) => {
    const loaded = await import(/* @vite-ignore */ `${base}/measure.js`);

    loaded.install();
  }, new URL(origin!).pathname.replace(/\/$/, ""));
}

async function shared(page: Page): Promise<SharedId[]> {
  return await page.evaluate(() => {
    const scope: typeof globalThis & { measure?: { sharedIds: () => SharedId[] } } = globalThis;

    return scope.measure!.sharedIds();
  });
}

// Where the sidebar leads, as the addresses under the console's base path: every screen of its
// two sections, and the first entry of each other list — a room, an agent — since the
// entries of one list are one screen drawn for different rows. Home is where it is read from.
async function listed(page: Page): Promise<string[]> {
  const base = new URL(origin!).pathname.replace(/\/$/, "");
  const sections = [wording("screens.label.section_administration"), wording("screens.label.section_application")];
  const hrefs = await page.evaluate((headings) => [...document.querySelectorAll("nav")]
    .map((nav) => ({ screens: headings.includes(nav.getAttribute("aria-label") ?? ""), links: [...nav.querySelectorAll("a[href]")].map((link) => link.getAttribute("href")!) }))
    .filter((nav) => nav.links.length > 0)
    .flatMap((nav) => (nav.screens ? nav.links : nav.links.slice(0, 1))), sections);

  return ["/", ...new Set(hrefs.filter((href) => href.startsWith(`${base}/`)).map((href) => href.slice(base.length)))];
}

// The branch naming this list has come to the state asked for, and so has the list it names.
async function settled(page: Page, controls: string, expanded: string): Promise<void> {
  await page.waitForFunction(([id, value]) => {
    const branches = document.querySelectorAll(`[aria-controls="${id}"]`);
    const list = document.getElementById(id);

    // A closed list may be taken off the page altogether, which is as closed as it gets.
    const listed = value === "true" ? list?.getAttribute("data-state") === "open" : list === null || list.getAttribute("data-state") === "closed";

    return branches.length === 1 && branches[0]!.getAttribute("aria-expanded") === value && listed;
  }, [controls, expanded] as const, { timeout: 5_000 });
}

// The sidebar the reader is actually holding: on a phone, the drawer opened from the top bar.
async function sidebar(page: Page, phone: boolean): Promise<Locator> {
  if (phone) {
    await page.getByRole("button", { name: KO.line_104 }).click();

    return page.getByRole("dialog");
  }

  return page.locator("body");
}

// The screens visited stand every one the harness's sidebar leads to, with at least one room and one agent.
function expectEveryScreen(visited: readonly string[]): void {
  expect(harnessScreens().filter((path) => !visited.includes(path))).toEqual([]);
  expect(visited.some((path) => path.startsWith("/rooms/"))).toBe(true);
  expect(visited.some((path) => path.startsWith("/agents/"))).toBe(true);
}

describe.skipIf(!origin || !touchReady())("ids on a console screen", () => {
  for (const viewport of WIDTHS) {
    test(`no id stands twice on any screen at ${viewport.width}px`, async () => {
      const context = await open(viewport);

      try {
        const page = await context.newPage();
        const found: Record<string, SharedId[]> = {};

        await visit(page, "/");

        for (const path of await listed(page)) {
          await visit(page, path);
          found[path] = await shared(page);
        }

        // Every screen the console's sidebar leads to, a room and an agent among them.
        expectEveryScreen(Object.keys(found));

        if (viewport.phone) {
          await sidebar(page, true);
          found["drawer"] = await shared(page);
        }

        expect(Object.entries(found).filter(([, ids]) => ids.length > 0)).toEqual([]);
      } finally {
        await context.close();
      }
    }, 120_000);

    test(`each agent branch opens and closes the list its aria-controls names at ${viewport.width}px`, async () => {
      const context = await open(viewport);

      try {
        const page = await context.newPage();

        await visit(page, "/");

        const within = await sidebar(page, viewport.phone);
        const branches = within.locator("nav button[aria-controls]").filter({ visible: true });
        const count = await branches.count();

        expect(count).toBeGreaterThan(0);

        for (let at = 0; at < count; at += 1) {
          const branch = branches.nth(at);
          const controls = (await branch.getAttribute("aria-controls"))!;
          const list = page.locator(`[id="${controls}"]`);

          // A branch nobody has folded stands open, so the list it names is on the page.
          expect(await branch.getAttribute("aria-expanded")).toBe("true");
          // The id it names is one element, and it is the list inside the branch's own row.
          expect(await list.count()).toBe(1);
          expect(await branch.evaluate((button, id) => button.closest("li")?.querySelector(`[id="${id}"]`) !== null, controls)).toBe(true);
          // The chevron inside the row is part of this one control, not a second one answering to
          // the same name.
          expect(await branch.locator("[aria-controls]").count()).toBe(0);

          // The row, the chevron at its end and the keyboard each turn it exactly once.
          await branch.click();
          await settled(page, controls, "false");

          await branch.locator("[data-slot=linkTrailing]").click();
          await settled(page, controls, "true");

          await branch.focus();
          await page.keyboard.press("Enter");
          await settled(page, controls, "false");
        }
      } finally {
        await context.close();
      }
    }, 120_000);

    test(`a nested agent branch folds on its own at ${viewport.width}px`, async () => {
      const context = await open(viewport);

      try {
        const page = await context.newPage();

        await visit(page, "/");

        const within = await sidebar(page, viewport.phone);
        // The doppelganger stands under the roles with its run named by the folder's last part, so the row
        // and the list under it are the reported shape: a branch with a nested branch under it.
        const label = within.locator('nav [data-slot="linkLabel"]').filter({ hasText: /^\s*doppelganger\s*$/ }).first();
        const row = label.locator("xpath=ancestor::li[1]");
        const nested = row.locator('[data-slot="linkTrailing"][aria-controls]').first();
        const controls = (await nested.getAttribute("aria-controls"))!;
        const parentId = (await nested.evaluate((element) => element.closest('[data-slot="content"]')?.id ?? null))!;
        const parent = within.locator(`nav button[aria-controls="${parentId}"]`);

        expect(parentId).not.toBe("");
        expect(await parent.count()).toBe(1);
        expect(await parent.getAttribute("aria-expanded")).toBe("true");
        expect(await nested.getAttribute("aria-expanded")).toBe("true");
        expect(await page.locator(`[id="${controls}"]`).innerText()).toContain("scratch");

        // Closing the nested row moves its own list alone: the branch above it stays as it stood.
        await nested.click();
        await settled(page, controls, "false");
        expect(await parent.getAttribute("aria-expanded")).toBe("true");
        expect(await page.locator(`[id="${parentId}"]`).getAttribute("data-state")).toBe("open");

        // Folded and opened again, the branch shows the nested row in the state it was left.
        await parent.click();
        await settled(page, parentId, "false");
        await parent.click();
        await settled(page, parentId, "true");
        await settled(page, controls, "false");

        // The nested row's fold was never written into the memory the branches keep: a reload stands all
        // three branches as the browser last left them, and none of them took the nested row's state.
        await page.reload({ waitUntil: "networkidle" });

        let held = await sidebar(page, viewport.phone);
        let branches = held.locator("nav button[aria-controls]");

        for (let at = 0; at < await branches.count(); at += 1) {
          expect(await branches.nth(at).getAttribute("aria-expanded")).toBe("true");
        }

        // And a branch folded on its own is the only one remembered folded.
        const roles = branches.filter({ hasText: wording("agents.label.group_role") }).first();
        const roleControls = (await roles.getAttribute("aria-controls"))!;

        await roles.click();
        await settled(page, roleControls, "false");
        await page.reload({ waitUntil: "networkidle" });

        held = await sidebar(page, viewport.phone);
        branches = held.locator("nav button[aria-controls]");

        for (let at = 0; at < await branches.count(); at += 1) {
          const id = (await branches.nth(at).getAttribute("aria-controls"))!;
          const folded = id === roleControls;

          expect(await branches.nth(at).getAttribute("aria-expanded")).toBe(folded ? "false" : "true");
          expect(await page.locator(`[id="${id}"]`).getAttribute("data-state")).toBe(folded ? "closed" : "open");
        }
      } finally {
        await context.close();
      }
    }, 120_000);
  }
});
