import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { IN_USE_HOST } from "../support/mail-servers";
import { wording } from "../../apps/web/shared/wording";

import type { Browser, BrowserContext, Locator, Page } from "playwright-core";

// The mail servers a company offers its people (docs/web.md, 「System and organisation」, the mail servers tab): an incoming server
// added through the server form after its connection test, an outgoing one beside it, the first changed, the second's
// removal refused while accounts stand on it, the units below locked out, and a unit under the lock seeing who holds it
// with every change disabled; and the one line standing where bmo-mail is not installed. Each is worked as a hand works
// it at a phone's width and a desk's: what a press lands on is the control it names, nothing runs off the side, and
// what a press does is read back off the screen.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up, whose
// bmo-mail stand-in keeps the servers and writes each link's list on the account service's chain as bmo-mail does.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ADMINISTRATOR = { name: "org-mail", password: "fixture-password-3931" };
// A member who heads a unit under the company's lock.
const HEAD = { name: "mail-head", password: "fixture-password-3932" };
const RUN = Date.now().toString(36);
const WIDTHS = [360, 1280] as const;

let browser: Browser | null = null;
let cookie = "";
let headCookie = "";
let head = "";

async function login(account: { name: string; password: string }): Promise<string> {
  const answer = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(account) });

  expect(answer.ok).toBe(true);

  return answer.headers.get("set-cookie")!.split(";")[0]!;
}

