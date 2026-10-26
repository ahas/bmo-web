import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, BrowserContext, Page } from "playwright-core";

// The agents screen's two model sections follow the agency's model resource (docs/web.md, 「Agent management
// screen」): the registered models at `/models`, listed, created, changed and removed there, and the model
// files at `/model-catalogue`, listed, saved and removed there. It drives the console
// tests/support/browser-console.ts stands up; the suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "agent-topbar", password: "fixture-password-1558" };

let browser: Browser | null = null;
let cookie = "";

beforeAll(async () => {
  if (!origin || !touchReady()) return;

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

async function open(viewport: { width: number; height: number }, phone = false): Promise<BrowserContext> {
  const context = await browser!.newContext({ viewport, isMobile: phone, hasTouch: phone, serviceWorkers: "block", reducedMotion: "reduce" });
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

  return context;
}

// The agents screen, its general tab read to the end.
async function agents(page: Page): Promise<void> {
  await page.goto(`${origin}/agents`, { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
  await page.getByRole("heading", { name: wording("agents.title.registry") }).waitFor({ timeout: 15_000 });
}

// What one row says, once it is drawn.
async function rowText(page: Page, selector: string): Promise<string> {
  await page.locator(selector).waitFor();

  return await page.locator(selector).innerText();
}

// A row's more-menu, opened.
async function openMenu(page: Page, row: string, name: string): Promise<void> {
  await page.locator(row).getByRole("button", { name: wording("common.aria.menu_of", { name }) }).click();
  await page.getByRole("menuitem", { name: wording("common.action.edit") }).waitFor();
}

// A removal asked first in the message pill.
async function removeAsked(page: Page): Promise<void> {
  await page.getByRole("menuitem", { name: wording("common.action.delete") }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: wording("common.action.delete") }).click();
}

describe.skipIf(!origin || !touchReady())("the agents screen's model sections", () => {
  test("list, create, change and remove a registered model", async () => {
    const context = await open({ width: 1280, height: 900 });

    try {
      const page = await context.newPage();

      await agents(page);

      // The list as the agency serves it.
      expect(await rowText(page, '[data-registration="model-a"]')).toContain("model-a-7b");
      expect(await rowText(page, '[data-registration="model-b"]')).toContain("model-b-7b");

      // A create.
      // The tab row's own add button, the one that opens the menu of what the general tab adds.
      await page.locator('button[aria-haspopup="menu"]').and(page.getByRole("button", { name: wording("common.action.add") })).click();
      await page.getByRole("menuitem", { name: wording("agents.title.registry") }).click();

      const add = page.getByRole("dialog");

      await add.getByLabel(wording("common.label.name")).fill("model-c");
      await add.getByLabel(wording("common.label.model")).fill("model-c-7b");
      await add.getByRole("button", { name: wording("common.action.add") }).click();

      const created = page.locator('[data-registration="model-c"]');

      await created.waitFor();
      expect(await created.innerText()).toContain("model-c-7b");

      // A change, the name fixed once made.
      await openMenu(page, '[data-registration="model-c"]', "model-c");
      await page.getByRole("menuitem", { name: wording("common.action.edit") }).click();

      const change = page.getByRole("dialog");

      expect(await change.getByLabel(wording("common.label.name")).inputValue()).toBe("model-c");
      expect(await change.getByLabel(wording("common.label.name")).isDisabled()).toBe(true);
      await change.getByLabel(wording("common.label.model")).fill("model-c-13b");
      await change.getByRole("button", { name: wording("common.action.save") }).click();
      await page.locator('[data-registration="model-c"]').getByText("model-c-13b").waitFor();

      // A removal, asked first.
      await openMenu(page, '[data-registration="model-c"]', "model-c");
      await removeAsked(page);
      await created.waitFor({ state: "detached" });
    } finally {
      await context.close();
    }
  }, 180_000);

  test("list, create, change and remove a model file", async () => {
    const context = await open({ width: 1280, height: 900 });

    try {
      const page = await context.newPage();

      await agents(page);

      // The list as the agency serves it.
      expect(await rowText(page, '[data-entry="entry-a"]')).toContain("entry-a.gguf");

      // The tab row's own add button, the one that opens the menu of what the general tab adds.
      await page.locator('button[aria-haspopup="menu"]').and(page.getByRole("button", { name: wording("common.action.add") })).click();
      await page.getByRole("menuitem", { name: wording("agents.title.catalogue") }).click();

      const add = page.getByRole("dialog");

      await add.getByLabel(wording("common.label.name"), { exact: true }).fill("entry-c");
      await add.getByLabel(wording("agents.label.worker_label"), { exact: true }).fill("Entry C");
      await add.getByLabel(wording("agents.label.model_file"), { exact: true }).fill("entry-c.gguf");
      await add.getByLabel(wording("agents.label.model_bytes")).fill("1000000000");
      await add.getByLabel("SHA-256").first().fill("b".repeat(64));
      await add.getByLabel(wording("agents.label.engine")).fill("engine-a");
      await add.getByRole("button", { name: wording("common.action.add") }).click();

      const created = page.locator('[data-entry="entry-c"]');

      await created.waitFor();
      expect(await created.innerText()).toContain("entry-c.gguf");

      await openMenu(page, '[data-entry="entry-c"]', "Entry C");
      await page.getByRole("menuitem", { name: wording("common.action.edit") }).click();

      const change = page.getByRole("dialog");

      await change.getByLabel(wording("agents.label.worker_label")).fill("Entry C changed");
      await change.getByRole("button", { name: wording("common.action.save") }).click();
      await page.locator('[data-entry="entry-c"]').getByText("Entry C changed").waitFor();

      await openMenu(page, '[data-entry="entry-c"]', "Entry C changed");
      await removeAsked(page);
      await created.waitFor({ state: "detached" });
    } finally {
      await context.close();
    }
  }, 180_000);

  test("stands whole on a phone", async () => {
    const context = await open({ width: 390, height: 844 }, true);

    try {
      const page = await context.newPage();

      await agents(page);

      const measured = await page.evaluate(() => {
        const rows = [...document.querySelectorAll<HTMLElement>("[data-registration]")];
        const buttons = [...document.querySelectorAll<HTMLElement>("[data-registration] button")];
        const name = rows[0]?.firstElementChild?.firstElementChild?.firstElementChild as HTMLElement | undefined;

        return {
          pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          menus: buttons.map((one) => one.getBoundingClientRect()).map((one) => ({ width: one.width, height: one.height })),
          nameCut: name === undefined ? 0 : name.scrollWidth - name.clientWidth,
          status: [...document.querySelectorAll<HTMLElement>("[data-registration]")].map((one) => one.innerText)
        };
      });

      // The page never scrolls sideways, every row's menu is the shared small square to press, and a row's
      // name is not cut.
      expect(measured.pageOverflow).toBeLessThanOrEqual(1);
      expect(measured.menus.filter((one) => one.width < 28 || one.height < 28)).toEqual([]);
      expect(measured.nameCut).toBeLessThanOrEqual(1);
      expect(measured.status.join("\n")).toContain(wording("agents.label.registry_healthy"));

      // The box a create opens is centred and whole, its buttons inside the visible screen.
      await page.getByRole("button", { name: wording("common.action.add") }).first().tap();
      await page.getByRole("menuitem", { name: wording("agents.title.registry") }).tap();

      const box = await page.getByRole("dialog").boundingBox();

      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(390 + 1);
      expect(box!.y + box!.height).toBeLessThanOrEqual(844 + 1);
    } finally {
      await context.close();
    }
  }, 180_000);
});
