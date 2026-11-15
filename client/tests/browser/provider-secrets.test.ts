import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, Page } from "playwright-core";
import type { SecretKindList } from "../../apps/web/shared/secret-kinds";
import type { SecretSettingsView } from "../../apps/web/shared/secret-settings";

// The secrets the agency's provider tools read, on the administration screen's providers tab (docs/web.md,
// 「Administration」): a row to each setting, its choices the reader's own secrets whose file reads as the setting's
// kind and none, a choice saved as it is made, and the agency's refusal said under the row's label. The console, with
// the account service and its secret store on a scratch folder and the agency's stand-in, is the one given in
// BMO_CONSOLE_TEST_URL, which tests/support/browser-console.ts stands up. The suite stands up no console, so there it
// skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "provider-secrets", password: "fixture-password-3037" };
// The harness's store stands across runs, so each run's names are its own but the one the stand-in refuses.
const RUN = Date.now().toString(36);
const CARD = `card-${RUN}`;
const TOKEN = `token-${RUN}`;
const REFUSED = "refused-card";
const CARD_FILE = "CARD_NUMBER=4111111111111111\nCARD_EXPIRY=12/30\nCARD_CVC=123\nCARD_HOLDER_NAME=tester\n";
const PHONE = { width: 360, height: 780 };
const TEST_MS = 120_000;

let browser: Browser | null = null;
let cookie = "";

async function keep(name: string, value: string): Promise<void> {
  const kept = await fetch(`${origin}/api/secrets`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ name, value, replace: true }) });

  expect(kept.ok).toBe(true);
}

async function held(): Promise<SecretSettingsView> {
  return (await (await fetch(`${origin}/api/secret-settings`, { headers: { cookie } })).json()) as SecretSettingsView;
}

beforeAll(async () => {
  if (!origin || !touchReady()) return;

  const login = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ACCOUNT) });

  expect(login.ok).toBe(true);
  cookie = login.headers.get("set-cookie")!.split(";")[0]!;
  await keep(CARD, CARD_FILE);
  await keep(REFUSED, CARD_FILE);
  await keep(TOKEN, "a single value");
  browser = await chromium.launch();
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();
}, BROWSER_HOOK_MS);

async function opened(viewport: { width: number; height: number }): Promise<Page> {
  const context = await browser!.newContext({ viewport });
  const [name, value] = cookie.split("=") as [string, string];

  await context.addCookies([{ name, value, url: origin! }]);

  const page = await context.newPage();

  await page.goto(`${origin}/admin`, { waitUntil: "load" });
  await page.locator('[data-secret-setting="deepseekCardSecret"] button').waitFor({ timeout: 30_000 });

  return page;
}

// The row's choice made, and the save it sends answered.
async function choose(page: Page, label: string): Promise<void> {
  const saved = page.waitForResponse((response) => response.url().endsWith("/api/secret-settings") && response.request().method() === "PUT");

  await page.locator('[data-secret-setting="deepseekCardSecret"] button').click();
  await page.getByRole("option", { name: label, exact: true }).click();
  await saved;
}

describe.skipIf(!origin || !touchReady())("the provider secrets on the providers tab", () => {
  test("offer the card secrets and none, save a choice as it is made, and say a refusal under the label", async () => {
    const page = await opened({ width: 1280, height: 900 });
    const row = page.locator('[data-secret-setting="deepseekCardSecret"]');

    try {
      await expect(row.getByText(wording("agents.label.deepseek_card_secret"), { exact: true }).isVisible()).resolves.toBe(true);
      const kinds = ((await (await fetch(`${origin}/api/secret-kinds`, { headers: { cookie } })).json()) as SecretKindList).kinds;
      const card = kinds.find((kind) => kind.key === "card")!.name;

      await expect(row.getByText(wording("agents.label.secret_of_kind", { kind: card }), { exact: true }).isVisible()).resolves.toBe(true);

      await row.locator("button").click();

      const offered = await page.getByRole("option").allTextContents();

      expect(offered).toContain(CARD);
      expect(offered).toContain(REFUSED);
      expect(offered).not.toContain(TOKEN);
      expect(offered.at(-1)).toBe(wording("agents.label.secret_none"));
      await page.keyboard.press("Escape");

      await choose(page, CARD);
      expect((await held()).deepseekCardSecret).toBe(CARD);
      await expect(row.locator("button").textContent()).resolves.toContain(CARD);

      await choose(page, REFUSED);
      await row.getByText(wording("agents.error.field_refused"), { exact: true }).waitFor({ timeout: 10_000 });
      expect((await held()).deepseekCardSecret).toBe(CARD);
      await expect(row.locator("button").textContent()).resolves.toContain(CARD);

      await choose(page, wording("agents.label.secret_none"));
      expect((await held()).deepseekCardSecret).toBeNull();
      await expect(row.getByText(wording("agents.error.field_refused"), { exact: true }).count()).resolves.toBe(0);
    } finally {
      await page.context().close();
    }
  }, TEST_MS);

  test("keep the row within the screen's width on a phone", async () => {
    const page = await opened(PHONE);

    try {
      const box = await page.locator('[data-secret-setting="deepseekCardSecret"]').boundingBox();

      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(PHONE.width);
    } finally {
      await page.context().close();
    }
  }, TEST_MS);
});
