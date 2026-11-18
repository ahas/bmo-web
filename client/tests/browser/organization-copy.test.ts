import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium, firefox, webkit } from "playwright-core";

import { engineReady, pastedText } from "./clipboard";
import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";

import type { Browser, BrowserContext, BrowserType, Page } from "playwright-core";

// The organisation's copy marks (docs/web.md, 「Organisation settings」 and its chart): a person's machine's install
// lines in the machine dialog, and an invitation's words in the invitations tab, both when a link is made and when an
// open one is copied again. A copy that lands turns its mark to a check, one that lands nowhere says so and turns
// nothing; a link made copies its words in the press that made it, though the service answers after the browser
// stops counting that press, in Firefox and WebKit as they ship too, and where the browser refuses it the dialog
// offers a copy of its own.
//
// It drives the console tests/support/browser-console.ts stands up, signed in as its administrator; the machine
// bound and the link made are answered in the browser, so no machine hub is asked. The suite stands up no console,
// so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "copy-marks", password: "fixture-password-3291" };
const RUN = Date.now().toString(36);
const WIDTHS = [1280, 360] as const;
// How long a press counts as fresh in the stand-in for a browser that ties the clipboard to the press, and how long
// the service takes to make a link, longer than that.
const FRESH_MS = 1_000;
const MAKING_MS = 2_000;

const install = { linux: "curl -fsSL https://hub.example.test/install.sh | sh -s -- linux-line", windows: "irm https://hub.example.test/install.ps1 | iex # windows-line" };

// How the page meets the clipboard: the browser's own; tied to a fresh press as Safari ties it, with the entry whose
// content is still to come taken or not, or with the clipboard API refusing every write so only the selection copy
// lands; the clipboard API missing as on an address the browser holds insecure; or every road refused.
type ClipboardRoad = "api" | "pressed" | "pressed-text-only" | "pressed-selection" | "missing" | "refused";

let browser: Browser | null = null;
let cookie = "";
let user = "";
let unit = 0;

async function call<T>(path: string, method: string, body?: unknown): Promise<T> {
  const answer = await fetch(`${origin}${path}`, { method, headers: { cookie, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

  expect({ path, ok: answer.ok }).toEqual({ path, ok: true });

  return (answer.status === 204 ? null : await answer.json().catch(() => null)) as T;
}

beforeAll(async () => {
  if (!origin || !touchReady()) return;

  const login = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ACCOUNT) });

  expect(login.ok).toBe(true);
  cookie = login.headers.get("set-cookie")!.split(";")[0]!;

  // A company of this run with the account standing in it, whose row opens the account's machine dialog.
  unit = (await call<{ id: number }>("/api/organization/units", "POST", { name: `copy-company-${RUN}`, parent: null })).id;
  user = (await call<{ user: string; name: string }[]>("/api/users", "GET")).find((one) => one.name === ACCOUNT.name)!.user;
  await call(`/api/organization/users/${encodeURIComponent(user)}/unit`, "PUT", { unit });

  browser = await chromium.launch();
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();
}, BROWSER_HOOK_MS);

