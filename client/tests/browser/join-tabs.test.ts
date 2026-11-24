import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, fingerOn, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";

import type { Browser, BrowserContext, Locator, Page, Route } from "playwright-core";

// The join page's two ways to connect the machine (docs/web.md, 「The join page」): the desktop app's tab first and
// chosen where a release is published, its installers with the reader's own platform leading, the console's own
// address to give the app, and the code from the app's title bar approved with the invitation; jake's command chosen
// where none is published, the desktop tab then offering nothing to download but still pairing an app already
// installed, and jake's tab saying what a refusal on a PC with a jake already means; both waiting for the same proof and
// ending in the same state; and a browser already signed in to another account told so, its session ended by the way
// to the login, which opens for the new account. Worked at a phone's width with a finger and at a desktop's with the mouse, reading what
// the browser draws. It drives the console tests/support/browser-console.ts stands up, the join routes answered in the
// browser; the suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const TOKEN = "join-tabs-token";
// The account the browser is already signed in to as the join page opens.
const SIGNED_IN = { name: "join-signed-in", password: "fixture-password-4131" };

const WINDOWS_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const ANDROID_AGENT = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";

// The two widths, each as a hand meets it: a phone with a finger, a desktop with the mouse.
const SIZES = [
  { width: 360, height: 740, touch: true, agent: ANDROID_AGENT },
  { width: 1280, height: 900, touch: false, agent: WINDOWS_AGENT }
] as const;

const view = { company: { id: 1, name: "company-a" }, unit: { id: 2, name: "unit-a" }, expiresAt: Date.now() + 3_600_000, fullName: "person-a", head: false, state: "open" };
const accepted = { agent: "u9", credential: "u9.credential", hubUrl: "wss://hub.invalid", user: "9", install: { linux: "install-linux-line", windows: "install-windows-line" } };
const file = (platform: string, format: string) => ({ platform, arch: "x86_64", format, file: `bmo-${platform}.${format}`, size: 1024, sha256: "0".repeat(64), url: `https://releases.invalid/bmo-${platform}.${format}` });
const RELEASE = { version: "1.0.0", date: "2026-01-01T00:00:00Z", files: [file("windows", "nsis"), file("linux", "appimage")] };

const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

let browser: Browser | null = null;

beforeAll(async () => {
  if (!origin || !touchReady()) return;

  browser = await chromium.launch();
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();
}, BROWSER_HOOK_MS);

interface Joined {
  context: BrowserContext;
  page: Page;
  // The codes the page asked to approve, and whether the machine reads as attached.
  paired: unknown[];
  attached: { now: boolean };
  // Press what a hand at this width presses: a finger's tap on a phone, the mouse on a desktop.
  press: (target: string | Locator) => Promise<void>;
}

