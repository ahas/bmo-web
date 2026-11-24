import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { HARNESS_SCREEN_UNITS } from "../support/harness-screens";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, BrowserContext, Locator, Page } from "playwright-core";
import KO from "../fixtures/browser/sign-in-sidebar.test.ko.json";

// What a tab knows of its reader belongs to the login it was read for (docs/web.md, 「Access」): a login made on the
// login screen, with no new page drawn for it, finds every screen it may open in the sidebar from the first screen
// after it — the administrator's own and the screens units bring — and a tab signed out and signed in again as a
// member finds the member's screens and none of the administrator's, with no reload. A new member whose first
// sign-in the start guide holds, led there as the join page leads them, finds every screen their sections allow
// once the guide lets them go. Worked as a hand works it, at a phone's width and a desk's.
//
// The list of screens a login reads is held back until the shell the login leads to stands, as a deployment's answers
// late while it asks every unit, so the sidebar must take the list in once it comes. It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts
// stands up, whose stand-in units bring screens named by their unit's name.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ADMINISTRATOR = { name: "sign-in-admin", password: "fixture-password-5201" };
const MEMBER = { name: "sign-in-member", password: "fixture-password-5202" };
const FIRST = { 1280: { name: "first-sign-in-1280", password: "fixture-password-5203" }, 360: { name: "first-sign-in-360", password: "fixture-password-5204" } };

const ADMINISTRATION = wording("screens.label.section_administration");
const APPLICATION = wording("screens.label.section_application");
const BROUGHT = [...HARNESS_SCREEN_UNITS];
const STORE = wording("screens.label.catalogue");
const ADMINISTRATOR_SCREENS = ["db", "research", "monitor", "documents", "catalogue", "agents", "organization", "siren", "admin"].map((key) =>
  wording(`screens.label.${key}`)
);

const WIDTHS = [
  { width: 1280, height: 800, phone: false },
  { width: 360, height: 740, phone: true }
] as const;

let browser: Browser | null = null;

beforeAll(async () => {
  if (!origin || !touchReady()) return;

  browser = await chromium.launch();
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();
}, BROWSER_HOOK_MS);

// A tab with nobody signed in, and the way to hold its reads of the list of screens back and let them go.
interface Tab {
  context: BrowserContext;
  hold: () => void;
  release: () => void;
}

async function freshTab(width: number, height: number): Promise<Tab> {
  const context = await browser!.newContext({ viewport: { width, height }, locale: "ko-KR", serviceWorkers: "block", reducedMotion: "reduce" });
  let gate: Promise<void> = Promise.resolve();
  let release = () => {};

  await context.route(/\/api\/console-bundles(\?.*)?$/, async (route) => {
    await gate;
    await route.continue();
  });

  return {
    context,
    hold: () => {
      gate = new Promise((done) => (release = done));
    },
    release: () => release()
  };
}

async function standing(page: Page): Promise<void> {
  await page.waitForFunction(() => window.useNuxtApp?.().isHydrating === false, null, { timeout: 30_000 });
}

// Whether a press at the control's centre lands on the control itself, nothing standing over it.
async function reachable(control: Locator): Promise<boolean> {
  await control.scrollIntoViewIfNeeded();

  return await control.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);

    return hit !== null && (hit === element || element.contains(hit) || hit.contains(element));
  });
}

async function press(control: Locator): Promise<void> {
  await control.waitFor({ timeout: 20_000 });
  expect(await reachable(control)).toBe(true);
  await control.click();
}

// The login screen worked by hand: the name and the password typed, the login pressed, and the screen left.
async function signIn(page: Page, account: { name: string; password: string }): Promise<void> {
  await page.locator('input[autocomplete="username"]').fill(account.name);
  await page.locator('input[type="password"]').fill(account.password);
  await press(page.locator('button[type="submit"]').first());
  await page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 20_000 });
}

// A sign-in into a shell: the list of screens the login reads is held back until the shell it leads to stands, its
// sidebar at a desk's width and the button opening its drawer on a phone, and let go then.
async function signInToShell(page: Page, tab: Tab, account: { name: string; password: string }, phone: boolean): Promise<void> {
  tab.hold();
  await signIn(page, account);
  await (phone ? page.getByRole("button", { name: KO.open_sidebar }) : page.locator("[id^='console-sidebar-']").first()).waitFor({ timeout: 20_000 });
  tab.release();
}

// The sidebar as it stands on the screen open: on a phone, the drawer opened from the top bar.
async function sidebar(page: Page, phone: boolean): Promise<Locator> {
  if (!phone) return page.locator("[id^='console-sidebar-']").first();

  await press(page.getByRole("button", { name: KO.open_sidebar }));

  return page.getByRole("dialog");
}

// The screens' sections read top to bottom once the applications stand: the heading each shows and its screens'
// names.
async function sections(holder: Locator): Promise<[string, string[]][]> {
  await holder.locator(`nav[aria-label="${APPLICATION}"]`).waitFor({ timeout: 20_000 });
  await holder.locator(`nav[aria-label="${ADMINISTRATION}"] [data-slot='link'] [data-slot='linkLabel']`, { hasText: STORE }).waitFor({ timeout: 20_000 });

  return holder.evaluate((root, headings) => {
    const read: [string, string[]][] = [];

    for (const menu of root.querySelectorAll("nav[aria-label]")) {
      if (!headings.includes(menu.getAttribute("aria-label")!)) continue;

      const shown = menu.querySelector("[data-slot='label']")?.textContent?.trim() ?? "";
      const names = [...menu.querySelectorAll("[data-slot='link'] [data-slot='linkLabel']")].map((label) => label.textContent?.trim() ?? "");

      read.push([shown, names.toSorted()]);
    }

    return read;
  }, [ADMINISTRATION, APPLICATION]);
}

