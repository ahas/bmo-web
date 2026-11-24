import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";

import type { Browser, BrowserContext, Locator, Page } from "playwright-core";

// The start guide (docs/web.md, 「The start guide」), worked as a hand works it at a phone's width and a desk's, in
// Korean: a member whose own supply is required is held to it from home and walks it to the end with a key of their
// own, which the agency's stand-in tries and finds answering; a member whose organisation supplies their runs puts
// their own off and may leave; and the administrator of a platform with no working source is led to it, registers a
// local AI, whose test the stand-in answers, and finishes in their BMO's room. Every press lands on the control it
// names, and nothing runs off the side.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up, whose
// agency stand-in keeps a person's keys and answers the guide's administrator a platform with no working source.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const REQUIRED = { name: "agent-login", password: "fixture-password-3902" };
const OPTIONAL = { name: "guide-member", password: "fixture-password-4202" };
const ADMINISTRATOR = { name: "guide-admin", password: "fixture-password-4201" };
const RUN = Date.now().toString(36);
const WIDTHS = [360, 1280] as const;

let browser: Browser | null = null;
const cookies = new Map<string, string>();

async function login(account: { name: string; password: string }): Promise<string> {
  const answer = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(account) });

  expect(answer.ok).toBe(true);

  return answer.headers.get("set-cookie")!.split(";")[0]!;
}