// The page at a width, the invitation accepted, its routes answered here: the release as given, the pairing approved
// or refused as `pairAnswer` says, and the proof attached once a code was approved.
async function joined(size: (typeof SIZES)[number], release: unknown, pairAnswer: { status: number; body: unknown } = { status: 200, body: { machine: "u9" } }, cookie: string | null = null): Promise<Joined> {
  const context = await browser!.newContext({
    viewport: { width: size.width, height: size.height },
    userAgent: size.agent,
    hasTouch: size.touch,
    isMobile: size.touch,
    serviceWorkers: "block",
    reducedMotion: "reduce"
  });

  if (cookie !== null) {
    const at = cookie.indexOf("=");

    await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
  }
  const paired: unknown[] = [];
  const attached = { now: false };

  await context.route(new RegExp(`/api/join/${TOKEN}/accept$`), (route) => json(route, accepted, 201));
  await context.route(new RegExp(`/api/join/${TOKEN}/proof$`), (route) => json(route, { active: attached.now, agentLogin: false }));
  await context.route(new RegExp(`/api/join/${TOKEN}/pair$`), (route) => {
    paired.push(route.request().postDataJSON());
    if (pairAnswer.status === 200) attached.now = true;

    return json(route, pairAnswer.body, pairAnswer.status);
  });
  await context.route(new RegExp(`/api/join/${TOKEN}/share$`), (route) => json(route, null));
  await context.route(new RegExp(`/api/join/${TOKEN}$`), (route) => json(route, view));
  await context.route(/\/api\/desktop\/release$/, (route) => json(route, { release }));

  const page = await context.newPage();
  const finger = size.touch ? await fingerOn(page) : null;
  const press = async (wanted: string | Locator): Promise<void> => {
    const target = typeof wanted === "string" ? page.locator(wanted).first() : wanted;

    // Scrolled into view as a hand scrolls to it, then pressed where nothing stands over it.
    await target.scrollIntoViewIfNeeded();
    const box = (await target.boundingBox())!;
    const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const covered = await target.evaluate((element, { x, y }) => {
      const hit = document.elementFromPoint(x, y);

      return hit === null || !(element === hit || element.contains(hit));
    }, at);

    expect(covered).toBe(false);
    if (finger === null) await page.mouse.click(at.x, at.y);
    else await finger.tap(at);
  };

  await page.goto(`${origin}/join/${TOKEN}`, { waitUntil: "load" });
  await page.waitForFunction(() => window.useNuxtApp?.().isHydrating === false, null, { timeout: 30_000 });
  await page.locator('input[autocomplete="username"]').fill("joined-b");
  await page.locator('input[autocomplete="new-password"]').fill("fixture-password-7741");
  await press('button[type="submit"][form="join-form"]');
  await page.locator("[data-join-ways]").waitFor({ timeout: 20_000 });

  return { context, page, paired, attached, press };
}

// How far the page's widest box stands past the window.
async function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

function tab(page: Page, key: string) {
  return page.locator("[data-join-ways]").getByRole("tab", { name: wording(key), exact: true });
}

