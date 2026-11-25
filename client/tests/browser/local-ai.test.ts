import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";

import type { Browser, BrowserContext, Locator, Page } from "playwright-core";

// A person's own local AI (docs/web.md, 「The start guide」 and 「System and organisation」, the supply tab's local AIs at
// the reader's own node), worked as a
// hand works it at a phone's width and a desk's, in Korean: a member whose own supply is all that carries their runs
// picks the local AI in the start guide's provider step, gives an address their PC does not reach and is told so, gives the
// one it does and walks on to its test; and in their own supply settings adds another, which is tried before it is
// kept, switches it off and deletes it. Every press lands on the control it names, and nothing runs off the side.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up, whose agency
// stand-in lets `local-ai-member` add a local AI and answers one at `localhost:11434` as their PC reaches it, any other
// address unreached. Their own supply is all that carries their runs, so the settings are opened with one kept already,
// or the guide would lead them away.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const MEMBER = { name: "local-ai-member", password: "fixture-password-4203" };
const WIDTHS = [360, 1280] as const;
const ANSWERING = "http://localhost:11434/v1";
const UNREACHED = "http://192.0.2.10:8080/v1";

let browser: Browser | null = null;
let cookie = "";

async function api(method: string, path: string, body?: unknown): Promise<Response> {
  return await fetch(`${origin}${path}`, {
    method,
    headers: { cookie, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

// The guide begun again and every local AI taken away, so each width walks from its start.
async function reset(): Promise<void> {
  const view = (await (await api("GET", "/api/supply/local-ai")).json()) as { items?: { name: string }[] };

  for (const one of view.items ?? []) await api("DELETE", `/api/supply/local-ai/${encodeURIComponent(one.name)}`);

  expect((await api("PUT", "/api/me/guide", { restart: true })).ok).toBe(true);
}

beforeAll(async () => {
  if (!origin || !touchReady()) return;

  const answer = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(MEMBER) });

  expect(answer.ok).toBe(true);
  cookie = answer.headers.get("set-cookie")!.split(";")[0]!;
  browser = await chromium.launch();
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();
}, BROWSER_HOOK_MS);

async function contextFor(width: number): Promise<BrowserContext> {
  const context = await browser!.newContext({ viewport: { width, height: width < 600 ? 780 : 900 }, locale: "ko-KR", serviceWorkers: "block", reducedMotion: "reduce" });
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

async function overflows(page: Page): Promise<boolean> {
  return await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
}

async function press(control: Locator): Promise<void> {
  await control.waitFor({ timeout: 15_000 });
  expect(await reachable(control)).toBe(true);
  await control.click();
}

async function atStep(page: Page, step: string, title: string): Promise<void> {
  await page.locator(`[data-guide-step="${step}"]`).waitFor({ timeout: 20_000 });
  await page.locator("[data-guide-title]").getByText(title, { exact: true }).waitFor({ timeout: 10_000 });
  expect(await overflows(page)).toBe(false);
}

async function nextFrom(page: Page): Promise<void> {
  await page.waitForFunction(() => (document.querySelector("[data-guide-next]") as HTMLButtonElement | null)?.disabled === false, null, { timeout: 20_000 });
  await press(page.locator("[data-guide-next]"));
}

describe.skipIf(!origin || !touchReady())("a person's own local AI", () => {
  for (const width of WIDTHS) {
    test(`a member brings a local AI their PC reaches in the start guide at ${width}px`, async () => {
      await reset();

      const context = await contextFor(width);
      const page = await context.newPage();

      await page.goto(`${origin}/start`, { waitUntil: "load" });
      await standing(page);
      await atStep(page, "welcome", wording("guide.title.welcome"));
      await nextFrom(page);
      await atStep(page, "supply", wording("guide.title.supply"));
      await nextFrom(page);

      // The provider step offers a local AI of their own, said as one their PC reaches.
      await atStep(page, "provider", wording("guide.title.provider"));

      const roads = page.locator("[data-guide-roads]");

      expect(await roads.innerText()).toContain(wording("guide.label.road_local_member_line"));
      await press(roads.getByText(wording("guide.label.road_local"), { exact: true }));
      await nextFrom(page);

      await atStep(page, "connect", wording("guide.title.connect"));
      expect(await page.locator("[data-guide-line]").textContent()).toBe(wording("guide.message.step_connect_local_member"));

      // An address their PC does not reach is tried first and kept not, said under the form.
      const name = `ollama-${width}`;

      await page.locator("[data-guide-local-name]").fill(name);
      await page.locator("[data-guide-local-url]").fill(UNREACHED);
      await page.locator("[data-guide-local-model]").fill("qwen3");
      await press(page.locator("[data-guide-local-save]"));
      await page.locator("[data-guide-failure]").getByText(wording("guide.message.reason_unreachable").split("\n")[0]!, { exact: false }).waitFor({ timeout: 15_000 });
      expect(await page.locator("[data-guide-connected]").count()).toBe(0);
      expect(((await (await api("GET", "/api/supply/local-ai")).json()) as { items: unknown[] }).items).toEqual([]);
      expect(await overflows(page)).toBe(false);

      // The address it reaches is kept as theirs, and its test from their PC answers.
      await page.locator("[data-guide-local-url]").fill(ANSWERING);
      await press(page.locator("[data-guide-local-save]"));
      await page.locator("[data-guide-connected]").waitFor({ timeout: 15_000 });
      await nextFrom(page);

      await atStep(page, "test", wording("guide.title.test"));
      await page.locator("[data-guide-test-ok]").getByText(wording("guide.status.connected"), { exact: true }).waitFor({ timeout: 15_000 });

      const kept = (await (await api("GET", "/api/supply/local-ai")).json()) as { items: { name: string; url: string; enabled: boolean }[] };

      expect(kept.items.map((one) => [one.name, one.url, one.enabled])).toEqual([[name, `${ANSWERING}/chat/completions`, true]]);

      await context.close();
    }, 180_000);

    test(`a member adds, switches off and deletes a local AI in their supply settings at ${width}px`, async () => {
      await reset();

      // One of their own kept already, so their own supply is on and the guide leads them nowhere.
      const base = (await api("PUT", "/api/supply/local-ai/base", { url: ANSWERING, modelName: "qwen3", keyName: null })).ok;

      expect(base).toBe(true);

      const context = await contextFor(width);
      const page = await context.newPage();

      await page.goto(`${origin}/organization?company=me&tab=supply`, { waitUntil: "load" });
      await standing(page);

      const group = page.locator("[data-supply-local-ai]");

      await group.getByText(wording("supply.title.local_ai"), { exact: true }).waitFor({ timeout: 20_000 });
      await page.locator('[data-supply-local-ai-row="base"]').waitFor({ timeout: 15_000 });
      expect(await page.locator("[data-supply-local-ai-withheld]").count()).toBe(0);

      // The add opens the form; one the PC does not reach is said in the form and nothing is kept.
      await press(page.locator("[data-supply-local-ai-add]"));

      const name = `lmstudio-${width}`;
      const save = page.locator("[data-supply-local-ai-save]");

      await page.locator("[data-supply-local-ai-name]").fill(name);
      await page.locator("[data-supply-local-ai-url]").fill(UNREACHED);
      await page.locator("[data-supply-local-ai-model]").fill("qwen3");
      expect(await overflows(page)).toBe(false);
      await press(save);
      await page.locator("[data-supply-local-ai-failure]").waitFor({ timeout: 15_000 });
      expect(await page.locator("[data-supply-local-ai-failure]").innerText()).toContain(wording("guide.message.reason_unreachable").split("\n")[0]!);

      // The one it reaches is tried and kept, and stands as a row with its address and model.
      await page.locator("[data-supply-local-ai-url]").fill(ANSWERING);
      await press(save);

      const row = page.locator(`[data-supply-local-ai-row="${name}"]`);

      await row.waitFor({ timeout: 15_000 });
      expect(await row.innerText()).toContain(`${ANSWERING}/chat/completions`);
      expect(await row.innerText()).toContain("qwen3");
      expect(await overflows(page)).toBe(false);

      // Its switch turns it off.
      const toggle = row.getByRole("switch");

      expect(await toggle.getAttribute("aria-checked")).toBe("true");
      await press(toggle);
      await page.waitForFunction((at) => document.querySelector(`[data-supply-local-ai-row="${at}"] [role="switch"]`)?.getAttribute("aria-checked") === "false", name, { timeout: 15_000 });

      // Its delete, asked first, takes it away.
      await press(row.getByRole("button", { name: wording("supply.aria.local_ai_remove", { name }) }));
      await press(page.getByRole("button", { name: wording("common.action.delete"), exact: true }).last());
      await row.waitFor({ state: "detached", timeout: 15_000 });
      expect(await page.locator('[data-supply-local-ai-row="base"]').count()).toBe(1);

      await context.close();
    }, 180_000);
  }
});
