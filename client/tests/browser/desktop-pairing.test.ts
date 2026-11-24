import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";

import type { Browser, BrowserContext, Page, Route } from "playwright-core";

// The desktop pairing page (docs/web.md, 「The desktop pairing page」): a person not signed in is sent to the login, which
// says why, and back; signed in, a member who holds no section but their account reads what approving does, the code,
// where the app shows it and the machine on no shell, approves through the question dialog, sees the app connect and is
// led to the settings' machine section, or refuses at once; a closed code offers nothing to press. The page is opened as the app
// opens it, marked `in=app`, and as a link a browser opens. The settings' machine section lists the reader's machine, or
// says there is none, and takes it away once the question naming it and the app has been answered. Each is read at a desk's width and a phone's, with nothing wider than the window. The test
// console stands no jake hub, so the page's own calls are answered here; what the service decides of a pairing is its
// own tests'.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const MEMBER = { name: "pair-member", password: "fixture-password-3080" };
const CODE = "ABCD-2345";
// The page's address as the app opens it, and as a link opened in a browser.
const AS_APP = `/desktop/pair?code=${CODE}&in=app`;
const AS_LINK = `/desktop/pair?code=${CODE}`;

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

      await page.goto(`${origin}${AS_APP}`, { waitUntil: "load" });
      await page.waitForURL(/\/login\?/, { timeout: 20_000 });
      expect(new URL(page.url()).searchParams.get("to")).toBe(AS_APP);
      await page.locator("[data-login-pairing]").getByText(wording("pairing.message.sign_in")).waitFor({ timeout: 20_000 });
      // A person joining by an invitation is told to type the code on the join page instead.
      await page.locator("[data-login-pairing]").getByText(wording("pairing.message.sign_in_invited")).waitFor({ timeout: 5_000 });
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

          await page.goto(`${origin}${AS_APP}`, { waitUntil: "load" });
          await standing(page);

          // On no shell: the card alone, with what approving does, the code, the title bar of this window as where the
          // app shows it, and the machine, and no sidebar or title bar around it. The page's own title never carries the
          // code, so no tab shows one that would seem to match.
          const code = page.locator("[data-pairing-code]");

          await code.waitFor({ timeout: 20_000 });
          expect(await code.textContent()).toBe(CODE);
          expect(await page.locator("[data-pairing-lead]").textContent()).toBe(wording("pairing.message.lead_app"));
          expect(await page.locator("[data-pairing-compare]").textContent()).toBe(wording("pairing.message.compare_app"));
          expect(await page.title()).not.toContain(CODE);
          await page.getByText("u9", { exact: true }).waitFor();
          await page.getByText(wording("pairing.message.machine_effect"), { exact: true }).waitFor();
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
          const machines = page.locator("[data-pairing-machines]").getByRole("link", { name: wording("pairing.label.machines_link"), exact: true });

          expect(new URL(await machines.getAttribute("href") ?? "", origin).searchParams.get("settings")).toBe("machine");
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

        // Opened as a link, it names the desktop app's window as where the code stands, and warns of a link from another.
        await page.goto(`${origin}${AS_LINK}`, { waitUntil: "load" });
        await standing(page);
        await page.getByText(wording("pairing.label.machine_new"), { exact: true }).waitFor({ timeout: 20_000 });
        expect(await page.locator("[data-pairing-lead]").textContent()).toBe(wording("pairing.message.lead_link"));
        expect(await page.locator("[data-pairing-compare]").textContent()).toBe(wording("pairing.message.compare_link"));
        expect(await overflow(page)).toBeLessThanOrEqual(0);
        await page.getByRole("button", { name: wording("pairing.action.refuse"), exact: true }).click();
        await page.getByText(wording("pairing.message.refused"), { exact: true }).waitFor({ timeout: 10_000 });
        expect(seen).toEqual({ approved: 0, refused: 1 });
        expect(await page.getByRole("dialog").count()).toBe(0);

        const closed = await context.newPage();

        await answered(closed, "expired", null);
        await closed.goto(`${origin}${AS_LINK}`, { waitUntil: "load" });
        await standing(closed);
        await closed.getByText(wording("pairing.message.expired"), { exact: true }).waitFor({ timeout: 20_000 });
        expect(await closed.getByRole("button", { name: wording("pairing.action.approve"), exact: true }).count()).toBe(0);
        expect(await overflow(closed)).toBeLessThanOrEqual(0);
      } finally {
        await context.close();
      }
    }, 120_000);

    test(`the settings list the reader's machine, and say none where there is none, at ${width}px`, async () => {
      const context = await contextFor(width, height, "light", true);

      try {
        const page = await context.newPage();
        const machine = { agent: "u9", shared: true, attached: true, kind: "desktop", boundAt: Date.UTC(2026, 10, 18, 2, 47), left: false };

        await page.route(/\/api\/me\/machine$/, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(machine) }));

        // Opened where the pairing page leads, at an address the member may not open, the key goes along to their home.
        await page.goto(`${origin}/rooms?settings=machine`, { waitUntil: "load" });
        await standing(page);
        const section = page.locator("[data-machines]");

        await section.locator('[data-pair="name"]').getByText("u9", { exact: true }).waitFor({ timeout: 30_000 });
        await section.locator('[data-pair="name"]').getByText(wording("machines.label.shared"), { exact: true }).waitFor();
        await section.locator('[data-pair="state"]').getByText(wording("machines.status.attached"), { exact: true }).waitFor();
        expect(await section.locator('[data-pair="kind"]').textContent()).toBe(wording("machines.label.desktop"));
        expect(await section.locator('[data-pair="bound"]').textContent()).not.toBe(wording("common.label.no_record"));
        expect(await overflow(page)).toBeLessThanOrEqual(0);

        // The member is connected to no machine, which the console's own route reads from the account service.
        await page.unroute(/\/api\/me\/machine$/);
        await page.goto(`${origin}/rooms?settings=machine`, { waitUntil: "load" });
        await standing(page);
        await page.locator("[data-machines-none]").getByText(wording("machines.label.none"), { exact: true }).waitFor({ timeout: 30_000 });
        await page.getByRole("link", { name: wording("machines.action.desktop"), exact: true }).waitFor();
      } finally {
        await context.close();
      }
    }, 120_000);

    test(`the reader takes their own machine away, asked first with the machine and the app, at ${width}px`, async () => {
      const context = await contextFor(width, height, "light", true);

      try {
        const page = await context.newPage();
        let machine: Record<string, unknown> = { agent: "u9", shared: false, attached: true, kind: "desktop", left: false };
        let removals = 0;

        await page.route(/\/api\/me\/machine$/, (route) => {
          if (route.request().method() === "DELETE") {
            removals += 1;
            machine = { shared: false, attached: false, left: false };

            return route.fulfill({ status: 204 });
          }

          return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(machine) });
        });

        await page.goto(`${origin}/rooms?settings=machine`, { waitUntil: "load" });
        await standing(page);
        const row = page.locator("[data-machine-unbind]");

        await row.getByText(wording("machines.action.unbind"), { exact: true }).waitFor({ timeout: 30_000 });
        const press = row.getByRole("button", { name: wording("machines.action.unbind_confirm"), exact: true });

        // Asked on the row, the question names the machine and the app; the way out closes it and takes nothing.
        await press.click();
        const question = row.locator("[data-machine-unbind-ask]");

        await question.getByText(wording("machines.title.unbind", { name: "u9" }), { exact: true }).waitFor();
        expect(await question.textContent()).toContain(wording("machines.message.unbind_desktop"));
        expect(await overflow(page)).toBeLessThanOrEqual(0);
        await question.getByRole("button", { name: wording("common.action.cancel"), exact: true }).click();
        await question.waitFor({ state: "detached" });
        expect(removals).toBe(0);

        await press.click();
        await question.locator("[data-machine-unbind-confirm]").click();

        await page.locator("[data-machines-none]").getByText(wording("machines.label.none"), { exact: true }).waitFor({ timeout: 20_000 });
        expect(removals).toBe(1);
        expect(await row.count()).toBe(0);

        // The member reaches the console's own route, its scope and the account service behind it: connected to no
        // machine in the test console, they are told so in the section's words rather than answered as if nothing
        // stood there.
        await page.unroute(/\/api\/me\/machine$/);
        const real = await page.request.delete(`${origin}/api/me/machine`);

        expect(real.status()).toBe(404);
        expect(((await real.json()) as { message?: string }).message).toBe(wording("machines.error.none_bound"));
      } finally {
        await context.close();
      }
    }, 120_000);
  }
});
