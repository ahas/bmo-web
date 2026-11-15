import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";

import type { Browser, BrowserContext, Page, Route } from "playwright-core";

// The desktop pairing page (docs/web.md, 「The desktop pairing page」): a person not signed in is sent to the login and
// back; signed in, a member who holds no section but their account reads the code and the machine on no shell, approves
// through the question dialog and sees the app connect, or refuses at once; a closed code offers nothing to press.
// Each is read at a desk's width and a phone's, in light and in dark, with nothing wider than the window. The test
// console stands no jake hub, so the page's own calls are answered here; what the service decides of a pairing is its
// own tests'.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const MEMBER = { name: "pair-member", password: "fixture-password-3080" };
const CODE = "ABCD-2345";

let browser: Browser | null = null;
let cookie = "";

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

async function contextFor(width: number, height: number, scheme: "light" | "dark", signedIn: boolean): Promise<BrowserContext> {
  const context = await browser!.newContext({ viewport: { width, height }, colorScheme: scheme, serviceWorkers: "block", reducedMotion: "reduce" });
  const at = cookie.indexOf("=");

  await context.addCookies([
    { name: "nuxt-color-mode", value: scheme, url: origin! },
    ...(signedIn ? [{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }] : [])
  ]);

  return context;
}

// The page's own calls, answered as the console's server would: the code read in `state`, approved for `machine`,
// refused, and the machine attached once it has been asked after twice.
async function answered(page: Page, state: string, machine: string | null): Promise<{ approved: number; refused: number }> {
  const seen = { approved: 0, refused: 0 };
  let proofs = 0;
  const json = (route: Route, body: unknown) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

  await page.route(/\/api\/desktop\/pair\/[^/]+$/, (route) => json(route, { code: CODE, expiresAt: Date.now() + 600_000, state, ...(machine === null ? {} : { machine }) }));
  await page.route(/\/api\/desktop\/pair\/[^/]+\/approve$/, (route) => {
    seen.approved += 1;

    return json(route, { machine: machine ?? "u9-fresh" });
  });
  await page.route(/\/api\/desktop\/pair\/[^/]+\/refuse$/, (route) => {
    seen.refused += 1;

    return route.fulfill({ status: 204 });
  });
  await page.route(/\/api\/me\/machine\/proof$/, (route) => {
    proofs += 1;

    return json(route, { agent: machine ?? "u9-fresh", attached: proofs >= 2, left: false });
  });

  return seen;
}

async function standing(page: Page): Promise<void> {
  await page.waitForFunction(() => window.useNuxtApp?.().isHydrating === false, null, { timeout: 30_000 });
}

// How far the page's widest box stands past the window.
async function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

describe.skipIf(!origin || !touchReady())("the desktop pairing page", () => {
  test("a person not signed in is sent to the login and back to the code", async () => {
    const context = await contextFor(1280, 900, "light", false);

    try {
      const page = await context.newPage();

      await page.goto(`${origin}/desktop/pair?code=${CODE}`, { waitUntil: "load" });
      await page.waitForURL(/\/login\?/, { timeout: 20_000 });
      expect(new URL(page.url()).searchParams.get("to")).toBe(`/desktop/pair?code=${CODE}`);
    } finally {
      await context.close();
    }
  }, 60_000);

  for (const [width, height] of [[1280, 900], [360, 780]] as const) {
    for (const scheme of ["light", "dark"] as const) {
      test(`a member approves through the question and sees the app connect, at ${width}px in ${scheme}`, async () => {
        const context = await contextFor(width, height, scheme, true);

        try {
          const page = await context.newPage();
          const seen = await answered(page, "waiting", "u9");

          await page.goto(`${origin}/desktop/pair?code=${CODE}`, { waitUntil: "load" });
          await standing(page);

          // On no shell: the card alone, with the code and the machine, and no sidebar or title bar around it.
          const code = page.locator("[data-pairing-code]");

          await code.waitFor({ timeout: 20_000 });
          expect(await code.textContent()).toBe(CODE);
          await page.getByText("u9", { exact: true }).waitFor();
          expect(await page.locator("aside, nav").count()).toBe(0);
          expect(await overflow(page)).toBeLessThanOrEqual(0);

          // The code reads against its ground in either theme.
          const contrast = await code.evaluate((element) => {
            const channel = (value: number) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
            const luminance = (colour: string) => {
              const [r, g, b] = (colour.match(/[\d.]+/g) ?? []).slice(0, 3).map((part) => channel(Number(part) / 255));

              return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
            };
            let ground: Element | null = element;

            while (ground !== null && ["rgba(0, 0, 0, 0)", "transparent"].includes(getComputedStyle(ground).backgroundColor)) ground = ground.parentElement;

            const [light, dark] = [luminance(getComputedStyle(element).color), luminance(getComputedStyle(ground ?? document.body).backgroundColor)].sort((a, b) => b - a);

            return (light! + 0.05) / (dark! + 0.05);
          });

          expect(contrast).toBeGreaterThanOrEqual(4.5);

          // Approving asks first; the way out takes nothing.
          await page.getByRole("button", { name: wording("pairing.action.approve"), exact: true }).click();
          const dialog = page.getByRole("dialog");

          await dialog.getByText(wording("pairing.title.confirm"), { exact: true }).waitFor({ timeout: 10_000 });
          expect(await dialog.textContent()).toContain(CODE);
          expect(await dialog.textContent()).toContain(wording("pairing.message.effect", { machine: "u9" }));
          await dialog.getByRole("button", { name: wording("common.action.cancel"), exact: true }).click();
          await dialog.waitFor({ state: "detached", timeout: 10_000 });
          expect(seen.approved).toBe(0);

          await page.getByRole("button", { name: wording("pairing.action.approve"), exact: true }).click();
          await page.getByRole("dialog").getByRole("button", { name: wording("pairing.action.approve"), exact: true }).click();
          await page.getByText(wording("pairing.message.connected"), { exact: true }).waitFor({ timeout: 20_000 });
          expect(seen.approved).toBe(1);
          expect(await page.getByRole("button", { name: wording("pairing.action.refuse"), exact: true }).count()).toBe(0);
          expect(await overflow(page)).toBeLessThanOrEqual(0);
        } finally {
          await context.close();
        }
      }, 120_000);
    }

    test(`a member refuses at once, and a closed code offers nothing, at ${width}px`, async () => {
      const context = await contextFor(width, height, "light", true);

      try {
        const page = await context.newPage();
        const seen = await answered(page, "waiting", null);

        await page.goto(`${origin}/desktop/pair?code=${CODE}`, { waitUntil: "load" });
        await standing(page);
        await page.getByText(wording("pairing.label.machine_new"), { exact: true }).waitFor({ timeout: 20_000 });
        await page.getByRole("button", { name: wording("pairing.action.refuse"), exact: true }).click();
        await page.getByText(wording("pairing.message.refused"), { exact: true }).waitFor({ timeout: 10_000 });
        expect(seen).toEqual({ approved: 0, refused: 1 });
        expect(await page.getByRole("dialog").count()).toBe(0);

        const closed = await context.newPage();

        await answered(closed, "expired", null);
        await closed.goto(`${origin}/desktop/pair?code=${CODE}`, { waitUntil: "load" });
        await standing(closed);
        await closed.getByText(wording("pairing.message.expired"), { exact: true }).waitFor({ timeout: 20_000 });
        expect(await closed.getByRole("button", { name: wording("pairing.action.approve"), exact: true }).count()).toBe(0);
        expect(await overflow(closed)).toBeLessThanOrEqual(0);
      } finally {
        await context.close();
      }
    }, 120_000);
  }
});
