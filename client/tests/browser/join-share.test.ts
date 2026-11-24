import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, fingerOn, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";

import type { Browser, BrowserContext, Locator, Page, Route } from "playwright-core";

// A PC that already has an agent, shared rather than connected again (docs/web.md, 「The join page」 and 「Organisation」,
// the invitations tab; docs/accounts.md, 「A machine shared at an invitation's ask」): the join page's way to
// share this PC under the tabs, its ask waiting for a decision and leading on once approved, bound at once where the
// machine is the asking browser's own, said where refused, and an empty name refused before anything is asked; and the
// invitations tab's machine share requests, where a decider approves or refuses an ask and its row leaves. Worked at a phone's
// width with a finger and at a desktop's with the mouse, reading what the browser draws. It drives the console
// tests/support/browser-console.ts stands up, the share routes answered in the browser; the suite stands up no console,
// so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const TOKEN = "join-share-token";
// An administrator the invitations tab is read as.
const ADMINISTRATOR = { name: "join-signed-in", password: "fixture-password-4131" };
const RUN = Date.now().toString(36);

const ANDROID_AGENT = "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";
const WINDOWS_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const SIZES = [
  { width: 360, height: 740, touch: true, agent: ANDROID_AGENT },
  { width: 1280, height: 900, touch: false, agent: WINDOWS_AGENT }
] as const;

const view = { company: { id: 1, name: "company-a" }, unit: { id: 2, name: "unit-a" }, expiresAt: Date.now() + 3_600_000, fullName: "person-a", head: false, state: "open" };
const accepted = { agent: "u9", credential: "u9.credential", hubUrl: "wss://hub.invalid", user: "9", install: { linux: "install-linux-line", windows: "install-windows-line" } };

const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

let browser: Browser | null = null;

beforeAll(async () => {
  if (!origin || !touchReady()) return;

  browser = await chromium.launch();
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();
}, BROWSER_HOOK_MS);

// What the share routes answer, as a test sets it.
interface Shares {
  // The answer of the ask, and the ask as it reads back afterwards.
  answer: { status: number; body: unknown };
  state: unknown;
  asked: unknown[];
  attached: boolean;
}

type Press = (target: string | Locator) => Promise<void>;