// A signed-in context at the width; in the shared Chromium with the clipboard granted to read what landed, or in
// another browser as it ships.
async function signedContext(width: number, clipboard: ClipboardRoad, on: Browser = browser!): Promise<BrowserContext> {
  const context = await on.newContext({
    viewport: { width, height: 900 },
    serviceWorkers: "block",
    reducedMotion: "reduce",
    permissions: on === browser ? ["clipboard-read", "clipboard-write"] : []
  });
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

  // The page's clipboard bent to the road while the test keeps its own handle on the browser's to read what landed.
  if (clipboard !== "api") {
    await context.addInitScript(
      ({ road, fresh }) => {
        const own = navigator.clipboard;
        let pressed = -Infinity;
        const isFresh = () => performance.now() - pressed < fresh;

        Object.defineProperty(window, "__testClipboard", { value: own });
        for (const kind of ["pointerdown", "keydown"]) addEventListener(kind, () => (pressed = performance.now()), true);

        if (road === "missing" || road === "refused") {
          Object.defineProperty(Navigator.prototype, "clipboard", { get: () => undefined, configurable: true });
          if (road === "refused") document.execCommand = () => false;

          return;
        }

        const refuse = () => Promise.reject(new DOMException("not allowed", "NotAllowedError"));
        const tied = {
          writeText: (text: string) => (isFresh() && road !== "pressed-selection" ? own.writeText(text) : refuse()),
          write: road === "pressed" ? (items: ClipboardItem[]) => (isFresh() ? own.write(items) : refuse()) : road === "pressed-selection" ? refuse : undefined,
          readText: () => own.readText()
        };
        const execCommand = document.execCommand.bind(document);

        Object.defineProperty(Navigator.prototype, "clipboard", { get: () => tied, configurable: true });
        document.execCommand = (command: string, ...rest: unknown[]) => (isFresh() ? execCommand(command, ...(rest as [boolean, string])) : false);
      },
      { road: clipboard, fresh: FRESH_MS }
    );
  }

  return context;
}

async function clipboardText(page: Page): Promise<string> {
  return await page.evaluate(async () => {
    const own = (window as Window & { __testClipboard?: Clipboard }).__testClipboard ?? navigator.clipboard;

    return await own.readText();
  });
}

async function standing(page: Page): Promise<void> {
  await page.waitForFunction(() => window.useNuxtApp?.().isHydrating === false, null, { timeout: 30_000 });
}

// The account's machine dialog, a machine bound and waiting to attach, its install lines standing.
async function machineDialog(width: number, clipboard: ClipboardRoad): Promise<{ context: BrowserContext; page: Page }> {
  const context = await signedContext(width, clipboard);
  const path = new RegExp(`/api/organization/users/${encodeURIComponent(user)}/node(/proof)?$`);
  let bound = false;

  await context.route(path, async (route) => {
    if (route.request().method() === "PUT") {
      bound = true;

      return await route.fulfill({ json: { agent: "machine-a", attached: false, credential: "credential-a", hubUrl: "https://hub.example.test", install, shared: false } });
    }

    return await route.fulfill({ json: { agent: bound ? "machine-a" : null, attached: false, left: false, shared: false } });
  });

  const page = await context.newPage();

  await page.goto(`${origin}/organization?unit=${unit}`, { waitUntil: "load" });
  await standing(page);
  await page.locator(`[data-member-row="${user}"] [data-member-marks] button`).first().click();
  await page.getByRole("button", { name: wording("organization.action.bind"), exact: true }).click();
  await page.locator("[data-install-copy]").first().waitFor({ timeout: 20_000 });

  return { context, page };
}

const MADE = { token: `copy-token-${RUN}`, fullName: "person-a" };

// The invitations tab, its service making a link only after a press stops being fresh.
async function invitesTab(width: number, clipboard: ClipboardRoad, on?: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await signedContext(width, clipboard, on);

  await context.route(/\/api\/invites$/, async (route) => {
    if (route.request().method() !== "POST") return await route.continue();

    await new Promise((resolve) => setTimeout(resolve, MAKING_MS));
    await route.fulfill({
      json: { token: MADE.token, fullName: MADE.fullName, head: false, expiresAt: Date.now() + 3_600_000, company: { id: unit, name: `copy-company-${RUN}` }, unit: { id: unit, name: `copy-company-${RUN}` } }
    });
  });

  const page = await context.newPage();

  await page.goto(`${origin}/organization?tab=invites`, { waitUntil: "load" });
  await standing(page);
  await page.locator(`[aria-label="${wording("invites.status.loading")}"]`).waitFor({ state: "detached", timeout: 20_000 });

  return { context, page };
}

// A link asked for from the tab row's add and its dialog, named for the person.
async function makeLink(page: Page): Promise<void> {
  const create = page.getByRole("button", { name: wording("invites.label.make"), exact: true });

  await create.and(page.locator(":enabled")).waitFor({ timeout: 10_000 });
  await create.click();
  await page.locator("[data-invite-name]").fill(MADE.fullName);
  await page.getByRole("button", { name: wording("invites.action.make"), exact: true }).click();
}