// A call of the console's own API as the administrator.
async function administer<T>(path: string, method: string, body?: unknown): Promise<T> {
  const answer = await fetch(`${origin}${path}`, { method, headers: { cookie, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

  expect({ path, ok: answer.ok }).toEqual({ path, ok: true });

  return (answer.status === 204 ? null : await answer.json().catch(() => null)) as T;
}

beforeAll(async () => {
  if (!origin || !touchReady()) return;

  cookie = await login(ADMINISTRATOR);
  headCookie = await login(HEAD);
  head = (await administer<{ user: string; name: string }[]>("/api/users", "GET")).find((one) => one.name === HEAD.name)!.user;
  browser = await chromium.launch();
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();
}, BROWSER_HOOK_MS);

// A unit of the test's own, a company where no parent is named, so each width starts from nothing set.
async function newUnit(name: string, parent: number | null): Promise<number> {
  return (await administer<{ id: number }>("/api/organization/units", "POST", { name, parent })).id;
}

async function contextAt(width: number, signed = cookie): Promise<BrowserContext> {
  const context = await browser!.newContext({ viewport: { width, height: width < 600 ? 780 : 900 }, serviceWorkers: "block", reducedMotion: "reduce", locale: "ko-KR" });

  const at = signed.indexOf("=");

  await context.addCookies([{ name: signed.slice(0, at), value: signed.slice(at + 1), url: origin! }]);

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

// A control pressed where a hand presses it, once nothing stands over it.
async function press(control: Locator): Promise<void> {
  expect(await reachable(control)).toBe(true);
  await control.click();
}

async function opened(page: Page, address: string): Promise<Locator> {
  await page.goto(`${origin}/organization?${address}&tab=mail-servers`, { waitUntil: "load" });
  await standing(page);

  const tab = page.locator("[data-mail-servers]");

  await tab.locator("[data-mail-delegation]").waitFor({ timeout: 20_000 });

  return tab;
}

// A select of the form chosen by its word.
async function choose(page: Page, select: Locator, word: string): Promise<void> {
  await press(select);
  await page.getByRole("option", { name: word, exact: true }).click();
}

// The words under a server's name.
async function lineOf(tab: Locator, name: string): Promise<string> {
  return await tab.locator(`[data-mail-server="${name}"] [data-mail-server-line]`).innerText({ timeout: 15_000 });
}

describe.skipIf(!origin || !touchReady())("the mail servers a company offers its people", () => {
  for (const width of WIDTHS) {
    test(`a company keeps its servers, changes one, is refused removing one in use and locks them below at ${width}px`, async () => {
      const companyName = `mail-${width}-${RUN}`;
      const company = await newUnit(companyName, null);
      const team = await newUnit(`mail-team-${width}-${RUN}`, company);
      const context = await contextAt(width);
      const page = await context.newPage();
      const tab = await opened(page, `company=${company}`);
      const incoming = `incoming-${width}`;
      const outgoing = `outgoing-${width}`;

      await tab.locator('[data-mail-none="incoming"]').getByText(wording("org_mail.label.incoming_none"), { exact: true }).waitFor();
      await tab.locator('[data-mail-none="outgoing"]').getByText(wording("org_mail.label.outgoing_none"), { exact: true }).waitFor();
      expect(await overflows(page)).toBe(false);

      // An incoming server: the usual port of its security stands as the port's placeholder, and the connection test
      // says what it came to for the host the form holds.
      await press(page.locator("[data-tab-add]"));

      const dialog = page.getByRole("dialog");
      const save = dialog.locator("[data-mail-save]");

      expect(await dialog.locator('[data-mail-input="port"]').getAttribute("placeholder")).toBe(wording("org_mail.placeholder.port", { port: 993 }));
      expect(await save.isDisabled()).toBe(true);
      await dialog.locator('[data-mail-input="host"]').fill("imap.invalid");
      await press(dialog.locator("[data-mail-test]"));
      await dialog.locator("[data-mail-tested]").getByText(wording("org_mail.label.test_unreached"), { exact: true }).waitFor({ timeout: 15_000 });
      await dialog.locator('[data-mail-input="host"]').fill("imap.example.com");
      expect(await dialog.locator("[data-mail-tested]").count()).toBe(0);
      await press(dialog.locator("[data-mail-test]"));
      await dialog.locator("[data-mail-tested]").getByText(wording("org_mail.label.test_reached"), { exact: true }).waitFor({ timeout: 15_000 });
      await dialog.locator('[data-mail-input="name"]').fill(incoming);
      expect(await overflows(page)).toBe(false);
      await press(save);
      await dialog.waitFor({ state: "detached", timeout: 15_000 });

      expect(await lineOf(tab, incoming)).toBe(["IMAP", "imap.example.com:993", "TLS"].join(" · "));

      // An outgoing server with accounts standing on it: the sign-in is asked for SMTP alone, and STARTTLS's port
      // stands as the placeholder.
      await press(page.locator("[data-tab-add]"));
      await choose(page, dialog.locator("[data-mail-protocol]"), wording("org_mail.label.protocol_smtp"));
      expect(await dialog.locator('[data-mail-input="port"]').getAttribute("placeholder")).toBe(wording("org_mail.placeholder.port", { port: 587 }));
      await dialog.locator("[data-mail-auth]").waitFor();
      await dialog.locator('[data-mail-input="host"]').fill(IN_USE_HOST);
      await dialog.locator('[data-mail-input="name"]').fill(outgoing);
      await press(save);
      await dialog.waitFor({ state: "detached", timeout: 15_000 });

      expect(await lineOf(tab, outgoing)).toBe(["SMTP", `${IN_USE_HOST}:587`, "STARTTLS", wording("org_mail.label.accounts", { count: "2" })].join(" · "));

      // The incoming server changed: its protocol stays, and plain IMAP's port follows its security.
      await press(tab.locator(`[data-mail-server="${incoming}"] [data-mail-edit]`));
      expect(await dialog.locator("[data-mail-protocol]").isDisabled()).toBe(true);
      expect(await save.isDisabled()).toBe(true);
      await choose(page, dialog.locator("[data-mail-security]"), wording("org_mail.label.security_starttls"));
      await dialog.locator('[data-mail-input="port"]').fill("");
      await press(save);
      await dialog.waitFor({ state: "detached", timeout: 15_000 });
      await page.waitForFunction(
        (name) => document.querySelector(`[data-mail-server="${name}"] [data-mail-server-line]`)?.textContent?.includes(":143") === true,
        incoming,
        { timeout: 15_000 }
      );
      expect(await lineOf(tab, incoming)).toBe(["IMAP", "imap.example.com:143", "STARTTLS"].join(" · "));

      // Removing the outgoing server asks first, naming it, and is refused while accounts stand on it.
      await press(tab.locator(`[data-mail-server="${outgoing}"] [data-mail-delete]`));

      const question = page.getByRole("alertdialog").or(page.getByRole("dialog"));

      await question.getByText(wording("org_mail.message.delete_confirm"), { exact: true }).waitFor({ timeout: 10_000 });
      await question.getByText(outgoing, { exact: true }).waitFor();
      await press(question.getByRole("button", { name: wording("common.action.delete"), exact: true }));
      await question.waitFor({ state: "detached", timeout: 10_000 });
      await tab.locator("[data-mail-failure]").getByText(wording("org_mail.error.in_use"), { exact: true }).waitFor({ timeout: 15_000 });
      expect(await tab.locator(`[data-mail-server="${outgoing}"]`).count()).toBe(1);
      expect(await overflows(page)).toBe(false);

      // The units below locked out of the company's servers.
      await choose(page, tab.locator("[data-mail-delegation]"), wording("org_agents.label.delegation_lock"));
      await page.waitForFunction((lock) => document.querySelector("[data-mail-delegation]")?.textContent?.includes(lock) === true, wording("org_agents.label.delegation_lock"), {
        timeout: 15_000
      });

      await context.close();

      // The head of a unit under the lock is told who holds it, and nothing of the unit's can change.
      await administer(`/api/organization/users/${encodeURIComponent(head)}/unit`, "PUT", { unit: team });
      await administer(`/api/organization/units/${team}/heads/${encodeURIComponent(head)}`, "PUT");

      const headContext = await contextAt(width, headCookie);
      const headPage = await headContext.newPage();
      const below = await opened(headPage, `company=${company}&unit=${team}`);

      await below.locator("[data-mail-below]").getByText(wording("org_agents.label.decided_named", { name: companyName }), { exact: true }).waitFor({ timeout: 15_000 });
      await below.locator('[data-mail-none="incoming"]').waitFor();
      expect(await below.locator("[data-mail-delegation]").isDisabled()).toBe(true);
      expect(await headPage.locator("[data-tab-add]").isDisabled()).toBe(true);
      expect(await overflows(headPage)).toBe(false);

      await headContext.close();
    }, 120_000);

    test(`the tab says bmo-mail is not installed and offers nothing at ${width}px`, async () => {
      const company = await newUnit(`mail-absent-${width}-${RUN}`, null);
      const context = await contextAt(width);
      const page = await context.newPage();

      // The console's own answer where its settings name no bmo-mail, since the console standing for the tests names one.
      await context.route(/\/api\/organization\/mail-servers\?/, async (route) => await route.fulfill({ json: { installed: false } }));
      await page.goto(`${origin}/organization?company=${company}&tab=mail-servers`, { waitUntil: "load" });
      await standing(page);

      await page.locator("[data-mail-not-installed]").getByText(wording("org_mail.message.not_installed"), { exact: true }).waitFor({ timeout: 20_000 });
      expect(await page.locator("[data-mail-group]").count()).toBe(0);
      expect(await page.locator("[data-tab-add]").count()).toBe(0);
      expect(await overflows(page)).toBe(false);

      await context.close();
    }, 60_000);
  }
});
