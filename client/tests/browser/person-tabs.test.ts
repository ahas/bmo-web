import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";

import type { Browser, BrowserContext, Locator, Page } from "playwright-core";

// One person on the organisation screen's people tab stands as a head over a row of tabs, one tab a part of what is
// theirs, the address naming the tab open, and the activity tab standing for the administrator alone; a link to the
// person's old permissions tab lands on the organisation's permissions tab with the person open, where their sections are
// set (docs/web.md, 「System and organisation」, the people and permissions tabs). Read at a desk's width and a phone's, by the
// administrator and by a company head.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ADMINISTRATOR = { name: "person-tabs", password: "fixture-password-3363" };
const HEAD = { name: "person-tabs-head", password: "fixture-password-3364" };
// The person read, who stands in the head's company and never signs in.
const SUBJECT = "person-tabs-subject";
const RUN = Date.now().toString(36);

const ADMINISTRATOR_TABS = ["settings.label.account", "people.label.organization", "settings.label.bmo", "supply.label.tab", "roster.label.activity"];
const HEAD_TABS = ["settings.label.account", "people.label.organization", "settings.label.bmo"];
// Each tab's key in the address, the first standing as none, and what it shows once open.
const PANES: readonly { key: string | null; label: string; shows: string }[] = [
  { key: null, label: "settings.label.account", shows: "[data-person-account]" },
  { key: "organization", label: "people.label.organization", shows: "[data-roster-history]" },
  { key: "bmo", label: "settings.label.bmo", shows: "[data-person-bmo]" },
  { key: "activity", label: "roster.label.activity", shows: "[data-roster-runs], [data-person-activity] p" }
];

let browser: Browser | null = null;
const cookies = new Map<string, string>();
let company = 0;
let head = "";
let subject = "";

async function login(account: { name: string; password: string }): Promise<string> {
  const answer = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(account) });

  expect(answer.ok).toBe(true);

  return answer.headers.get("set-cookie")!.split(";")[0]!;
}

