import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, Page } from "playwright-core";
import type { SecretKindList } from "../../apps/web/shared/secret-kinds";
import type { SecretSettingField, SecretSettingsView } from "../../apps/web/shared/secret-settings";

// The secrets the agency's provider tools read, on the administration screen's providers tab (docs/web.md,
// 「Administration」): a row to each setting, its choices the reader's own secrets whose file reads as the setting's
// kind and none, a choice saved as it is made, and the agency's refusal said under the row's label. The console, with
// the account service and its secret store on a scratch folder and the agency's stand-in, is the one given in
// BMO_CONSOLE_TEST_URL, which tests/support/browser-console.ts stands up. The suite stands up no console, so there it
// skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "provider-secrets", password: "fixture-password-3037" };
// The harness's store stands across runs, so each run's names are its own but the ones the stand-in refuses.
const RUN = Date.now().toString(36);
const TOKEN = `token-${RUN}`;
const CARD_FILE = "CARD_NUMBER=4111111111111111\nCARD_EXPIRY=12/30\nCARD_CVC=123\nCARD_HOLDER_NAME=tester\n";
const LOGIN_FILE = "USERNAME=tester\nPASSWORD=fixture-password\n";
const PHONE = { width: 360, height: 780 };
const TEST_MS = 120_000;

// Each row the tab shows: its setting, its kind and label, a secret of its kind, one of its kind the stand-in refuses,
// and the file each of them holds.
interface Row {
  field: SecretSettingField;
  kind: string;
  label: string;
  kept: string;
  refused: string;
  file: string;
}

const ROWS: Row[] = [
  { field: "deepseekCardSecret", kind: "card", label: "agents.label.deepseek_card_secret", kept: `card-${RUN}`, refused: "refused-card", file: CARD_FILE },
  { field: "deepseekLoginSecret", kind: "account-login", label: "agents.label.deepseek_login_secret", kept: `login-${RUN}`, refused: "refused-login", file: LOGIN_FILE }
];

let browser: Browser | null = null;
let cookie = "";

async function keep(name: string, value: string): Promise<void> {
  const kept = await fetch(`${origin}/api/secrets`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ name, value, replace: true }) });

  expect(kept.ok).toBe(true);
}

async function held(): Promise<SecretSettingsView> {
  return (await (await fetch(`${origin}/api/secret-settings`, { headers: { cookie } })).json()) as SecretSettingsView;
}

function rowOf(page: Page, field: SecretSettingField) {
  return page.locator(`[data-secret-setting="${field}"]`);
}

beforeAll(async () => {
  if (!origin || !touchReady()) return;

  const login = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ACCOUNT) });

  expect(login.ok).toBe(true);
  cookie = login.headers.get("set-cookie")!.split(";")[0]!;
  for (const row of ROWS) {
    await keep(row.kept, row.file);
    await keep(row.refused, row.file);
  }
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
  for (const row of ROWS) await rowOf(page, row.field).locator("button").waitFor({ timeout: 30_000 });

  return page;
}

// The row's choice made, and the save it sends answered.
async function choose(page: Page, field: SecretSettingField, label: string): Promise<void> {
  const saved = page.waitForResponse((response) => response.url().endsWith("/api/secret-settings") && response.request().method() === "PUT");

  await rowOf(page, field).locator("button").click();
  await page.getByRole("option", { name: label, exact: true }).click();
  await saved;
}

describe.skipIf(!origin || !touchReady())("the provider secrets on the providers tab", () => {
  test("offer each row the secrets of its kind and none, save a choice as it is made, and say a refusal under its label", async () => {
    const page = await opened({ width: 1280, height: 900 });
    const kinds = ((await (await fetch(`${origin}/api/secret-kinds`, { headers: { cookie } })).json()) as SecretKindList).kinds;

    try {
      for (const setting of ROWS) {
        const row = rowOf(page, setting.field);
        const others = ROWS.filter((other) => other !== setting);
        const kind = kinds.find((one) => one.key === setting.kind)!.name;

        await expect(row.getByText(wording(setting.label), { exact: true }).isVisible()).resolves.toBe(true);
        await expect(row.getByText(wording("agents.label.secret_of_kind", { kind }), { exact: true }).isVisible()).resolves.toBe(true);

        await row.locator("button").click();

        const offered = await page.getByRole("option").allTextContents();

        expect(offered).toContain(setting.kept);
        expect(offered).toContain(setting.refused);
        expect(offered).not.toContain(TOKEN);
        for (const other of others) expect(offered).not.toContain(other.kept);
        expect(offered.at(-1)).toBe(wording("agents.label.secret_none"));
        await page.keyboard.press("Escape");

        await choose(page, setting.field, setting.kept);
        expect((await held())[setting.field]).toBe(setting.kept);
        await expect(row.locator("button").textContent()).resolves.toContain(setting.kept);

        await choose(page, setting.field, setting.refused);
        await row.getByText(wording("agents.error.field_refused"), { exact: true }).waitFor({ timeout: 10_000 });
        expect((await held())[setting.field]).toBe(setting.kept);
        await expect(row.locator("button").textContent()).resolves.toContain(setting.kept);
        for (const other of others) await expect(rowOf(page, other.field).getByText(wording("agents.error.field_refused"), { exact: true }).count()).resolves.toBe(0);

        await choose(page, setting.field, wording("agents.label.secret_none"));
        expect((await held())[setting.field]).toBeNull();
        await expect(row.getByText(wording("agents.error.field_refused"), { exact: true }).count()).resolves.toBe(0);
      }
    } finally {
      await page.context().close();
    }
  }, TEST_MS);

  test("keep every row within the screen's width on a phone", async () => {
    const page = await opened(PHONE);

    try {
      for (const row of ROWS) {
        const box = await rowOf(page, row.field).boundingBox();

        expect(box).not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(PHONE.width);
      }
    } finally {
      await page.context().close();
    }
  }, TEST_MS);
});
