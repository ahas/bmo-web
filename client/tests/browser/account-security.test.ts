import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wordingIn } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, fingerOn, touchReady } from "./touch";

import type { Finger } from "./touch";
import type { Browser, Locator, Page } from "playwright-core";

// Account security as a hand works it (docs/web.md, 「Access」, 「Pages with no sign-in」, 「Settings」 and
// 「System and organisation」): a forgotten password asked on the login screen, its mailed link followed and a new password signed
// in with; a second factor set up from the account section and asked at the next sign-in; and a person's password
// reset by the administrator from the people tab, mailed to them. Every press is aimed at what the browser draws, and
// nothing stands over it. A desktop's width and a phone's, in Korean. It drives the console
// tests/support/browser-console.ts stands up, and reads the mails its stand-in bmo-mail kept; the suite stands up
// neither, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const mailbox = process.env.BMO_CONSOLE_TEST_MAIL;
const say = wordingIn("ko");
const WIDTHS = [
  { width: 1280, height: 900, phone: false },
  { width: 360, height: 780, phone: true }
];
// The fixture's accounts, as the harness makes them.
const PASSWORDS: Readonly<Record<string, string>> = {
  "security-forgot-1280": "fixture-password-5101",
  "security-forgot-360": "fixture-password-5102",
  "security-factor-1280": "fixture-password-5103",
  "security-factor-360": "fixture-password-5104",
  "security-target-1280": "fixture-password-5105",
  "security-target-360": "fixture-password-5106",
  "security-admin": "fixture-password-5100"
};

let browser: Browser | null = null;

beforeAll(async () => {
  if (!origin || !mailbox || !touchReady()) return;

  browser = await chromium.launch();
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();
}, BROWSER_HOOK_MS);

interface Hand {
  page: Page;
  finger: Finger | null;
  close: () => Promise<void>;
}

async function hand(size: (typeof WIDTHS)[number]): Promise<Hand> {
  const context = await browser!.newContext({
    viewport: { width: size.width, height: size.height },
    isMobile: size.phone,
    hasTouch: size.phone,
    locale: "ko-KR",
    serviceWorkers: "block",
    reducedMotion: "reduce",
    // An address of the context's own, which the console hands on as a proxy would, so the guard's count of one address
    // never carries over from another run of the file.
    extraHTTPHeaders: { "x-real-ip": `198.51.100.${1 + Math.floor(Math.random() * 250)}` }
  });
  const page = await context.newPage();

  return { page, finger: size.phone ? await fingerOn(page) : null, close: () => context.close() };
}

// A press where the element is drawn, after holding that nothing stands over its centre: a finger's tap on a phone,
// the mouse on a desktop.
async function press(at: Hand, target: Locator): Promise<void> {
  await target.scrollIntoViewIfNeeded();

  const box = (await target.boundingBox())!;
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const free = await target.evaluate((element, { x, y }) => {
    const top = document.elementFromPoint(x, y);

    return top !== null && (element === top || element.contains(top));
  }, point);

  expect(free).toBe(true);

  if (at.finger) await at.finger.tap(point);
  else await at.page.mouse.click(point.x, point.y);
}

async function type(at: Hand, field: Locator, value: string): Promise<void> {
  await press(at, field);
  await field.fill(value);
}

async function hydrated(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const root: (Element & { __vue_app__?: { $nuxt?: { isHydrating?: boolean } } }) | null = document.querySelector("#__nuxt");

      return root?.__vue_app__?.$nuxt?.isHydrating === false;
    },
    null,
    { timeout: 30_000 }
  );
}

async function noSideScroll(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
}

async function signIn(at: Hand, name: string, password: string): Promise<void> {
  await at.page.goto(`${origin}/login`, { waitUntil: "load" });
  await hydrated(at.page);
  await type(at, at.page.locator('#login-form input[autocomplete="username"]'), name);
  await type(at, at.page.locator('#login-form input[type="password"]'), password);
  await press(at, at.page.locator('button[type="submit"][form="login-form"]'));
}

interface Mail {
  to: string;
  kind: string;
  text: string;
}