// The first open link's copy mark, the link just made standing first.
function firstMark(page: Page) {
  return page.locator("[data-invite-copy]").first();
}

describe.skipIf(!origin || !touchReady())("the organisation's copy marks", () => {
  for (const width of WIDTHS) {
    test(`the machine dialog copies each install line and marks it at ${width}px`, async () => {
      const { context, page } = await machineDialog(width, "api");

      try {
        const marks = page.locator("[data-install-copy]");
        const copied = wording("common.status.copied");

        await marks.nth(0).click();
        await page.locator(`[data-install-copy][aria-label="${copied}"]`).waitFor({ timeout: 5_000 });
        expect(await clipboardText(page)).toBe(install.linux);

        await marks.nth(1).click();
        await page.waitForFunction((label) => document.querySelectorAll("[data-install-copy]")[1]?.getAttribute("aria-label") === label, copied, { timeout: 5_000 });
        expect(await clipboardText(page)).toBe(install.windows);
        expect(await marks.nth(0).getAttribute("aria-label")).toBe(wording("common.action.copy"));
      } finally {
        await context.close();
      }
    }, 90_000);

    test(`the machine dialog copies through the selection where the clipboard API is missing at ${width}px`, async () => {
      const { context, page } = await machineDialog(width, "missing");

      try {
        await page.locator("[data-install-copy]").nth(1).click();
        await page.locator(`[data-install-copy][aria-label="${wording("common.status.copied")}"]`).waitFor({ timeout: 5_000 });
        expect(await clipboardText(page)).toBe(install.windows);
      } finally {
        await context.close();
      }
    }, 90_000);

    test(`the machine dialog says a copy that landed nowhere at ${width}px`, async () => {
      const { context, page } = await machineDialog(width, "refused");

      try {
        await page.locator("[data-install-copy]").nth(0).click();
        await page.getByText(wording("common.error.copy_failed")).waitFor({ timeout: 5_000 });
        expect(await page.locator(`[data-install-copy][aria-label="${wording("common.status.copied")}"]`).count()).toBe(0);
      } finally {
        await context.close();
      }
    }, 90_000);

    test(`a link made copies its words in its own press though the service answers late at ${width}px`, async () => {
      const { context, page } = await invitesTab(width, "pressed");

      try {
        await makeLink(page);
        await page.locator("#invite-form").waitFor({ state: "detached", timeout: 15_000 });
        await page.waitForFunction((label) => document.querySelector("[data-invite-copy]")?.getAttribute("aria-label") === label, wording("invites.status.copied"), { timeout: 5_000 });

        const words = await clipboardText(page);

        expect(words).toContain(`/join/${MADE.token}`);
        expect(words).toContain(MADE.fullName);
        expect(await page.locator("[data-invite-made]").count()).toBe(0);
      } finally {
        await context.close();
      }
    }, 90_000);

    test(`a link the browser would not copy late stands in the dialog with a copy of its own at ${width}px`, async () => {
      const { context, page } = await invitesTab(width, "pressed-text-only");

      try {
        await makeLink(page);
        await page.locator("[data-invite-made]").waitFor({ timeout: 15_000 });

        const shown = (await page.locator("[data-invite-made-text]").textContent())!.trim();
        const copy = page.locator("[data-invite-made-copy]");

        expect(shown).toContain(`/join/${MADE.token}`);
        expect(await copy.textContent()).toContain(wording("invites.action.copy"));
        expect(await firstMark(page).getAttribute("aria-label")).toBe(wording("invites.action.copy"));

        await copy.click();
        await page.waitForFunction((label) => document.querySelector("[data-invite-made-copy]")?.textContent?.includes(label), wording("invites.status.copied"), { timeout: 5_000 });
        expect(await clipboardText(page)).toBe(shown);
        expect(await firstMark(page).getAttribute("aria-label")).toBe(wording("invites.status.copied"));
      } finally {
        await context.close();
      }
    }, 90_000);

    test(`a link's own copy in the dialog lands through the selection where the clipboard API refuses at ${width}px`, async () => {
      const { context, page } = await invitesTab(width, "pressed-selection");

      try {
        await makeLink(page);
        await page.locator("[data-invite-made]").waitFor({ timeout: 15_000 });

        const shown = (await page.locator("[data-invite-made-text]").textContent())!.trim();

        await page.locator("[data-invite-made-copy]").click();
        await page.waitForFunction((label) => document.querySelector("[data-invite-made-copy]")?.textContent?.includes(label), wording("invites.status.copied"), { timeout: 5_000 });
        expect(await clipboardText(page)).toBe(shown);
      } finally {
        await context.close();
      }
    }, 90_000);

    test(`an open link copied again lands its words and marks it at ${width}px`, async () => {
      const { context, page } = await invitesTab(width, "pressed-text-only");

      try {
        await makeLink(page);
        await page.locator("[data-invite-made]").waitFor({ timeout: 15_000 });

        const shown = (await page.locator("[data-invite-made-text]").textContent())!.trim();

        await page.getByRole("button", { name: wording("common.action.close"), exact: true }).last().click();
        await page.locator("[data-invite-made]").waitFor({ state: "detached", timeout: 5_000 });
        await firstMark(page).click();
        await page.waitForFunction((label) => document.querySelector("[data-invite-copy]")?.getAttribute("aria-label") === label, wording("invites.status.copied"), { timeout: 5_000 });
        expect(await clipboardText(page)).toBe(shown);
      } finally {
        await context.close();
      }
    }, 90_000);

    test(`a link whose every copy is refused says so and marks nothing at ${width}px`, async () => {
      const { context, page } = await invitesTab(width, "refused");

      try {
        await makeLink(page);
        await page.locator("[data-invite-made]").waitFor({ timeout: 15_000 });
        await page.locator("[data-invite-made-copy]").click();
        await page.getByText(wording("common.error.copy_failed")).first().waitFor({ timeout: 5_000 });
        expect(await page.locator("[data-invite-made-copy]").textContent()).toContain(wording("invites.action.copy"));

        await page.getByRole("button", { name: wording("common.action.close"), exact: true }).last().click();
        await page.locator("[data-invite-made]").waitFor({ state: "detached", timeout: 5_000 });
        // The island stands one notice at a time, so the first is let go before the second is looked for.
        const said = page.getByText(wording("common.error.copy_failed"));

        await said.first().waitFor({ state: "detached", timeout: 15_000 });
        await firstMark(page).click();
        await said.first().waitFor({ timeout: 5_000 });
        expect(await firstMark(page).getAttribute("aria-label")).toBe(wording("invites.action.copy"));
      } finally {
        await context.close();
      }
    }, 90_000);
  }

  // One width to each engine, as each is mostly met: Firefox on a desktop, WebKit as Safari on a phone.
  for (const [engine, width] of [
    [firefox, 1280],
    [webkit, 360]
  ] as [BrowserType, number][]) {
    test.skipIf(!engineReady(engine))(`a link made copies its words in its own press in ${engine.name()} as it ships at ${width}px`, async () => {
      const on = await engine.launch();

      try {
        const { page } = await invitesTab(width, "api", on);

        await makeLink(page);
        await page.locator("#invite-form").waitFor({ state: "detached", timeout: 15_000 });
        await page.waitForFunction((label) => document.querySelector("[data-invite-copy]")?.getAttribute("aria-label") === label, wording("invites.status.copied"), { timeout: 5_000 });
        expect(await page.locator("[data-invite-made]").count()).toBe(0);

        const words = await pastedText(page);

        expect(words).toContain(`/join/${MADE.token}`);
        expect(words).toContain(MADE.fullName);
      } finally {
        await on.close();
      }
    }, 90_000);
  }
});