describe.skipIf(!origin || !touchReady())("the join page's two ways", () => {
  for (const size of SIZES) {
    test(`connects through the desktop app with the code from its title bar at ${size.width}px`, async () => {
      const { context, page, paired, press } = await joined(size, RELEASE);

      try {
        // The desktop tab stands first and chosen, both tabs whole inside the window.
        await page.locator("[data-join-desktop]").waitFor({ timeout: 10_000 });
        expect(await tab(page, "join.label.tab_desktop").getAttribute("aria-selected")).toBe("true");
        for (const key of ["join.label.tab_desktop", "join.label.tab_jake"]) {
          const box = (await tab(page, key).boundingBox())!;

          expect(box.x).toBeGreaterThanOrEqual(0);
          expect(box.x + box.width).toBeLessThanOrEqual(size.width);
        }

        // Every platform's installer, the reader's own leading where the browser names a PC.
        const downloads = page.locator("[data-join-download]");

        expect(await downloads.evaluateAll((buttons) => buttons.map((button) => button.getAttribute("data-join-download")))).toEqual(["windows", "linux"]);
        expect(await downloads.first().getAttribute("href")).toBe(RELEASE.files[0]!.url);

        // The address the app asks for is the console's public address, which the console's own stands as.
        expect((await page.locator("[data-join-server]").innerText()).trim()).toBe(`${new URL(origin!).origin}/console`);

        // The code typed as the title bar shows it, in either case, approved with the invitation.
        await page.locator("[data-join-code]").fill("abcd-efgh");
        await press("[data-join-connect]");
        await page.locator("[data-join-approved]").waitFor({ timeout: 10_000 });
        expect(paired).toEqual([{ code: "ABCD-EFGH" }]);

        // The app's agent attached, the page ends where the jake tab ends.
        await page.locator("[data-join-active]").waitFor({ timeout: 20_000 });
        expect(await overflow(page)).toBeLessThanOrEqual(0);
      } finally {
        await context.close();
      }
    }, 120_000);

    test(`says a refused code under the field and keeps it for another try at ${size.width}px`, async () => {
      const { context, page, paired, press } = await joined(size, RELEASE, { status: 410, body: { statusCode: 410, message: wording("join.error.code_closed") } });

      try {
        await page.locator("[data-join-code]").fill("ABCD-EFGH");
        await press("[data-join-connect]");
        await page.locator("[data-join-desktop]").getByText(wording("join.error.code_closed"), { exact: true }).waitFor({ timeout: 10_000 });
        expect(paired).toHaveLength(1);
        expect(await page.locator("[data-join-code]").isVisible()).toBe(true);
        expect(await page.locator("[data-join-approved]").count()).toBe(0);
      } finally {
        await context.close();
      }
    }, 120_000);

    test(`signs the browser's other account out and opens the login for the new one at ${size.width}px`, async () => {
      const signedIn = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(SIGNED_IN) });

      expect(signedIn.ok).toBe(true);

      const { context, page, press, attached } = await joined(size, null, undefined, signedIn.headers.get("set-cookie")!.split(";")[0]!);

      try {
        // The page names the account the browser holds before anything is pressed.
        expect(await page.locator("[data-join-signed-in]").innerText()).toContain(wording("join.message.signed_in_as", { name: SIGNED_IN.name }).split("\n")[0]!);

        attached.now = true;
        await press("[data-join-check]");
        await page.locator("[data-join-active]").waitFor({ timeout: 20_000 });
        await press("[data-join-login]");

        // The login for the new account, its login filled in, and the old session gone.
        await page.waitForURL(/\/login(\?|$)/, { timeout: 20_000 });
        expect(await page.locator('input[autocomplete="username"]').inputValue()).toBe("joined-b");
        // The login leads the new account into the start guide (docs/web.md, 「The start guide」).
        expect(new URL(page.url()).searchParams.get("to")).toBe("/start");
        const me = await page.evaluate(async () => (await fetch(`${location.pathname.replace(/\/login$/, "")}/api/auth/me`)).status);

        expect(me).not.toBe(200);
      } finally {
        await context.close();
      }
    }, 120_000);

    test(`chooses jake's command where no release is published and still pairs an installed app at ${size.width}px`, async () => {
      const { context, page, press, paired } = await joined(size, null);

      try {
        await page.locator("[data-join-jake]").waitFor({ timeout: 10_000 });
        expect(await tab(page, "join.label.tab_jake").getAttribute("aria-selected")).toBe("true");
        expect(await page.locator("[data-install-copy]").count()).toBe(2);
        expect(await overflow(page)).toBeLessThanOrEqual(0);

        // jake's tab says plainly what a refusal on a PC that already has a jake means.
        expect(await page.locator("[data-join-one-jake]").innerText()).toBe(wording("join.message.one_jake"));

        // The desktop tab, pressed, says the app cannot be downloaded yet and offers nothing to download, and still
        // pairs an app already installed with the code from its title bar.
        await press(tab(page, "join.label.tab_desktop"));
        await page.locator("[data-join-desktop-unavailable]").waitFor({ timeout: 10_000 });
        expect(await page.locator("[data-join-download]").count()).toBe(0);
        expect(await page.locator("[data-join-server]").isVisible()).toBe(true);
        await page.locator("[data-join-code]").fill("wxyz-2345");
        await press("[data-join-connect]");
        await page.locator("[data-join-approved]").waitFor({ timeout: 10_000 });
        expect(paired).toEqual([{ code: "WXYZ-2345" }]);
        expect(await overflow(page)).toBeLessThanOrEqual(0);

        // The app's agent attached, the page ends on jake's tab as on the desktop tab.
        await page.locator("[data-join-active]").waitFor({ timeout: 20_000 });
        await press(tab(page, "join.label.tab_jake"));
        expect(await page.locator("[data-join-active]").isVisible()).toBe(true);
      } finally {
        await context.close();
      }
    }, 120_000);
  }
});
