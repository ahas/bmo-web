import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, Page } from "playwright-core";
import type { DeployFlushView } from "../../apps/web/shared/deploy-flush";

// The deploy queue's flush minutes on the administration screen's providers tab (docs/web.md, 「Administration」): one
// box in minutes showing what the agency holds in force, saved as it is left, emptied to return to the agency's own,
// and the agency's refusal said under the row's label while the box keeps what was written. The console, with the
// agency's stand-in, is the one given in BMO_CONSOLE_TEST_URL, which tests/support/browser-console.ts stands up; the
// stand-in's own minutes are sixty. The suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "deploy-flush", password: "fixture-password-3842" };
const POLICY = 60;
const PHONE = { width: 360, height: 780 };
const TEST_MS = 120_000;

let browser: Browser | null = null;
let cookie = "";

async function held(): Promise<DeployFlushView> {
  return (await (await fetch(`${origin}/api/deploy-flush-minutes`, { headers: { cookie } })).json()) as DeployFlushView;
}

// The harness stands across runs, so each run starts from the agency's own minutes.
async function returnToPolicy(): Promise<void> {
  const put = await fetch(`${origin}/api/deploy-flush-minutes`, { method: "PUT", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ minutes: null }) });

  expect(put.ok).toBe(true);
}

beforeAll(async () => {
  if (!origin || !touchReady()) return;

  const login = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ACCOUNT) });

  expect(login.ok).toBe(true);
  cookie = login.headers.get("set-cookie")!.split(";")[0]!;
  browser = await chromium.launch();
}, BROWSER_HOOK_MS);

afterAll(async () => {
  if (cookie !== "") await returnToPolicy();
  await browser?.close();
}, BROWSER_HOOK_MS);

async function opened(viewport: { width: number; height: number }): Promise<Page> {
  await returnToPolicy();

  const context = await browser!.newContext({ viewport });
  const [name, value] = cookie.split("=") as [string, string];

  await context.addCookies([{ name, value, url: origin! }]);

  const page = await context.newPage();

  await page.goto(`${origin}/admin`, { waitUntil: "load" });
  await boxOf(page).waitFor({ timeout: 30_000 });

  return page;
}

function boxOf(page: Page) {
  return page.locator("input[data-deploy-flush-minutes]");
}

function refusalOf(page: Page) {
  return page.locator("[data-deploy-flush] [data-deploy-flush-refusal]");
}

// The box written over and left the way given, the save it sends answered.
async function written(page: Page, words: string, leave: "Enter" | "Tab"): Promise<void> {
  const saved = page.waitForResponse((response) => response.url().endsWith("/api/deploy-flush-minutes") && response.request().method() === "PUT");

  await boxOf(page).fill(words);
  await boxOf(page).press(leave);
  await saved;
}

describe.skipIf(!origin || !touchReady())("the deploy flush minutes on the providers tab", () => {
  test("show the minutes in force, save a figure as the box is left, say a refusal and return to the agency's own when emptied", async () => {
    const page = await opened({ width: 1280, height: 900 });
    const puts: string[] = [];

    page.on("request", (request) => {
      if (request.url().endsWith("/api/deploy-flush-minutes") && request.method() === "PUT") puts.push(request.postData() ?? "");
    });

    try {
      const group = page.locator("[data-deploy-flush]");

      await expect(group.getByText(wording("agents.label.deploy_flush"), { exact: true }).isVisible()).resolves.toBe(true);
      await expect(group.getByText(wording("agents.label.deploy_flush_unit"), { exact: true }).isVisible()).resolves.toBe(true);
      await expect(boxOf(page).inputValue()).resolves.toBe(String(POLICY));

      await written(page, "1440", "Enter");
      expect((await held()).minutes).toBe(1440);
      await expect(boxOf(page).inputValue()).resolves.toBe("1,440");

      await written(page, "0", "Enter");
      await refusalOf(page).waitFor({ timeout: 10_000 });
      await expect(refusalOf(page).textContent()).resolves.toBe(wording("agents.error.deploy_flush_refused"));
      await expect(boxOf(page).inputValue()).resolves.toBe("0");
      expect((await held()).minutes).toBe(1440);

      // Leaving the box after the refusal asks the agency nothing again: the next ask is the emptied box's.
      const asked = puts.length;

      await boxOf(page).press("Tab");
      await boxOf(page).focus();
      await written(page, "", "Tab");
      expect(puts.slice(asked).map((body) => JSON.parse(body))).toEqual([{ minutes: null }]);
      expect((await held()).minutes).toBe(POLICY);
      await expect(boxOf(page).inputValue()).resolves.toBe(String(POLICY));
      await expect(refusalOf(page).count()).resolves.toBe(0);

      // Words that are no figure, and a figure the agency already holds, are written back with nothing sent: the next
      // ask is the figure written after them.
      const before = puts.length;

      await boxOf(page).fill("an hour");
      await boxOf(page).press("Tab");
      await expect(boxOf(page).inputValue()).resolves.toBe(String(POLICY));
      await boxOf(page).fill(String(POLICY));
      await boxOf(page).press("Enter");
      await written(page, "90", "Enter");
      expect(puts.slice(before).map((body) => JSON.parse(body))).toEqual([{ minutes: 90 }]);
      await expect(boxOf(page).inputValue()).resolves.toBe("90");
    } finally {
      await page.context().close();
    }
  }, TEST_MS);

  test("keep the row and its box within the screen's width on a phone", async () => {
    const page = await opened(PHONE);

    try {
      for (const target of [page.locator("[data-deploy-flush]"), boxOf(page)]) {
        await target.scrollIntoViewIfNeeded();

        const box = await target.boundingBox();

        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(PHONE.width);
      }
    } finally {
      await page.context().close();
    }
  }, TEST_MS);
});