// The sign-out pressed from the user menu at the sidebar's foot, which leads to the login screen.
async function signOut(page: Page, holder: Locator, account: string): Promise<void> {
  await press(holder.getByRole("button", { name: account }).last());
  await press(page.getByRole("menuitem", { name: wording("app.action.logout") }));
  await page.waitForURL((url) => url.pathname.endsWith("/login"), { timeout: 20_000 });
  await page.locator('input[autocomplete="username"]').waitFor({ timeout: 20_000 });
}

const sorted = (names: readonly string[]) => [...names].toSorted();

// A new member's state as their first sign-in finds it: no key of their own and the guide not begun, so each run walks
// it from its start.
async function asNew(account: { name: string; password: string }): Promise<void> {
  const login = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(account) });

  expect(login.ok).toBe(true);

  const cookie = login.headers.get("set-cookie")!.split(";")[0]!;
  const call = async (method: string, path: string, body?: unknown) =>
    await fetch(`${origin}${path}`, {
      method,
      headers: { cookie, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  const keys = (await (await call("GET", "/api/supply/personal")).json().catch(() => [])) as { id: string }[];

  for (const key of Array.isArray(keys) ? keys : []) await call("DELETE", `/api/supply/personal/${encodeURIComponent(key.id)}`);

  expect((await call("PUT", "/api/me/guide", { restart: true })).ok).toBe(true);
  await call("POST", "/api/auth/logout");
}

// The guide's step, waited for by its title as the screen draws it.
async function atStep(page: Page, step: string, title: string): Promise<void> {
  await page.locator(`[data-guide-step="${step}"]`).waitFor({ timeout: 20_000 });
  await page.locator("[data-guide-title]").getByText(title, { exact: true }).waitFor({ timeout: 10_000 });
}

async function nextFrom(page: Page): Promise<void> {
  await page.waitForFunction(() => (document.querySelector("[data-guide-next]") as HTMLButtonElement | null)?.disabled === false, null, { timeout: 20_000 });
  await press(page.locator("[data-guide-next]"));
}

describe.skipIf(!origin || !touchReady())("the sidebar after a sign-in", () => {
  for (const viewport of WIDTHS) {
    test(`a login and the next one in the same tab find their own screens with no reload at ${viewport.width}px`, async () => {
      const tab = await freshTab(viewport.width, viewport.height);

      try {
        const page = await tab.context.newPage();
        let reloads = 0;

        await page.goto(`${origin}/login`, { waitUntil: "load" });
        await standing(page);
        page.on("load", () => (reloads += 1));

        await signInToShell(page, tab, ADMINISTRATOR, viewport.phone);

        const first = await sidebar(page, viewport.phone);

        expect(await sections(first)).toEqual([
          [ADMINISTRATION, sorted(ADMINISTRATOR_SCREENS)],
          [APPLICATION, sorted(BROUGHT)]
        ]);

        await signOut(page, first, ADMINISTRATOR.name);
        await signInToShell(page, tab, MEMBER, viewport.phone);

        // The member's shell holds the member's screens alone: the store among the administrator services, and the
        // screens units bring.
        expect(await sections(await sidebar(page, viewport.phone))).toEqual([
          [ADMINISTRATION, [STORE]],
          [APPLICATION, sorted(BROUGHT)]
        ]);
        expect(reloads).toBe(0);
      } finally {
        await tab.context.close();
      }
    }, 180_000);

    test(`a new member held by the start guide finds every screen their sections allow once it lets them go at ${viewport.width}px`, async () => {
      const account = FIRST[viewport.width];

      await asNew(account);

      const tab = await freshTab(viewport.width, viewport.height);

      try {
        const page = await tab.context.newPage();

        // The join page's way to the login: the new login named, leading into the start guide.
        await page.goto(`${origin}/login?name=${encodeURIComponent(account.name)}&to=${encodeURIComponent("/start")}`, { waitUntil: "load" });
        await standing(page);
        await signIn(page, account);

        // The guide walked by hand: no way past the supply but a key of their own, which the agency's stand-in tries
        // and finds answering, the machine put off, and the guide ended home.
        await atStep(page, "welcome", wording("guide.title.welcome"));
        await nextFrom(page);
        await atStep(page, "supply", wording("guide.title.supply"));
        expect(await page.locator("[data-guide-later]").count()).toBe(0);
        await nextFrom(page);
        await atStep(page, "provider", wording("guide.title.provider"));
        await press(page.locator("[data-guide-roads]").getByText(wording("guide.label.road_key", { provider: wording("supply.label.road_deepseek") }), { exact: true }));
        await nextFrom(page);
        await atStep(page, "connect", wording("guide.title.connect"));
        await page.locator("[data-guide-key]").fill(`key-${account.name}`);
        await press(page.locator("[data-guide-key-save]"));
        await page.locator("[data-guide-connected]").waitFor({ timeout: 15_000 });
        await nextFrom(page);
        await atStep(page, "test", wording("guide.title.test"));
        await page.locator("[data-guide-test-ok]").waitFor({ timeout: 15_000 });
        await nextFrom(page);
        await atStep(page, "machine", wording("guide.title.machine"));
        await press(page.locator("[data-guide-later]"));
        await atStep(page, "talk", wording("guide.title.talk"));
        await press(page.locator("[data-guide-done]"));
        await page.waitForURL((url) => !url.pathname.endsWith("/start"), { timeout: 20_000 });

        expect(await sections(await sidebar(page, viewport.phone))).toEqual([
          [ADMINISTRATION, [STORE]],
          [APPLICATION, sorted(BROUGHT)]
        ]);
      } finally {
        await tab.context.close();
      }
    }, 180_000);
  }
});