// The newest mail of a kind to an address, waited for as bmo-mail's stand-in keeps it.
async function mailTo(address: string, kind: string, after: number): Promise<Mail> {
  const end = Date.now() + 15_000;

  while (Date.now() < end) {
    const { mails } = (await (await fetch(`${mailbox}/sent`)).json()) as { mails: Mail[] };
    const found = mails.slice(after).filter((one) => one.to === address && one.kind === kind).at(-1);

    if (found !== undefined) return found;

    await Bun.sleep(250);
  }

  throw new Error(`no ${kind} mail reached ${address}`);
}

async function mailCount(): Promise<number> {
  return ((await (await fetch(`${mailbox}/sent`)).json()) as { mails: Mail[] }).mails.length;
}

function linkIn(mail: Mail): string {
  const link = /https?:\/\/\S+token=\S+/.exec(mail.text)?.[0];

  if (link === undefined) throw new Error("the mail carries no link");

  return link;
}

// The code an authenticator shows for a base32 secret, `steps` steps from now (RFC 6238: SHA-1, six digits, 30 seconds).
async function totp(secret: string, steps = 0): Promise<string> {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = [...secret.replace(/[\s=]/g, "").toUpperCase()].map((letter) => alphabet.indexOf(letter).toString(2).padStart(5, "0")).join("");
  const key = new Uint8Array(Math.floor(bits.length / 8)).map((_, index) => parseInt(bits.slice(index * 8, index * 8 + 8), 2));
  const counter = new DataView(new ArrayBuffer(8));

  counter.setBigUint64(0, BigInt(Math.floor(Date.now() / 30_000) + steps));

  const signing = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", signing, counter.buffer));
  const at = mac[19]! & 0xf;
  const value = ((mac[at]! & 0x7f) << 24) | (mac[at + 1]! << 16) | (mac[at + 2]! << 8) | mac[at + 3]!;

  return String(value % 1_000_000).padStart(6, "0");
}