async function api(account: string, method: string, path: string, body?: unknown): Promise<Response> {
  return await fetch(`${origin}${path}`, {
    method,
    headers: { cookie: cookies.get(account)!, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

// The guide begun again and the person's own keys taken away, so each width walks it from its start.
async function reset(account: string): Promise<void> {
  const keys = (await (await api(account, "GET", "/api/supply/personal")).json().catch(() => [])) as { id: string }[];

  for (const key of Array.isArray(keys) ? keys : []) await api(account, "DELETE", `/api/supply/personal/${encodeURIComponent(key.id)}`);

  expect((await api(account, "PUT", "/api/me/guide", { restart: true })).ok).toBe(true);
}

beforeAll(async () => {
  if (!origin || !touchReady()) return;

  for (const account of [REQUIRED, OPTIONAL, ADMINISTRATOR]) cookies.set(account.name, await login(account));

  // A company stands for the administrator's company step to name; the step changes no name it is handed unchanged.
  const made = await api(ADMINISTRATOR.name, "POST", "/api/organization/units", { name: `guide-${RUN}`, parent: null });

  expect(made.ok).toBe(true);
  browser = await chromium.launch();
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();
}, BROWSER_HOOK_MS);

async function contextFor(account: string, width: number): Promise<BrowserContext> {
  const context = await browser!.newContext({ viewport: { width, height: width < 600 ? 780 : 900 }, locale: "ko-KR", serviceWorkers: "block", reducedMotion: "reduce" });
  const cookie = cookies.get(account)!;
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

// The step the guide stands at, waited for by its title as the screen draws it.
async function atStep(page: Page, step: string, title: string): Promise<void> {
  await page.locator(`[data-guide-step="${step}"]`).waitFor({ timeout: 20_000 });
  await page.locator("[data-guide-title]").getByText(title, { exact: true }).waitFor({ timeout: 10_000 });
  expect(await overflows(page)).toBe(false);
}

// A press that must land on what it names.
async function press(control: Locator): Promise<void> {
  await control.waitFor({ timeout: 15_000 });
  expect(await reachable(control)).toBe(true);
  await control.click();
}

async function nextFrom(page: Page): Promise<void> {
  const next = page.locator("[data-guide-next]");

  await page.waitForFunction(() => (document.querySelector("[data-guide-next]") as HTMLButtonElement | null)?.disabled === false, null, { timeout: 20_000 });
  await press(next);
}

// A key of the member's own for DeepSeek, chosen, typed once and tried by the agency's stand-in.
async function bringKey(page: Page): Promise<void> {
  await atStep(page, "provider", wording("guide.title.provider"));
  await press(page.locator("[data-guide-roads]").getByText(wording("guide.label.road_key", { provider: wording("supply.label.road_deepseek") }), { exact: true }));
  await nextFrom(page);

  await atStep(page, "connect", wording("guide.title.connect"));
  await page.locator("[data-guide-key]").fill(`key-${RUN}`);
  await press(page.locator("[data-guide-key-save]"));
  await page.locator("[data-guide-connected]").waitFor({ timeout: 15_000 });
  await nextFrom(page);

  await atStep(page, "test", wording("guide.title.test"));
  await page.locator("[data-guide-test-ok]").getByText(wording("guide.status.connected"), { exact: true }).waitFor({ timeout: 15_000 });
  await nextFrom(page);
}

describe.skipIf(!origin || !touchReady())("the start guide", () => {
  for (const width of WIDTHS) {
    test(`a member whose own supply is required is held to it and walks it to the end at ${width}px`, async () => {
      await reset(REQUIRED.name);

      const context = await contextFor(REQUIRED.name, width);
      const page = await context.newPage();

      // Home leads to the guide, which offers no way out while none of their own is on.
      await page.goto(`${origin}/`, { waitUntil: "load" });
      await standing(page);
      await page.waitForURL((address) => address.pathname.endsWith("/start"), { timeout: 20_000 });
      await atStep(page, "welcome", wording("guide.title.welcome"));
      expect(await page.locator("[data-guide-close]").count()).toBe(0);
      expect(await page.locator("[data-guide-progress]").textContent()).toContain("1/");
      await nextFrom(page);

      await atStep(page, "supply", wording("guide.title.supply"));
      expect(await page.locator("[data-guide-line]").textContent()).toBe(wording("guide.message.step_supply_required"));
      expect(await page.locator("[data-guide-later]").count()).toBe(0);
      await nextFrom(page);

      await bringKey(page);

      // A machine not attached may be put off; the member's own BMO stands no room here, so the guide ends home.
      await atStep(page, "machine", wording("guide.title.machine"));
      await press(page.locator("[data-guide-later]"));
      await atStep(page, "talk", wording("guide.title.talk"));
      await page.locator("[data-guide-no-room]").waitFor({ timeout: 15_000 });
      await press(page.locator("[data-guide-done]"));
      await page.waitForURL((address) => !address.pathname.endsWith("/start"), { timeout: 20_000 });

      // One of their own on, home no longer leads back.
      await page.goto(`${origin}/`, { waitUntil: "load" });
      await standing(page);
      await page.waitForTimeout(1_000);
      expect(new URL(page.url()).pathname.endsWith("/start")).toBe(false);

      await context.close();
    }, 180_000);

    test(`a member whose organisation supplies their runs may put their own off and leave at ${width}px`, async () => {
      await reset(OPTIONAL.name);

      const context = await contextFor(OPTIONAL.name, width);
      const page = await context.newPage();

      // Home stands as it is; the guide is opened by its address, as the join page's login leads there.
      await page.goto(`${origin}/`, { waitUntil: "load" });
      await standing(page);
      expect(new URL(page.url()).pathname.endsWith("/start")).toBe(false);

      await page.goto(`${origin}/start`, { waitUntil: "load" });
      await standing(page);
      await atStep(page, "welcome", wording("guide.title.welcome"));
      await nextFrom(page);

      await atStep(page, "supply", wording("guide.title.supply"));
      expect(await page.locator("[data-guide-line]").textContent()).toBe(wording("guide.message.step_supply_optional"));
      await press(page.locator("[data-guide-later]"));

      // The setup is passed over, and the kept step is where the guide opens again.
      await atStep(page, "machine", wording("guide.title.machine"));
      expect(await page.locator("[data-guide-progress]").textContent()).toBe(wording("guide.label.progress", { at: "3", of: "4", share: "75" }));
      await page.reload({ waitUntil: "load" });
      await standing(page);
      await atStep(page, "machine", wording("guide.title.machine"));

      // Back to the supply and up to it after all, then put aside by the close mark.
      await press(page.locator("[data-guide-back]"));
      await atStep(page, "supply", wording("guide.title.supply"));
      await press(page.locator("[data-guide-now]"));
      await atStep(page, "provider", wording("guide.title.provider"));
      await press(page.locator("[data-guide-close]"));
      await page.waitForURL((address) => !address.pathname.endsWith("/start"), { timeout: 20_000 });

      const kept = (await (await api(OPTIONAL.name, "GET", "/api/me/guide")).json()) as { step: string; opens: boolean };

      expect(kept.step).toBe("provider");
      expect(kept.opens).toBe(false);

      await context.close();
    }, 180_000);

    test(`the administrator of a platform with no working source registers a local AI and talks to their BMO at ${width}px`, async () => {
      await reset(ADMINISTRATOR.name);

      const context = await contextFor(ADMINISTRATOR.name, width);
      const page = await context.newPage();

      await page.goto(`${origin}/`, { waitUntil: "load" });
      await standing(page);
      await page.waitForURL((address) => address.pathname.endsWith("/start"), { timeout: 20_000 });
      await atStep(page, "provider", wording("guide.title.platform"));
      expect(await page.locator("[data-guide-close]").count()).toBe(1);

      await press(page.locator("[data-guide-roads]").getByText(wording("guide.label.road_local"), { exact: true }));
      await nextFrom(page);

      await atStep(page, "connect", wording("guide.title.connect"));
      await page.locator("[data-guide-local-name]").fill(`local-${RUN}-${width}`);
      await page.locator("[data-guide-local-url]").fill("http://engine.example.test:8000/v1");
      await page.locator("[data-guide-local-model]").fill("model-a");
      await press(page.locator("[data-guide-local-save]"));
      await page.locator("[data-guide-connected]").waitFor({ timeout: 15_000 });
      await nextFrom(page);

      await atStep(page, "test", wording("guide.title.test"));
      await page.locator("[data-guide-test-ok]").waitFor({ timeout: 15_000 });
      await nextFrom(page);

      await atStep(page, "model", wording("guide.title.model"));
      await nextFrom(page);

      await atStep(page, "company", wording("guide.title.company"));
      await nextFrom(page);

      await atStep(page, "talk", wording("guide.title.talk"));
      await press(page.locator("[data-guide-open-room]"));
      await page.waitForURL((address) => /\/rooms\/-?\d+$/.test(address.pathname), { timeout: 20_000 });

      const kept = (await (await api(ADMINISTRATOR.name, "GET", "/api/me/guide")).json()) as { finished: boolean; opens: boolean };

      expect(kept.finished).toBe(true);
      expect(kept.opens).toBe(false);

      await context.close();
    }, 180_000);
  }
});