// Press what a hand at this width presses, scrolled into view as a hand scrolls to it and only where nothing stands
// over it.
async function presser(page: Page, touch: boolean): Promise<Press> {
  const finger = touch ? await fingerOn(page) : null;

  return async (wanted) => {
    const target = typeof wanted === "string" ? page.locator(wanted).first() : wanted;

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
}

async function contextAt(size: (typeof SIZES)[number]): Promise<BrowserContext> {
  return await browser!.newContext({
    viewport: { width: size.width, height: size.height },
    userAgent: size.agent,
    hasTouch: size.touch,
    isMobile: size.touch,
    serviceWorkers: "block",
    reducedMotion: "reduce"
  });
}

// The join page at a width with the invitation accepted, no desktop release published, and the share routes
// answered as `shares` says.
async function joined(size: (typeof SIZES)[number], shares: Shares): Promise<{ context: BrowserContext; page: Page; press: Press }> {
  const context = await contextAt(size);

  await context.route(new RegExp(`/api/join/${TOKEN}/accept$`), (route) => json(route, accepted, 201));
  await context.route(new RegExp(`/api/join/${TOKEN}/proof$`), (route) => json(route, { active: shares.attached, agentLogin: false }));
  await context.route(new RegExp(`/api/join/${TOKEN}/share$`), (route) => {
    if (route.request().method() === "GET") return json(route, shares.state);

    shares.asked.push(route.request().postDataJSON());
    if ((shares.answer.body as { state?: string }).state === "bound") shares.attached = true;

    return json(route, shares.answer.body, shares.answer.status);
  });
  await context.route(new RegExp(`/api/join/${TOKEN}$`), (route) => json(route, view));
  await context.route(/\/api\/desktop\/release$/, (route) => json(route, { release: null }));

  const page = await context.newPage();
  const press = await presser(page, size.touch);

  await page.goto(`${origin}/join/${TOKEN}`, { waitUntil: "load" });
  await page.waitForFunction(() => window.useNuxtApp?.().isHydrating === false, null, { timeout: 30_000 });
  await page.locator('input[autocomplete="username"]').fill("joined-share");
  await page.locator('input[autocomplete="new-password"]').fill("fixture-password-7742");
  await press('button[type="submit"][form="join-form"]');
  await page.locator("[data-join-share-open]").waitFor({ timeout: 20_000 });

  return { context, page, press };
}

async function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

// The ask opened and sent with the machine's name typed.
async function ask(page: Page, press: Press, machine: string): Promise<void> {
  await press("[data-join-share-open]");
  await page.locator("[data-join-share-machine]").fill(machine);
  await press("[data-join-share-send]");
}

describe.skipIf(!origin || !touchReady())("sharing a PC that already has an agent", () => {
  for (const size of SIZES) {
    test(`asks to share the PC and leads on once approved at ${size.width}px`, async () => {
      const shares: Shares = { answer: { status: 200, body: { machine: "pc-a", state: "asked", holders: [] } }, state: null, asked: [], attached: false };
      const { context, page, press } = await joined(size, shares);

      try {
        // The way stands under the tabs whichever is chosen, its line saying when it is for.
        expect(await page.locator("[data-join-share]").innerText()).toContain(wording("join.message.share_line"));
        await ask(page, press, "pc-a");
        await page.locator("[data-join-share-asked]").waitFor({ timeout: 10_000 });
        expect(shares.asked).toEqual([{ machine: "pc-a" }]);
        expect(await page.locator("[data-join-share-asked]").innerText()).toContain(wording("join.message.share_asked", { machine: "pc-a" }).split("\n")[0]!);
        expect(await overflow(page)).toBeLessThanOrEqual(0);

        // Approved, the ask read again leads on at once: the account turns active and the ask gives way to it.
        shares.state = { machine: "pc-a", askedAt: Date.now(), state: "approved" };
        shares.attached = true;
        await page.locator("[data-join-active]").waitFor({ timeout: 20_000 });
        await page.locator("[data-join-share]").waitFor({ state: "detached", timeout: 10_000 });
        expect(await overflow(page)).toBeLessThanOrEqual(0);
      } finally {
        await context.close();
      }
    }, 120_000);

    test(`binds the browser's own PC at once at ${size.width}px`, async () => {
      const shares: Shares = { answer: { status: 200, body: { machine: "pc-a", state: "bound", holders: ["5"] } }, state: null, asked: [], attached: false };
      const { context, page, press } = await joined(size, shares);

      try {
        // Bound as it is asked, the account is asked after at once and turns active long before the next wait.
        await ask(page, press, "pc-a");
        await page.locator("[data-join-active]").waitFor({ timeout: 4_000 });
        await page.locator("[data-join-share]").waitFor({ state: "detached", timeout: 10_000 });
      } finally {
        await context.close();
      }
    }, 120_000);

    test(`says a refused ask and a name the hub holds no agent of, the field kept for another try at ${size.width}px`, async () => {
      const refusal = wording("join.error.share_no_machine");
      const shares: Shares = { answer: { status: 404, body: { statusCode: 404, message: refusal } }, state: null, asked: [], attached: false };
      const { context, page, press } = await joined(size, shares);

      try {
        // An empty name is refused before anything is asked.
        await ask(page, press, "  ");
        await page.locator("[data-join-share]").getByText(wording("join.error.share_empty"), { exact: true }).waitFor({ timeout: 10_000 });
        expect(shares.asked).toEqual([]);

        await page.locator("[data-join-share-machine]").fill("pc-z");
        await press("[data-join-share-send]");
        await page.locator("[data-join-share]").getByText(refusal, { exact: true }).waitFor({ timeout: 10_000 });
        expect(shares.asked).toEqual([{ machine: "pc-z" }]);

        // An earlier ask read back refused says so, and the field stands for another ask.
        shares.state = { machine: "pc-a", askedAt: Date.now(), state: "refused" };
        await page.reload({ waitUntil: "load" });
        await page.waitForFunction(() => window.useNuxtApp?.().isHydrating === false, null, { timeout: 30_000 });
        await page.locator('input[autocomplete="username"]').fill("joined-share");
        await page.locator('input[autocomplete="new-password"]').fill("fixture-password-7742");
        await press('button[type="submit"][form="join-form"]');
        await page.locator("[data-join-share-refused]").waitFor({ timeout: 20_000 });
        expect(await page.locator("[data-join-share-machine]").isVisible()).toBe(true);
        expect(await overflow(page)).toBeLessThanOrEqual(0);
      } finally {
        await context.close();
      }
    }, 120_000);
  }
});

describe.skipIf(!origin || !touchReady())("the invitations tab's share asks", () => {
  let cookie = "";
  let company = 0;

  beforeAll(async () => {
    if (!origin || !touchReady()) return;

    const login = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ADMINISTRATOR) });

    expect(login.ok).toBe(true);
    cookie = login.headers.get("set-cookie")!.split(";")[0]!;
    const made = await fetch(`${origin}/api/organization/units`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ name: `share-company-${RUN}`, parent: null }) });

    expect(made.ok).toBe(true);
    company = ((await made.json()) as { id: number }).id;
  }, BROWSER_HOOK_MS);

  const row = (user: string, machine: string) => ({
    user,
    login: `asker-${user}`,
    fullName: `asker ${user}`,
    unit: { id: company, name: `share-company-${RUN}` },
    company: { id: company, name: `share-company-${RUN}` },
    machine,
    holders: [{ user: "5", login: "holder-a", fullName: "holder a" }],
    askedAt: Date.now()
  });

  for (const size of SIZES) {
    test(`approves one ask and refuses another, each row leaving at ${size.width}px`, async () => {
      const context = await contextAt(size);
      const at = cookie.indexOf("=");
      const decided: string[] = [];
      let asks = [row("31", "pc-a"), row("32", "pc-b")];

      await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
      await context.route(/\/api\/invites\/shares$/, (route) => json(route, asks));
      await context.route(/\/api\/invites\/shares\/[^/]+\/(approve|refuse)$/, (route) => {
        const [, user, how] = /shares\/([^/]+)\/(approve|refuse)$/.exec(route.request().url())!;

        decided.push(`${user}:${how}`);
        asks = asks.filter((one) => one.user !== user);

        return how === "approve" ? json(route, { machine: "pc-a", state: "bound", holders: ["5"] }) : route.fulfill({ status: 204 });
      });

      const page = await context.newPage();
      const press = await presser(page, size.touch);

      try {
        await page.goto(`${origin}/organization?company=${company}&tab=invites`, { waitUntil: "load" });
        await page.locator("[data-share-ask]").first().waitFor({ timeout: 30_000 });
        expect(await page.locator("[data-share-ask]").count()).toBe(2);
        const first = page.locator("[data-share-ask]").first();

        expect(await first.innerText()).toContain(wording("invites.label.share_machine", { machine: "pc-a" }));
        expect(await first.innerText()).toContain(wording("invites.label.share_holders", { names: "holder a" }));

        await press(first.locator("[data-share-approve]"));
        await page.waitForFunction(() => document.querySelectorAll("[data-share-ask]").length === 1, null, { timeout: 10_000 });
        await press(page.locator("[data-share-ask] [data-share-refuse]").first());
        await page.locator("[data-share-asks]").waitFor({ state: "detached", timeout: 10_000 });
        expect(decided).toEqual(["31:approve", "32:refuse"]);
        expect(await overflow(page)).toBeLessThanOrEqual(0);
      } finally {
        await context.close();
      }
    }, 120_000);
  }
});