// A call of the console's own API as the administrator.
async function administer<T>(path: string, method: string, body?: unknown): Promise<T> {
  const answer = await fetch(`${origin}${path}`, {
    method,
    headers: { cookie: cookies.get(ADMINISTRATOR.name)!, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  expect({ path, status: answer.status, ok: answer.ok }).toMatchObject({ path, ok: true });

  return (answer.status === 204 ? null : await answer.json().catch(() => null)) as T;
}

beforeAll(async () => {
  if (!origin || !touchReady()) return;

  cookies.set(ADMINISTRATOR.name, await login(ADMINISTRATOR));
  cookies.set(HEAD.name, await login(HEAD));

  // A company of this run's with a team under it: the head stands in the company and heads it, the person read in the
  // team.
  company = (await administer<{ id: number }>("/api/organization/units", "POST", { name: `tabs-company-${RUN}`, parent: null })).id;
  const team = (await administer<{ id: number }>("/api/organization/units", "POST", { name: `tabs-team-${RUN}`, parent: company })).id;
  const users = await administer<{ user: string; name: string }[]>("/api/users", "GET");

  head = users.find((one) => one.name === HEAD.name)!.user;
  subject = users.find((one) => one.name === SUBJECT)!.user;
  await administer(`/api/organization/users/${encodeURIComponent(head)}/unit`, "PUT", { unit: company });
  await administer(`/api/organization/units/${company}/heads/${encodeURIComponent(head)}`, "PUT");
  await administer(`/api/organization/users/${encodeURIComponent(subject)}/unit`, "PUT", { unit: team });

  browser = await chromium.launch();
}, BROWSER_HOOK_MS);

afterAll(async () => {
  if (head !== "" && company !== 0) await administer(`/api/organization/units/${company}/heads/${encodeURIComponent(head)}`, "DELETE").catch(() => null);
  await browser?.close();
}, BROWSER_HOOK_MS);

async function contextFor(account: string, width: number, height: number, scheme: "light" | "dark" = "light"): Promise<BrowserContext> {
  const context = await browser!.newContext({ viewport: { width, height }, colorScheme: scheme, serviceWorkers: "block", reducedMotion: "reduce" });
  const cookie = cookies.get(account)!;
  const at = cookie.indexOf("=");

  await context.addCookies([
    { name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! },
    { name: "nuxt-color-mode", value: scheme, url: origin! }
  ]);

  return context;
}

// The console's app standing on the page once it has taken it over.
async function standing(page: Page): Promise<void> {
  await page.waitForFunction(() => window.useNuxtApp?.().isHydrating === false, null, { timeout: 30_000 });
}

// The person's tab row, as it names itself.
function paneRow(page: Page): Locator {
  return page.locator(`[aria-label="${wording("roster.aria.person_tabs")}"]`);
}

async function paneNames(page: Page): Promise<string[]> {
  await paneRow(page).getByRole("tab").first().waitFor({ timeout: 20_000 });

  return (await paneRow(page).getByRole("tab").allInnerTexts()).map((one) => one.trim());
}

// Waits until the tab named stands open in the row.
async function opened(page: Page, label: string): Promise<void> {
  await paneRow(page).locator('[role="tab"][data-state="active"]').filter({ hasText: new RegExp(`^\\s*${wording(label)}\\s*$`) }).waitFor({ timeout: 20_000 });
}

// Waits until the address stands on the people tab with the person and the tab named, none meaning the first.
async function landed(page: Page, user: string | null, pane: string | null): Promise<void> {
  await page.waitForURL(
    (url) => url.pathname.endsWith("/organization") && url.searchParams.get("tab") === "people" && url.searchParams.get("user") === user && url.searchParams.get("pane") === pane && !url.searchParams.has("settings"),
    { timeout: 20_000 }
  );
}

// The region the person scrolls in: beside the list at a desk's width, over it on a phone.
function region(page: Page, width: number): Locator {
  return width >= 1024 ? page.locator("[data-roster-person-region]") : page.locator("[data-roster-person-sheet] > div");
}

// One of this file's people found by the list's search and chosen.
async function find(page: Page, user: string, words = "person-tabs-"): Promise<void> {
  await page.locator("[data-roster-search]").locator("xpath=descendant-or-self::input").fill(words);

  const row = page.locator(`[data-roster-row="${user}"]`);

  await row.waitFor({ timeout: 20_000 });
  await row.click();
}

// An element's ground at rest, under the pointer and pressed, the press let go away from it so it opens nothing.
async function grounds(page: Page, target: Locator): Promise<{ rest: string; hover: string; press: string }> {
  const read = async (): Promise<string> => await target.evaluate((one) => getComputedStyle(one).backgroundColor);

  await page.mouse.move(0, 0);

  const rest = await read();

  await target.hover();

  const hover = await read();

  await page.mouse.down();

  const press = await read();

  await page.mouse.move(0, 0);
  await page.mouse.up();

  return { rest, hover, press };
}

describe.skipIf(!origin || !touchReady())("one person's tabs on the people tab", () => {
  for (const [width, height] of [[1280, 900], [360, 780]] as const) {
    test(`the administrator's, at ${width}px`, async () => {
      const context = await contextFor(ADMINISTRATOR.name, width, height);

      try {
        const page = await context.newPage();

        // A link to the person's old permissions tab lands on the organisation's permissions tab with them open, and
        // their sections stand there.
        await page.goto(`${origin}/organization?tab=people&company=${company}&user=${subject}&pane=permissions`, { waitUntil: "load" });
        await page.waitForURL((url) => url.searchParams.get("tab") === "permissions" && url.searchParams.get("user") === subject, { timeout: 20_000 });

        const table = page.locator(`[data-org-permission-person="${subject}"] [data-permissions-table]`);

        await table.waitFor({ timeout: 20_000 });

        // A switch changed is saved as it is made, and stands so on the service; changed back, it stands as before.
        const first = table.locator('[role="switch"]').first();
        const before = (await first.getAttribute("aria-checked")) === "true";
        const held = async (): Promise<string> => JSON.stringify(await administer<unknown>(`/api/users/${subject}/sections`, "GET"));
        const stood = await held();

        for (const want of [!before, before]) {
          const saved = page.waitForResponse((answer) => answer.url().endsWith(`/api/users/${subject}/sections`) && answer.request().method() === "PUT");

          await first.click();
          expect((await saved).ok()).toBe(true);
          expect(await first.getAttribute("aria-checked")).toBe(String(want));
          expect((await held()) === stood).toBe(want === before);
        }

        // The person on the people tab, their tabs standing without the sections, read in a window short enough that their
        // account runs past the region.
        await page.goto(`${origin}/organization?tab=people&company=${company}&user=${subject}`, { waitUntil: "load" });
        await landed(page, subject, null);
        await standing(page);
        expect(await paneNames(page)).toEqual(ADMINISTRATOR_TABS.map((key) => wording(key)));
        await page.locator("[data-person-account]").first().waitFor({ timeout: 20_000 });
        await page.setViewportSize({ width, height: 320 });

        // The row stays at the top of the region once the head has scrolled away, its hairline from edge to edge.
        const scroller = region(page, width);
        const stuck = await scroller.evaluate((one) => {
          one.scrollTop = one.scrollHeight;

          const row = one.querySelector("[data-person-tabs]")!.getBoundingClientRect();
          const box = one.getBoundingClientRect();

          return { scrolled: one.scrollTop > 0, top: row.top - box.top, left: row.left - box.left, right: box.right - row.right - ((one as HTMLElement).offsetWidth - one.clientWidth) };
        });

        // The first tab's words start on the edge of the column the head and the tab's content stand in.
        const edges = await scroller.evaluate((one) => {
          const word = one.querySelector('[data-person-tabs] [role="tab"] [data-slot="label"]') ?? one.querySelector('[data-person-tabs] [role="tab"]')!;
          const range = document.createRange();

          range.selectNodeContents(word);

          return { word: range.getBoundingClientRect().left, head: one.querySelector("[data-roster-person] header")!.getBoundingClientRect().left, pane: one.querySelector("[data-person-pane]")!.getBoundingClientRect().left };
        });

        expect(Math.abs(edges.word - edges.pane)).toBeLessThanOrEqual(1);
        expect(Math.abs(edges.head - edges.pane)).toBeLessThanOrEqual(1);

        expect(stuck.scrolled).toBe(true);
        expect(Math.abs(stuck.top)).toBeLessThanOrEqual(1);
        expect(Math.abs(stuck.left)).toBeLessThanOrEqual(1);
        expect(Math.abs(stuck.right)).toBeLessThanOrEqual(1);
        await page.setViewportSize({ width, height });

        // Every tab opens with a step of the history, its key in the address, and stands at the top of what it shows,
        // the open tab in the row's view.
        for (const { key, label, shows } of [...PANES.slice(1), PANES[0]!]) {
          await paneRow(page).getByRole("tab", { name: wording(label), exact: true }).click();
          await landed(page, subject, key);
          await page.locator(shows).first().waitFor({ timeout: 20_000 });

          const laid = await scroller.evaluate((one) => {
            const row = one.querySelector("[data-person-tabs]")!.getBoundingClientRect();
            const pane = one.querySelector("[data-person-pane]")!.getBoundingClientRect();
            const list = one.querySelector('[data-person-tabs] [role="tablist"]')!.getBoundingClientRect();
            const open = one.querySelector('[data-person-tabs] [role="tab"][data-state="active"]')!.getBoundingClientRect();

            return { paneInView: pane.top >= row.bottom - 1 && pane.top < one.getBoundingClientRect().bottom, openInRow: open.left >= list.left - 0.5 && open.right <= list.right + 0.5 };
          });

          expect({ key, ...laid }).toEqual({ key, paneInView: true, openInRow: true });
        }

        // The back gesture walks back through the tabs.
        await page.goBack();
        await landed(page, subject, "activity");
        await opened(page, "roster.label.activity");

        // A tab stands in the address, so the page read again opens at it.
        await page.reload({ waitUntil: "load" });
        await standing(page);
        await opened(page, "roster.label.activity");

        // Another person chosen opens at the same tab.
        if (width < 1024) await page.locator("[data-roster-back]").click();
        await find(page, head);
        await landed(page, head, "activity");
        await opened(page, "roster.label.activity");

        // The settings dialog's old permissions key lands on the organisation's permissions tab.
        await page.goto(`${origin}/?settings=permissions`, { waitUntil: "load" });
        await page.waitForURL((url) => url.pathname.endsWith("/organization") && url.searchParams.get("tab") === "permissions" && !url.searchParams.has("settings"), { timeout: 20_000 });
        await standing(page);

        // Nothing runs past the screen's edge sideways.
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
      } finally {
        await context.close();
      }
    }, 120_000);

    for (const scheme of ["light", "dark"] as const) {
      test(`the activity tab's rows, at ${width}px in ${scheme}`, async () => {
        const context = await contextFor(ADMINISTRATOR.name, width, height, scheme);

        try {
          const page = await context.newPage();

          await page.goto(`${origin}/organization?tab=people&user=${subject}&pane=activity`, { waitUntil: "load" });
          await standing(page);

          // A room, an agent and a run, each a row that opens what it names; the session only reads.
          const rows = ["[data-roster-rooms] a", "[data-roster-agents] a", "[data-roster-runs] a"];

          for (const selector of rows) await page.locator(selector).first().waitFor({ timeout: 20_000 });
          await page.locator("[data-roster-sessions] li").first().waitFor({ timeout: 20_000 });

          for (const selector of rows) {
            const row = page.locator(selector).first();
            const seen = await grounds(page, row);
            // Two lines, nothing cut past the row's own box and nothing past the region's edge.
            const laid = await row.evaluate((one) => ({
              lines: one.querySelectorAll(":scope > span:last-child > span").length,
              spills: one.scrollWidth > one.clientWidth,
              inRegion: one.getBoundingClientRect().right <= (one.closest("[data-roster-person-region], [data-roster-person-sheet]") ?? document.body).getBoundingClientRect().right + 0.5
            }));

            expect({ selector, hover: seen.hover !== seen.rest, press: seen.press !== seen.rest, ...laid }).toEqual({ selector, hover: true, press: true, lines: 2, spills: false, inRegion: true });
          }

          // A line cut short reads whole in its tooltip; the session's road gives way before its room, at half the line.
          const agentLine = page.locator("[data-roster-agent-line]").first();
          const whole = await agentLine.evaluate((one) => ({ cut: one.scrollWidth > one.clientWidth, text: one.textContent?.trim() ?? "" }));

          if (whole.cut) {
            await agentLine.hover();
            expect(await page.locator('[role="tooltip"]').first().innerText({ timeout: 5_000 })).toBe(whole.text);
            await page.mouse.move(0, 0);
          }

          const road = await page.locator("[data-roster-sessions] li").first().evaluate((one) => {
            const line = one.lastElementChild!;

            return { road: line.lastElementChild!.getBoundingClientRect().width, line: line.getBoundingClientRect().width };
          });

          expect(road.road).toBeLessThanOrEqual(road.line / 2 + 0.5);

          // The keyboard rings a row, 2px wide.
          for (const selector of rows) {
            const row = page.locator(selector).first();

            await page.keyboard.press("Shift");
            await row.focus();

            const ring = await row.evaluate((one) => {
              const style = getComputedStyle(one);

              return { visible: one.matches(":focus-visible"), width: style.outlineStyle === "none" ? "" : style.outlineWidth };
            });

            expect({ selector, ...ring }).toEqual({ selector, visible: true, width: "2px" });
          }
        } finally {
          await context.close();
        }
      }, 120_000);
    }

    test(`a company head's, at ${width}px`, async () => {
      const context = await contextFor(HEAD.name, width, height);

      try {
        const page = await context.newPage();

        // The person's old permissions tab leads the head to the organisation's permissions tab with the person open, whose
        // sections a head sets within their own.
        await page.goto(`${origin}/organization?tab=people&company=${company}&user=${subject}&pane=permissions`, { waitUntil: "load" });
        await page.waitForURL((url) => url.searchParams.get("tab") === "permissions" && url.searchParams.get("user") === subject, { timeout: 20_000 });
        await page.locator(`[data-org-permission-person="${subject}"] [data-permissions-table]`).waitFor({ timeout: 20_000 });

        // A tab the head may not open is taken off the address, and the person opens at the account tab with no activity tab.
        await page.goto(`${origin}/organization?tab=people&company=${company}&user=${subject}&pane=activity`, { waitUntil: "load" });
        await landed(page, subject, null);
        await standing(page);
        expect(await paneNames(page)).toEqual(HEAD_TABS.map((key) => wording(key)));
        await opened(page, "settings.label.account");

        // The head marks the person left from the management menu, asked first; Back on the question leaves them as
        // they stood (docs/web.md, 「System and organisation」, the people tab).
        await page.locator("[data-roster-manage]").click();
        await page.getByRole("menuitem", { name: wording("organization.action.mark_left_confirm") }).click();
        const question = page.getByRole("alertdialog").or(page.getByRole("dialog")).filter({ hasText: wording("organization.title.mark_left") });

        await question.waitFor({ timeout: 20_000 });
        await page.goBack();
        await question.waitFor({ state: "detached", timeout: 20_000 });
        expect((await administer<{ state: string }>(`/api/organization/people/${encodeURIComponent(subject)}`, "GET")).state).not.toBe("left");
      } finally {
        await context.close();
      }
    }, 120_000);
  }
});
