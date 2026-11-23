import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";

import type { Browser, BrowserContext, Locator, Page } from "playwright-core";

// Where a company's documents are kept (docs/web.md, 「Organisation」, the storage tab): the place standing for a unit,
// changed in its form to a SharePoint library with its settings, a value bmo-artifact refuses said under the form,
// and what the units below may do with it, each worked as a hand works it at a phone's width and a desk's: what a
// press lands on is the control it names, nothing runs off the side, and what a press does is read back off the screen
// after the page is read again.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up, whose
// artifact stand-in judges a storage value and puts it on the account service's chain as bmo-artifact does.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ADMINISTRATOR = { name: "org-storage", password: "fixture-password-3921" };
const RUN = Date.now().toString(36);
const WIDTHS = [360, 1280] as const;
// A library's drive id as Graph names one: long, with no space to break at.
const DRIVE = `b!${"Q7xk2mPz".repeat(8)}`;

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

// A company of the test's own, so each width starts from nothing set.
async function newCompany(width: number): Promise<number> {
  const made = await fetch(`${origin}/api/organization/units`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ name: `storage-${width}-${RUN}`, parent: null })
  });

  expect(made.ok).toBe(true);

  return ((await made.json()) as { id: number }).id;
}

async function contextAt(width: number): Promise<BrowserContext> {
  const context = await browser!.newContext({ viewport: { width, height: width < 600 ? 780 : 900 }, serviceWorkers: "block", reducedMotion: "reduce" });
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

  return context;
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

// Whether the page runs off its side: the document wider than the screen.
async function overflows(page: Page): Promise<boolean> {
  return await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
}

async function opened(page: Page, company: number): Promise<Locator> {
  await page.goto(`${origin}/organization?company=${company}&tab=storage`, { waitUntil: "load" });
  await standing(page);

  const group = page.locator("[data-storage]");

  await group.locator("[data-storage-place]").waitFor({ timeout: 20_000 });

  return group;
}

// The form's place chosen by its word.
async function choosePlace(page: Page, word: string): Promise<void> {
  const select = page.getByRole("dialog").locator("[data-storage-choice]");

  expect(await reachable(select)).toBe(true);
  await select.click();
  await page.getByRole("option", { name: word, exact: true }).click();
}

describe.skipIf(!origin || !touchReady())("where a company's documents are kept", () => {
  for (const width of WIDTHS) {
    test(`a company keeps its documents in a SharePoint library and locks it below at ${width}px`, async () => {
      const company = await newCompany(width);
      const context = await contextAt(width);
      const page = await context.newPage();
      let group = await opened(page, company);

      // Nothing set, the local place stands, followed from above.
      await group.locator("[data-storage-place]").getByText(wording("org_storage.label.follows", { place: wording("org_storage.label.place_local") }), { exact: true }).waitFor({ timeout: 15_000 });
      expect(await overflows(page)).toBe(false);

      const change = group.locator("[data-storage-change]");

      expect(await reachable(change)).toBe(true);
      await change.click();

      const dialog = page.getByRole("dialog");
      const save = dialog.locator("[data-storage-save]");

      await choosePlace(page, wording("org_storage.label.place_sharepoint"));
      expect(await save.isDisabled()).toBe(true);
      await dialog.locator('[data-storage-input="site"]').fill("site-1");
      await dialog.locator('[data-storage-input="drive"]').fill(DRIVE);

      // A folder naming no document's number is refused, said under the form, the form kept open.
      await dialog.locator('[data-storage-input="folder"]').fill("04. BMO_ARTIFACT/{login}");
      expect(await reachable(save)).toBe(true);
      await save.click();
      await dialog.locator("[data-storage-refused]").getByText(wording("org_storage.error.bad_value"), { exact: true }).waitFor({ timeout: 15_000 });

      await dialog.locator('[data-storage-input="folder"]').fill("04. BMO_ARTIFACT/{login}/{document}");
      await save.click();
      await dialog.waitFor({ state: "detached", timeout: 15_000 });

      await group.locator("[data-storage-place]").getByText(wording("org_storage.label.place_sharepoint"), { exact: true }).waitFor({ timeout: 15_000 });
      await group.locator('[data-storage-field="site"]').getByText("site-1", { exact: true }).waitFor({ timeout: 15_000 });
      await group.locator('[data-storage-field="drive"]').getByText(DRIVE, { exact: true }).waitFor();
      await group.locator('[data-storage-field="account"]').getByText(wording("org_storage.label.sharepoint_account_unset"), { exact: true }).waitFor();
      expect(await overflows(page)).toBe(false);

      // The units below locked out of it.
      const below = group.locator("[data-storage-delegation]");

      expect(await reachable(below)).toBe(true);
      await below.click();
      await page.getByRole("option", { name: wording("org_agents.label.delegation_lock"), exact: true }).click();
      await page.waitForFunction((lock) => document.querySelector("[data-storage-delegation]")?.textContent?.includes(lock) === true, wording("org_agents.label.delegation_lock"), { timeout: 15_000 });

      // Read again, both stand as they were left.
      await page.reload({ waitUntil: "load" });
      await standing(page);
      group = page.locator("[data-storage]");
      await group.locator('[data-storage-field="folder"]').getByText("04. BMO_ARTIFACT/{login}/{document}", { exact: true }).waitFor({ timeout: 20_000 });
      expect(await group.locator("[data-storage-delegation]").textContent()).toContain(wording("org_agents.label.delegation_lock"));

      // Following above again stands the local place once more.
      await group.locator("[data-storage-change]").click();
      await choosePlace(page, wording("org_agents.label.delegation_inherit"));
      await page.getByRole("dialog").locator("[data-storage-save]").click();
      await group.locator("[data-storage-place]").getByText(wording("org_storage.label.follows", { place: wording("org_storage.label.place_local") }), { exact: true }).waitFor({ timeout: 15_000 });
      expect(await group.locator("[data-storage-field]").count()).toBe(0);

      await context.close();
    }, 120_000);
  }
});