describe.skipIf(!origin || !mailbox || !touchReady())("account security", () => {
  for (const size of WIDTHS) {
    test(`a forgotten password is set again by its mailed link, ${size.width}px wide`, async () => {
      const name = `security-forgot-${size.width}`;
      const address = `${name}@example.test`;
      const fresh = "a fresh password 42";
      const at = await hand(size);

      try {
        const before = await mailCount();

        await at.page.goto(`${origin}/login`, { waitUntil: "load" });
        await hydrated(at.page);
        await press(at, at.page.locator("[data-login-forgot]"));
        await at.page.waitForURL((url) => url.pathname.endsWith("/forgot-password"), { timeout: 30_000 });
        await hydrated(at.page);
        await type(at, at.page.locator("[data-forgot-who]"), address);
        await press(at, at.page.locator("[data-forgot-send]"));
        await at.page.locator("[data-forgot-sent]").waitFor({ timeout: 30_000 });

        expect(await at.page.locator("[data-forgot-sent]").textContent()).toBe(say("security.message.link_sent"));
        await noSideScroll(at.page);

        const mail = await mailTo(address, "password-reset", before);

        await at.page.goto(linkIn(mail), { waitUntil: "load" });
        await hydrated(at.page);
        await type(at, at.page.locator("[data-reset-password]"), fresh);
        await type(at, at.page.locator("[data-reset-again]"), fresh);
        await press(at, at.page.locator("[data-reset-submit]"));
        await at.page.locator("[data-reset-done]").waitFor({ timeout: 30_000 });
        await noSideScroll(at.page);

        // The link is used once.
        await at.page.goto(linkIn(mail), { waitUntil: "load" });
        await at.page.locator("[data-reset-gone]").waitFor({ timeout: 30_000 });

        await signIn(at, name, fresh);
        await at.page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 30_000 });

        // The fixture's password is set back, so the file runs again on the same console.
        const restored = await at.page.evaluate(
          async ({ base, current, password }) => (await fetch(`${base}/api/account`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ currentPassword: current, password }) })).status,
          { base: origin!, current: fresh, password: PASSWORDS[name]! }
        );

        expect(restored).toBe(200);
      } finally {
        await at.close();
      }
    }, 180_000);

    test(`a second factor set up in the account section is asked at the next sign-in, ${size.width}px wide`, async () => {
      const name = `security-factor-${size.width}`;
      const password = PASSWORDS[name]!;
      const at = await hand(size);

      try {
        await signIn(at, name, password);
        await at.page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 30_000 });
        // A member's home is their rooms, where the settings dialog opens at the account section.
        await at.page.goto(`${origin}/rooms?settings=account`, { waitUntil: "load" });
        await hydrated(at.page);

        const setUp = at.page.locator("[data-factor-set-up]");

        await setUp.waitFor({ timeout: 30_000 });
        await press(at, setUp);

        const secret = at.page.locator("[data-enrol-secret]");

        await secret.waitFor({ timeout: 30_000 });
        expect(await at.page.locator("[data-enrol-qr]").evaluate((image) => (image as HTMLImageElement).naturalWidth > 0)).toBe(true);

        const key = (await secret.textContent()) ?? "";

        await type(at, at.page.locator("[data-enrol-code]"), await totp(key));
        await press(at, at.page.locator("[data-enrol-confirm]"));
        await at.page.locator("[data-recovery-codes] li").first().waitFor({ timeout: 30_000 });

        expect(await at.page.locator("[data-recovery-codes] li").count()).toBe(10);
        await noSideScroll(at.page);
        await press(at, at.page.locator("[data-enrol-done]"));
        await at.page.locator("[data-factor-menu]").waitFor({ timeout: 30_000 });

        // Signed out, the next sign-in asks the code once the password matched.
        await at.page.context().clearCookies();
        await signIn(at, name, password);

        const code = at.page.locator("[data-login-code]");

        await code.waitFor({ timeout: 30_000 });
        await noSideScroll(at.page);
        await type(at, code, "000000");
        await press(at, at.page.locator('button[type="submit"][form="code-form"]'));
        await at.page.getByText(say("security.error.wrong_code")).waitFor({ timeout: 30_000 });
        // The next step's code, which the account takes one step ahead and was never taken.
        await type(at, code, await totp(key, 1));
        await press(at, at.page.locator('button[type="submit"][form="code-form"]'));
        await at.page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 30_000 });

        const session = await at.page.evaluate(async (base) => (await fetch(`${base}/api/_auth/session`)).json(), origin!);

        expect(session?.user?.name).toBe(name);

        // The second factor is turned off again, so the file runs again on the same console.
        const off = await at.page.evaluate(
          async ({ base, password }) => (await fetch(`${base}/api/account/second-factor/off`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) })).status,
          { base: origin!, password }
        );

        expect(off).toBe(200);
      } finally {
        await at.close();
      }
    }, 180_000);

    test(`the administrator resets a person's password from the people tab, mailed to them, ${size.width}px wide`, async () => {
      const target = `security-target-${size.width}`;
      const at = await hand(size);

      try {
        await signIn(at, "security-admin", PASSWORDS["security-admin"]!);
        await at.page.waitForURL((url) => !url.pathname.endsWith("/login"), { timeout: 30_000 });

        const users = (await at.page.evaluate(async (base) => (await fetch(`${base}/api/users`)).json(), origin!)) as { user: string; name: string }[];
        const user = users.find((one) => one.name === target)!.user;
        const before = await mailCount();

        await at.page.goto(`${origin}/organization?tab=people&user=${user}`, { waitUntil: "load" });
        await hydrated(at.page);

        const manage = at.page.locator("[data-roster-manage]");

        await manage.waitFor({ timeout: 30_000 });
        // The person's security is read before the menu offers its acts.
        await at.page.locator("[data-person-security]").waitFor({ timeout: 30_000 });
        await press(at, manage);

        const reset = at.page.getByRole("menuitem", { name: say("security.action.reset_password") });

        await reset.waitFor({ timeout: 30_000 });
        await press(at, reset);

        const confirm = at.page.getByRole("dialog").getByRole("button", { name: say("security.action.reset_password") });

        await confirm.waitFor({ timeout: 30_000 });
        await press(at, confirm);

        const mailed = at.page.locator("[data-reset-mailed]");

        await mailed.waitFor({ timeout: 30_000 });
        expect(await mailed.textContent()).toContain("@example.test");
        await noSideScroll(at.page);

        const mail = await mailTo(`${target}@example.test`, "password-reset", before);

        expect(linkIn(mail)).toContain("/reset-password?token=");
      } finally {
        await at.close();
      }
    }, 180_000);
  }
});
