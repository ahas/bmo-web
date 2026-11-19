import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { contrast } from "./contrast";
import { centre } from "./row-carry";
import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";

import type { Browser, BrowserContext, Locator, Page } from "playwright-core";

// The settings dialog holds what a person sets for themselves alone, the organisation screen the organisation and the
// people in it, and the administrator's screen what is set for the platform itself, each screen a tab to a section;
// the organisation's units tab stands the units as a tree beside the unit chosen, the tree a bottom drawer on a narrow
// screen (docs/web.md, 「Settings」, 「Organisation」 and 「Administration」).
// The tree opens and closes each branch in place, three levels deep, without choosing. Several people chosen at once,
// a run of them by Shift, move into another unit with their roles in one act after its preview, and a preview
// closed moves nobody. The tree and the unit chosen are regions of their own behind a splitter, every name and path
// whole, and every other tab stands in a reading column centred in the body. Each is read at a desk's width
// and a phone's, in light and in dark, by the administrator and by a member who heads
// a unit and one who heads none.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ADMINISTRATOR = { name: "org-settings", password: "fixture-password-2666" };
const MEMBER = { name: "org-member", password: "fixture-password-2667" };
// The people moved together, who stand in the console's fixture and never sign in.
const MOVERS = ["org-move-a", "org-move-b", "org-move-c"];
const RUN = Date.now().toString(36);

const PERSONAL = ["settings.label.account", "settings.label.secrets", "settings.label.supply", "settings.label.theme", "settings.label.palette"];
const ADMINISTRATOR_PERSONAL = [...PERSONAL, "settings.label.notifications", "settings.label.briefing"];
const MOVED = ["settings.label.invites", "settings.label.permissions", "settings.label.providers", "secrets.label.kinds", "research.title.supervisor"];
const TABS = ["organization.label.chart", "roster.label.tab", "catalogue.label.tab", "settings.label.invites", "settings.label.bmo", "supply.label.tab"];
const ADMIN_TABS = ["settings.label.providers", "secrets.label.kinds", "supply.label.plans", "supply.label.credits"];

let browser: Browser | null = null;
const cookies = new Map<string, string>();
let company = 0;
let team = 0;
let part = 0;
let member = "";

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
  cookies.set(MEMBER.name, await login(MEMBER));

  // A company, a team under it and a part under the team, named for this run, with the member standing in the team.
  company = (await administer<{ id: number }>("/api/organization/units", "POST", { name: `company-${RUN}`, parent: null })).id;
  team = (await administer<{ id: number }>("/api/organization/units", "POST", { name: `team-${RUN}`, parent: company })).id;
  part = (await administer<{ id: number }>("/api/organization/units", "POST", { name: `part-${RUN}`, parent: team })).id;
  member = (await administer<{ user: string; name: string }[]>("/api/users", "GET")).find((one) => one.name === MEMBER.name)!.user;
  await administer(`/api/organization/users/${encodeURIComponent(member)}/unit`, "PUT", { unit: team });

  browser = await chromium.launch();
}, BROWSER_HOOK_MS);

afterAll(async () => {
  if (member !== "" && team !== 0) await administer(`/api/organization/units/${team}/heads/${encodeURIComponent(member)}`, "DELETE").catch(() => null);
  await browser?.close();
}, BROWSER_HOOK_MS);

async function contextFor(account: string, width: number, height: number, scheme: "light" | "dark"): Promise<BrowserContext> {
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

// The section names the settings dialog lists, opened at its account section over the reader's home.
async function dialogSections(page: Page, home: string): Promise<string[]> {
  await page.goto(`${origin}${home}?settings=account`, { waitUntil: "load" });
  await standing(page);

  // On a phone the address goes into the section, over the list; its back arrow returns to the list.
  const back = page.getByRole("button", { name: wording("settings.action.back"), exact: true });

  if (await back.waitFor({ timeout: 5_000 }).then(() => true, () => false)) await back.click();

  const dialog = page.getByRole("dialog").first();

  await dialog.waitFor({ timeout: 20_000 });
  await dialog.getByText(wording("settings.label.account"), { exact: true }).first().waitFor({ timeout: 10_000 });

  const named = [...ADMINISTRATOR_PERSONAL, ...MOVED].map((key) => wording(key));
  const shown: string[] = [];

  for (const name of named) {
    if ((await dialog.getByRole("link", { name, exact: true }).or(dialog.getByRole("button", { name, exact: true })).count()) > 0) shown.push(name);
  }

  return shown;
}

// The tabs of a screen as its tab row names them, the organisation screen's where no row is named.
async function tabNames(page: Page, rowLabel = "organization.aria.tabs"): Promise<string[]> {
  const row = page.locator(`[aria-label="${wording(rowLabel)}"]`);

  await row.waitFor({ timeout: 20_000 });

  return (await row.getByRole("tab").allInnerTexts()).map((one) => one.trim());
}

// Nothing on the page runs past the screen's edge sideways.
async function overflow(page: Page): Promise<number> {
  return await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

// An element's ground at rest, under the pointer and pressed.
async function grounds(page: Page, selector: string): Promise<{ rest: string; hover: string; press: string }> {
  const target = page.locator(selector).first();
  const read = async (): Promise<string> => await target.evaluate((one) => getComputedStyle(one).backgroundColor);

  await page.mouse.move(0, 0);

  const rest = await read();

  await target.hover();

  const hover = await read();

  await page.mouse.down();

  const press = await read();

  // Let go away from it, so the press is no click and opens nothing.
  await page.mouse.move(0, 0);
  await page.mouse.up();

  return { rest, hover, press };
}

// Whether an element reached by the keyboard draws a ring.
async function ringed(page: Page, selector: string): Promise<{ visible: boolean; ring: string }> {
  const target = page.locator(selector).first();

  await page.keyboard.press("Shift");
  await target.focus();

  return await target.evaluate((one) => {
    const style = getComputedStyle(one);
    const outline = (from: CSSStyleDeclaration): string => (from.outlineStyle === "none" ? "" : `${from.outlineWidth} ${from.outlineStyle} ${from.outlineColor}`);
    // A link the library rings on a pseudo-element in its place draws the console's ring there.
    const drawn = [style, getComputedStyle(one, "::before"), getComputedStyle(one, "::after")].map(outline).find((ring) => ring !== "");

    return { visible: one.matches(":focus-visible"), ring: drawn ?? (style.boxShadow === "none" ? "" : style.boxShadow) };
  });
}

// The units tab's tree where it stands: beside the unit at a desk's width, in its drawer on a phone.
async function unitTree(page: Page, width: number): Promise<Locator> {
  if (width >= 1024) return page.locator("[data-unit-tree]");

  await page.locator("[data-unit-tree-open]").click();

  const drawer = page.getByRole("dialog").last();

  await drawer.waitFor({ timeout: 10_000 });

  return drawer;
}

// The names of the units the tree shows of this run's, with their depth.
async function shownUnits(tree: Locator): Promise<string[]> {
  return tree
    .locator('[role="treeitem"]')
    .evaluateAll((rows, run) => rows.filter((row) => row.textContent?.includes(`-${run}`)).map((row) => `${row.getAttribute("aria-level")}:${row.textContent?.trim()}`), RUN);
}

describe.skipIf(!origin || !touchReady())("the settings dialog and the organisation settings screen", () => {
  for (const [width, height] of [[1280, 900], [360, 780]] as const) {
    test(`the units' tree opens and closes three levels in place, at ${width}px`, async () => {
      const context = await contextFor(ADMINISTRATOR.name, width, height, "light");
      const [first, second, third] = [`1:company-${RUN}`, `2:team-${RUN}`, `3:part-${RUN}`];

      try {
        const page = await context.newPage();

        // At first the company stands open and the team under it closed.
        await page.goto(`${origin}/organization?unit=${company}`, { waitUntil: "load" });
        await standing(page);
        await page.locator(`[data-unit-chosen="${company}"]`).waitFor({ timeout: 20_000 });

        const tree = await unitTree(page, width);
        const row = (name: string) => tree.locator('[role="treeitem"]', { hasText: `${name}-${RUN}` });
        const toggle = (name: string) => row(name).locator("[data-unit-branch-toggle]");

        expect(await shownUnits(tree)).toEqual([first, second]);
        expect(await row("part").count()).toBe(0);
        expect(await toggle("team").getAttribute("aria-label")).toBe(wording("organization.action.expand"));

        // The team's chevron opens the third level without choosing the team, and the drawer stays open.
        await toggle("team").click();
        await row("part").waitFor({ timeout: 10_000 });
        expect(await shownUnits(tree)).toEqual([first, second, third]);
        expect(await toggle("team").getAttribute("aria-label")).toBe(wording("organization.action.collapse"));
        expect(new URL(page.url()).searchParams.get("unit")).toBe(String(company));
        expect(await row("part").locator("[data-unit-branch-toggle]").count()).toBe(0);

        // A branch's chevron makes its row no taller than a unit's with none, and each level stands further in.
        const boxes = await Promise.all(["company", "team", "part"].map(async (name) => (await row(name).locator('[data-slot="linkLabel"]').boundingBox())!));
        const heights = await Promise.all(["company", "team", "part"].map(async (name) => (await row(name).boundingBox())!.height));

        // The same height to within half a pixel: the layout measures on fractional device pixels, so a
        // sub-pixel difference is the same row, not one re-laid out.
        expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(0.5);
        expect(boxes[0]!.x).toBeLessThan(boxes[1]!.x);
        expect(boxes[1]!.x).toBeLessThan(boxes[2]!.x);

        // The company's chevron closes both levels under it, and opening it again shows them as they were left.
        await toggle("company").click();
        await row("team").waitFor({ state: "detached", timeout: 10_000 });
        expect(await shownUnits(tree)).toEqual([first]);
        await toggle("company").click();
        await row("part").waitFor({ timeout: 10_000 });
        expect(await shownUnits(tree)).toEqual([first, second, third]);

        // A press on a unit with units under it chooses it and leaves its branch open.
        await row("team").getByText(`team-${RUN}`, { exact: true }).click();
        await page.waitForURL((url) => url.searchParams.get("unit") === String(team), { timeout: 10_000 });
        await page.locator(`[data-unit-chosen="${team}"]`).waitFor({ timeout: 10_000 });

        const again = await unitTree(page, width);

        expect(await shownUnits(again)).toEqual([first, second, third]);

        // A link to the third level opens the branches down to it.
        await page.goto(`${origin}/organization?unit=${part}`, { waitUntil: "load" });
        await standing(page);
        await page.locator(`[data-unit-chosen="${part}"]`).waitFor({ timeout: 20_000 });
        expect(await page.locator(`[data-unit-chosen="${part}"]`).innerText()).toContain(`company-${RUN} › team-${RUN}`);
        expect(await shownUnits(await unitTree(page, width))).toEqual([first, second, third]);
      } finally {
        await context.close();
      }
    }, 120_000);

    test(`the screen's regions and its reading column, at ${width}px`, async () => {
      // A unit of a company of its own, its name and its path longer than a phone's line and than the tree's region.
      const words = "a-long-unit-name-that-runs-past-the-region";
      const top = (await administer<{ id: number }>("/api/organization/units", "POST", { name: `regions_${RUN} first step of the path`, parent: null })).id;
      const middle = (await administer<{ id: number }>("/api/organization/units", "POST", { name: `second step of the path ${RUN}`, parent: top })).id;
      const deep = (await administer<{ id: number }>("/api/organization/units", "POST", { name: `${words}_${RUN}`, parent: middle })).id;
      // One person standing in it and heading it, so both its lists hold a row.
      const person = (await administer<{ user: string; name: string }[]>("/api/users", "GET")).find((one) => one.name === MOVERS[0])!.user;

      await administer(`/api/organization/users/${encodeURIComponent(person)}/unit`, "PUT", { unit: deep });
      await administer(`/api/organization/units/${deep}/heads/${encodeURIComponent(person)}`, "PUT");
      const context = await contextFor(ADMINISTRATOR.name, width, height, "light");

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/organization?unit=${deep}`, { waitUntil: "load" });
        await standing(page);

        const chosen = page.locator(`[data-unit-chosen="${deep}"]`);

        await chosen.waitFor({ timeout: 20_000 });

        const shape = await page.evaluate(() => {
          const box = (selector: string) => document.querySelector(selector)?.getBoundingClientRect() ?? null;
          const cut = (element: Element | null) => element !== null && (element as HTMLElement).scrollWidth > (element as HTMLElement).clientWidth;
          const tree = document.querySelector<HTMLElement>("[data-unit-tree]");
          const unit = document.querySelector<HTMLElement>("[data-unit-scroll]")!;

          return {
            tree: box("[data-unit-tree]"),
            handle: box("#organization-splitter-handle-0"),
            unit: box("[data-unit-scroll]"),
            unitScrolls: getComputedStyle(unit).overflowY,
            treeScrolls: tree === null ? null : getComputedStyle(tree).overflowX,
            treeWider: tree === null ? null : tree.scrollWidth > tree.clientWidth,
            cutNames: [...document.querySelectorAll('[data-unit-tree] [data-slot="linkLabel"]')].filter(cut).length,
            pathCut: cut(document.querySelector("[data-unit-path]")),
            pathLines: Math.round(box("[data-unit-path]")!.height / parseFloat(getComputedStyle(document.querySelector("[data-unit-path]")!).lineHeight)),
            name: box("[data-unit-chosen] h2, [data-unit-tree-open]"),
            edit: box("[data-unit-edit]"),
            heading: box("[data-unit-chosen] h3"),
            addHead: box("[data-unit-add-head]"),
            // A row's own height, its hairline above it left out.
            rows: ["[data-unit-head]", "[data-unit-member]"].map((selector) => {
              const row = document.querySelector(selector)!;

              return row.getBoundingClientRect().height - parseFloat(getComputedStyle(row).borderTopWidth);
            })
          };
        });

        // The path stands whole, wrapping on a phone; the name takes its own row, and the edit button the row under it.
        expect(shape.pathCut).toBe(false);
        if (width < 1024) expect(shape.pathLines).toBeGreaterThan(1);
        expect(shape.edit!.top).toBeGreaterThanOrEqual(shape.name!.bottom);
        expect(Math.abs(shape.edit!.right - shape.unit!.right + 16)).toBeLessThanOrEqual(1);

        // A head's row and a person's row stand at one height.
        expect(shape.rows[0]).toBe(shape.rows[1]);

        // The heads' picker stands at its heading's right end, on the heading's centre line.
        expect(Math.abs(shape.addHead!.top + shape.addHead!.height / 2 - (shape.heading!.top + shape.heading!.height / 2))).toBeLessThanOrEqual(1);

        if (width >= 1024) {
          // Two regions meeting the splitter's one-pixel line, each scrolling on its own; the tree's names whole, the
          // tree scrolling sideways where it is wider than its region.
          expect(shape.handle!.width).toBe(1);
          expect(Math.abs(shape.tree!.right - shape.handle!.left)).toBeLessThanOrEqual(0.5);
          expect(Math.abs(shape.unit!.left - shape.handle!.right)).toBeLessThanOrEqual(0.5);
          expect({ unit: shape.unitScrolls, tree: shape.treeScrolls }).toEqual({ unit: "auto", tree: "auto" });
          expect(shape.cutNames).toBe(0);
          expect(shape.treeWider).toBe(true);
        } else {
          expect(shape.tree).toBeNull();
        }

        // On a phone the unit's name, cut short by the button that opens the tree, reads whole in its tooltip.
        if (width < 1024) {
          const name = page.locator("[data-unit-name]");

          expect(await name.evaluate((one) => one.scrollWidth > one.clientWidth)).toBe(true);
          await name.hover();
          expect(await page.locator('[role="tooltip"]').first().innerText({ timeout: 5_000 })).toBe(`${words}_${RUN}`);
          await page.mouse.move(0, 0);
        }

        // A first read refused says why in the tab's place, and its refresh button spins while the read is asked again.
        let refused = true;

        await page.route(/\/api\/invites$/, async (route) => {
          if (refused) return await route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
          await new Promise((resolve) => setTimeout(resolve, 1_000));
          await route.continue().catch(() => undefined);
        });
        await page.goto(`${origin}/organization?tab=invites`, { waitUntil: "load" });
        await standing(page);

        const retry = page.locator("[data-organization-body]").getByRole("button", { name: wording("common.action.refresh"), exact: true });

        await retry.waitFor({ timeout: 20_000 });
        expect(await retry.locator("xpath=..").locator('[data-slot="description"]').innerText()).toBe(wording("invites.error.failed"));
        refused = false;
        await retry.click();
        await retry.locator(".animate-spin").waitFor({ timeout: 5_000 });
        await retry.waitFor({ state: "detached", timeout: 15_000 });
        await page.unroute(/\/api\/invites$/);

        // Every other tab stands in a reading column centred in the body: 768px of content at most, the body's 16px
        // padding on every side outside it; the administrator's screen lays its tabs out the same way.
        const columned = [
          { tab: "invites", path: "/organization?tab=invites", screen: "organization" },
          { tab: "providers", path: "/admin", screen: "admin" },
          { tab: "secret-kinds", path: "/admin?tab=secret-kinds", screen: "admin" }
        ];

        for (const { tab, path, screen } of columned) {
          await page.goto(`${origin}${path}`, { waitUntil: "load" });
          await standing(page);

          const column = page.locator(`[data-${screen}-column]`);

          await column.waitFor({ timeout: 20_000 });

          const laid = await page.evaluate((screen) => {
            const body = document.querySelector<HTMLElement>(`[data-${screen}-body]`)!;
            const style = getComputedStyle(body);
            const outer = body.getBoundingClientRect();
            const inner = document.querySelector(`[data-${screen}-column]`)!.getBoundingClientRect();
            const row = document.querySelector('[role="tablist"]')!.getBoundingClientRect();
            const open = document.querySelector('[role="tablist"] [role="tab"][data-state="active"]')!.getBoundingClientRect();

            return {
              padding: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft],
              width: inner.width,
              room: outer.width - 32,
              sides: [inner.left - outer.left, outer.right - inner.right],
              openInRow: open.left >= row.left - 0.5 && open.right <= row.right + 0.5
            };
          }, screen);

          expect({ tab, padding: laid.padding }).toEqual({ tab, padding: ["16px", "16px", "16px", "16px"] });
          expect(laid.width).toBe(Math.min(768, laid.room));
          expect(Math.abs(laid.sides[0]! - laid.sides[1]!)).toBeLessThanOrEqual(1);
          // The open tab stands in the row's view, on a phone where the row scrolls sideways.
          expect({ tab, openInRow: laid.openInRow }).toEqual({ tab, openInRow: true });
        }

        expect(await overflow(page)).toBeLessThanOrEqual(0);
      } finally {
        await context.close();
      }
    }, 120_000);

    // The server draws the page before it knows the reader heads a company, so the tab asked for is drawn only once
    // who reads is known, and the page then holds that tab alone (docs/web.md, 「Organisation」).
    test(`a company head opening the roles and kinds tab by its address finds that tab alone, at ${width}px`, async () => {
      await administer(`/api/organization/units/${company}/heads/${encodeURIComponent(member)}`, "PUT");

      const context = await contextFor(MEMBER.name, width, height, "light");
      const column = (page: Page) => page.locator("[data-organization-column]");

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/organization?tab=catalogue`, { waitUntil: "load" });

        for (const pass of ["opened", "reloaded"]) {
          if (pass === "reloaded") await page.reload({ waitUntil: "load" });

          await standing(page);
          await column(page).getByText(wording("catalogue.label.kinds"), { exact: true }).waitFor({ timeout: 20_000 });
          // A head of a company manages that company's supply, so the supply tab stands for them too (docs/web.md,
          // 「Organisation」, the supply tab).
          expect({ pass, tabs: await tabNames(page) }).toEqual({ pass, tabs: ["roster.label.tab", "catalogue.label.tab", "settings.label.invites", "settings.label.bmo", "supply.label.tab"].map((key) => wording(key)) });
          expect(await page.locator('[role="tab"][aria-selected="true"]').allInnerTexts()).toEqual([wording("catalogue.label.tab")]);

          // The row's underline stands under the chosen tab, though a tab came in before it once the head was known.
          const chosen = (await page.locator('[role="tab"][aria-selected="true"]').boundingBox())!;

          await page.waitForFunction(
            (left) => Math.abs((document.querySelector('[data-slot="indicator"]')?.getBoundingClientRect().left ?? -1) - left) <= 1,
            chosen.x,
            { timeout: 10_000 }
          );
          expect({ pass, invites: await column(page).getByText(wording("invites.label.open"), { exact: true }).count() }).toEqual({ pass, invites: 0 });
        }

        // With no tab named, the first the head opens stands once they are known, and stays as it reads the roster again.
        await page.goto(`${origin}/organization`, { waitUntil: "load" });
        await standing(page);
        await page.locator("[data-roster-search]").waitFor({ timeout: 20_000 });
        expect(await page.locator("[data-organization-waiting]").count()).toBe(0);
        expect(await page.locator('[role="tab"][aria-selected="true"]').allInnerTexts()).toEqual([wording("roster.label.tab")]);
      } finally {
        await context.close();
        await administer(`/api/organization/units/${company}/heads/${encodeURIComponent(member)}`, "DELETE").catch(() => null);
      }
    }, 120_000);

    for (const scheme of ["light", "dark"] as const) {
      test(`the administrator's, at ${width}px in ${scheme}`, async () => {
        const context = await contextFor(ADMINISTRATOR.name, width, height, scheme);

        try {
          const page = await context.newPage();

          expect(await dialogSections(page, "/")).toEqual(ADMINISTRATOR_PERSONAL.map((key) => wording(key)));

          // The console search finds each tab of a screen, and choosing one lands on it.
          if (width >= 1024) {
            await page.keyboard.press("Escape");
            await page.getByRole("dialog").first().waitFor({ state: "hidden", timeout: 10_000 });
            await page.keyboard.press("Control+K");
            await page.keyboard.type(wording("secrets.label.kinds"));

            const hit = page.getByRole("option", { name: new RegExp(wording("secrets.label.kinds")) }).first();

            await hit.waitFor({ timeout: 10_000 });
            await hit.click();
            await page.waitForURL((url) => url.pathname.endsWith("/admin") && url.searchParams.get("tab") === "secret-kinds", { timeout: 10_000 });
          }

          // A link made before the providers and the secret kinds moved to the administrator's screen lands on the same
          // tab there, whether it names the organisation screen's old tab or a settings key; the providers are its
          // first tab, the screen's own address.
          const onAdmin = (tab: string | null) => (url: URL) => url.pathname.endsWith("/admin") && url.searchParams.get("tab") === tab && !url.searchParams.has("settings");
          const movedToAdmin = [
            { old: "/organization?tab=providers", tab: null, label: "settings.label.providers" },
            { old: "/organization?tab=secret-kinds", tab: "secret-kinds", label: "secrets.label.kinds" },
            { old: "/?settings=providers", tab: null, label: "settings.label.providers" },
            { old: "/?settings=secret-kinds", tab: "secret-kinds", label: "secrets.label.kinds" }
          ];

          for (const { old, tab, label } of movedToAdmin) {
            await page.goto(`${origin}${old}`, { waitUntil: "load" });
            await page.waitForURL(onAdmin(tab), { timeout: 20_000 });
            expect(await tabNames(page, "admin.aria.tabs")).toEqual(ADMIN_TABS.map((key) => wording(key)));
            expect({ old, open: (await page.locator(`[aria-label="${wording("admin.aria.tabs")}"] [role="tab"][data-state="active"]`).innerText()).trim() }).toEqual({ old, open: wording(label) });
          }

          // The organisation screen keeps the chart, the people, the roles and kinds, the invitations, the BMO and,
          // for a reader who manages a unit's supply, the supply tab.
          await page.goto(`${origin}/organization`, { waitUntil: "load" });
          await standing(page);
          expect(await tabNames(page)).toEqual(TABS.map((key) => wording(key)));

          // The keys of the sections that moved away lead to where they stand now: the research supervisor on the
          // research screen's settings tab, the voice briefing section of the settings dialog over this screen.
          for (const old of [`${origin}/?settings=research`, `${origin}/organization?tab=research`]) {
            await page.goto(old, { waitUntil: "load" });
            await page.waitForURL((url) => url.pathname.endsWith("/research") && url.searchParams.get("tab") === "settings", { timeout: 20_000 });
            await page.locator("#research-supervisor-title").waitFor({ timeout: 20_000 });
          }

          await page.goto(`${origin}/organization?tab=briefing`, { waitUntil: "load" });
          await page.waitForURL((url) => url.pathname.endsWith("/organization") && !url.searchParams.has("tab") && !url.searchParams.has("settings"), { timeout: 20_000 });
          await page.getByRole("dialog").first().locator("[data-briefing-trial]").waitFor({ timeout: 20_000 });

          // The secrets' old tab leads to the reader's own secrets in the settings dialog.
          await page.goto(`${origin}/organization?tab=secrets`, { waitUntil: "load" });
          await page.waitForURL((url) => url.pathname.endsWith("/organization") && !url.searchParams.has("tab") && !url.searchParams.has("settings"), { timeout: 20_000 });
          await page.getByRole("dialog").first().locator("[data-secret-add]").waitFor({ timeout: 20_000 });

          // The units tab: the unit chosen by its address, its company above its name.
          await page.goto(`${origin}/organization?unit=${team}`, { waitUntil: "load" });
          await standing(page);

          const chosen = page.locator(`[data-unit-chosen="${team}"]`);

          await chosen.waitFor({ timeout: 20_000 });
          expect(await chosen.innerText()).toContain(`company-${RUN}`);
          expect(await chosen.locator("[data-unit-member]").allInnerTexts()).toContain(MEMBER.name);

          // Every icon button in it is named.
          const unnamed = await chosen.locator("button").evaluateAll((buttons) => buttons.filter((one) => one.textContent?.trim() === "" && !one.getAttribute("aria-label")).length);

          expect(unnamed).toBe(0);

          if (width >= 1024) {
            const tree = page.locator("[data-unit-tree]");

            expect(await tree.innerText()).toContain(`team-${RUN}`);
            await tree.getByText(`company-${RUN}`, { exact: true }).click();
          } else {
            expect(await page.locator("[data-unit-tree]").count()).toBe(0);
            await page.locator("[data-unit-tree-open]").click();

            const drawer = page.getByRole("dialog").last();

            await drawer.getByText(`company-${RUN}`, { exact: true }).click();
            await drawer.waitFor({ state: "hidden", timeout: 10_000 });
          }

          await page.waitForURL((url) => url.searchParams.get("unit") === String(company), { timeout: 10_000 });
          await page.locator(`[data-unit-chosen="${company}"]`).waitFor({ timeout: 10_000 });

          // On a phone the back gesture closes the tree's drawer and leaves the unit where it was.
          if (width < 1024) {
            await page.locator("[data-unit-tree-open]").click();

            const drawer = page.getByRole("dialog").last();

            await drawer.waitFor({ timeout: 10_000 });
            await page.goBack();
            await drawer.waitFor({ state: "hidden", timeout: 10_000 });
            expect(new URL(page.url()).searchParams.get("unit")).toBe(String(company));
          }

          // Back on the team: its words read at 4.5:1 or better on their ground, the tree's too where it stands.
          await page.goto(`${origin}/organization?unit=${team}`, { waitUntil: "load" });
          await standing(page);
          await chosen.waitFor({ timeout: 20_000 });

          const low = (await contrast(page, `[data-unit-chosen="${team}"] :is(h2, span, p, button, [data-slot="label"]), [data-unit-tree] [data-slot="linkLabel"], [aria-label="${wording("organization.aria.tabs")}"] [role="tab"]`)).filter((one) => one.ratio < 4.5);

          expect(low).toEqual([]);

          // The buttons this screen draws change on hover and on press, a person's checkbox cell among them, and the
          // keyboard rings them.
          for (const selector of ["[data-unit-edit]", `[data-unit-chosen="${team}"] [data-member-marks] button`, `[data-unit-chosen="${team}"] [data-member-check]`]) {
            const seen = await grounds(page, selector);

            expect({ selector, hover: seen.hover !== seen.rest, press: seen.press !== seen.rest }).toEqual({ selector, hover: true, press: true });
          }

          for (const selector of ["[data-unit-edit]", ...(width >= 1024 ? ["[data-unit-tree] [role=\"treeitem\"]"] : ["[data-unit-tree-open]"])]) {
            const focus = await ringed(page, selector);

            expect({ selector, visible: focus.visible, ringed: focus.ring !== "", width: focus.ring.startsWith("2px") || focus.ring.includes("0px 0px 0px 2px") }).toEqual({ selector, visible: true, ringed: true, width: true });
          }

          // A head taken away: the button that asked spins while the change is under way.
          await administer(`/api/organization/units/${team}/heads/${encodeURIComponent(member)}`, "PUT");
          await page.goto(`${origin}/organization?unit=${team}`, { waitUntil: "load" });
          await standing(page);

          let release: () => void = () => undefined;
          const held = new Promise<void>((resolve) => (release = resolve));

          await page.route(/\/api\/organization\/units\/\d+\/heads\//, async (route) => {
            await held;
            await route.continue();
          });

          const remove = page.locator(`[data-unit-chosen="${team}"] [data-unit-head] button`).first();

          await remove.click();
          await remove.locator(".animate-spin").waitFor({ timeout: 10_000 });
          release();
          await page.locator(`[data-unit-chosen="${team}"] [data-unit-head] button`).waitFor({ state: "detached", timeout: 10_000 });
          await page.unroute(/\/api\/organization\/units\/\d+\/heads\//);

          // The unit's form has one save, shut while nothing differs.
          await page.locator("[data-unit-edit]").click();

          const save = page.getByRole("dialog").last().getByRole("button", { name: wording("common.action.save"), exact: true });

          await save.waitFor({ timeout: 10_000 });
          expect(await save.isDisabled()).toBe(true);
          await page.keyboard.press("Escape");

          // The tab row keeps one line, and nothing runs past the screen's edge.
          const row = await page.locator(`[aria-label="${wording("organization.aria.tabs")}"]`).boundingBox();

          expect(row!.height).toBeLessThanOrEqual(48);
          expect(await overflow(page)).toBeLessThanOrEqual(0);
        } finally {
          await context.close();
        }
      }, 120_000);

      test(`a member's, heading a unit and heading none, at ${width}px in ${scheme}`, async () => {
        await administer(`/api/organization/units/${team}/heads/${encodeURIComponent(member)}`, "DELETE").catch(() => null);

        const context = await contextFor(MEMBER.name, width, height, scheme);

        try {
          const page = await context.newPage();

          expect(await dialogSections(page, "/rooms")).toEqual(PERSONAL.map((key) => wording(key)));

          const entry = page.locator('a[href$="/organization"]');

          if (width >= 1024) expect(await entry.count()).toBe(0);

          await administer(`/api/organization/units/${team}/heads/${encodeURIComponent(member)}`, "PUT");
          await page.goto(`${origin}/organization`, { waitUntil: "load" });
          await standing(page);
          expect(await tabNames(page)).toEqual([wording("settings.label.invites"), wording("settings.label.bmo")]);

          // A head asks for a link into their unit from the tab row's add and its dialog, and the service
          // takes the ask as theirs: a link stands among the open ones, or, where the deployment names no machine hub
          // to bind the new account to, the service's refusal says so in the pack's words rather than that they may
          // not invite.
          const drop = page.locator("[data-invite-drop]");

          await page.locator(`[aria-label="${wording("invites.status.loading")}"]`).waitFor({ state: "detached", timeout: 20_000 });

          const open = await drop.count();
          const create = page.getByRole("button", { name: wording("invites.label.make"), exact: true });

          await create.and(page.locator(":enabled")).waitFor({ timeout: 10_000 });
          await create.click();
          await page.getByRole("button", { name: wording("invites.action.make"), exact: true }).click();

          const answered = await page.waitForFunction(
            ([before, refusal]) => {
              const made = document.querySelectorAll("[data-invite-drop]").length === before + 1;
              const refused = document.querySelector('[role="alert"]')?.textContent?.trim() === refusal;

              return made ? "made" : refused ? "refused" : false;
            },
            [open, wording("invites.error.no_hub")] as const,
            { timeout: 10_000 }
          );

          if ((await answered.jsonValue()) === "made") {
            await drop.last().click();
            await page.waitForFunction((before) => document.querySelectorAll("[data-invite-drop]").length === before, open, { timeout: 10_000 });
          }

          if (width >= 1024) await entry.first().waitFor({ timeout: 20_000 });

          expect(await overflow(page)).toBeLessThanOrEqual(0);
        } finally {
          await context.close();
          await administer(`/api/organization/units/${team}/heads/${encodeURIComponent(member)}`, "DELETE").catch(() => null);
        }
      }, 120_000);
    }
  }

  test("people dragged onto a unit of the tree light it and open the move's preview there, and the move stands after a reload", async () => {
    // Two units of this run under the company, the three people standing in the first.
    const from = (await administer<{ id: number }>("/api/organization/units", "POST", { name: `drag-from-${RUN}`, parent: company })).id;
    const to = (await administer<{ id: number }>("/api/organization/units", "POST", { name: `drag-to-${RUN}`, parent: company })).id;
    const everyone = await administer<{ user: string; name: string }[]>("/api/users", "GET");
    const [first, second, third] = MOVERS.map((name) => everyone.find((one) => one.name === name)!.user);

    for (const user of [first!, second!, third!]) await administer(`/api/organization/users/${encodeURIComponent(user)}/unit`, "PUT", { unit: from });

    const unitRow = async (id: number) => (await administer<{ id: number; heads: string[]; members: string[] }[]>("/api/organization/units", "GET")).find((one) => one.id === id)!;
    const context = await contextFor(ADMINISTRATOR.name, 1280, 800, "light");

    try {
      const page = await context.newPage();

      await page.goto(`${origin}/organization?unit=${from}`, { waitUntil: "load" });
      await standing(page);

      const rowOf = (name: string) => page.locator("[data-unit-member]").filter({ hasText: name });
      const target = page.locator(`[data-unit-tree] [data-unit-drop="${to}"]`);
      const lit = async (unit: number) => (await page.locator(`[data-unit-tree] [data-unit-drop="${unit}"]`).getAttribute("class"))?.includes("ring-primary") ?? false;

      await rowOf(MOVERS[2]!).waitFor({ timeout: 20_000 });
      // The tree keeps every unit the console holds, so the one dropped on is brought into the tree's view first.
      await target.scrollIntoViewIfNeeded({ timeout: 10_000 });

      // The first two chosen, the second's row carried: over the unit it would land in, that unit stands lit, and
      // over the unit they stand in now, nothing is.
      await rowOf(MOVERS[0]!).locator("[data-member-check]").click();
      await rowOf(MOVERS[1]!).locator("[data-member-check]").click();

      const grip = await centre(rowOf(MOVERS[1]!).locator("[data-member-check] + *"));

      await page.mouse.move(grip.x, grip.y);
      await page.mouse.down();

      const home = await centre(page.locator(`[data-unit-tree] [data-unit-drop="${from}"]`));

      await page.mouse.move(home.x, home.y, { steps: 12 });
      expect(await lit(from)).toBe(false);

      const over = await centre(target);

      await page.mouse.move(over.x, over.y, { steps: 12 });
      await page.locator(`[data-unit-tree] [data-unit-drop="${to}"].ring-primary`).waitFor({ timeout: 5_000 });
      await page.mouse.up();
      expect(await lit(to)).toBe(false);

      // The drop opens the move at its preview, the unit dropped on as where they go and each staying a member.
      const dialog = page.getByRole("dialog").last();
      const rows = dialog.locator("[data-move-row]");

      await rows.nth(1).waitFor({ timeout: 10_000 });

      const said = await rows.allInnerTexts();

      expect(said).toHaveLength(2);
      for (const row of said) expect(row).toContain(`company-${RUN} › drag-from-${RUN} → company-${RUN} › drag-to-${RUN}`);
      expect(await unitRow(to)).toMatchObject({ members: [] });

      // Confirmed, the two move and the third stays; the screen loaded afresh shows each where they now stand.
      await dialog.locator("[data-move-apply]").click();
      await page.locator("[data-move-preview]").waitFor({ state: "detached", timeout: 10_000 });
      expect(await unitRow(to)).toMatchObject({ heads: [], members: [first, second] });
      expect(await unitRow(from)).toMatchObject({ heads: [], members: [third] });

      await page.reload({ waitUntil: "load" });
      await standing(page);
      await rowOf(MOVERS[2]!).waitFor({ timeout: 20_000 });
      expect(await page.locator("[data-unit-member]").count()).toBe(1);

      await page.goto(`${origin}/organization?unit=${to}`, { waitUntil: "load" });
      await standing(page);
      await rowOf(MOVERS[1]!).waitFor({ timeout: 20_000 });
      expect(await page.locator("[data-unit-member]").allInnerTexts()).toEqual([expect.stringContaining(MOVERS[0]!), expect.stringContaining(MOVERS[1]!)]);
    } finally {
      await context.close();
    }
  }, 120_000);

  for (const [width, height] of [[1280, 800], [360, 780]] as const) {
    test(`several people move into another unit with their roles in one confirmed act, at ${width}px`, async () => {
      // Two units of this run and width, the three people standing in the first, the first of them its head.
      const from = (await administer<{ id: number }>("/api/organization/units", "POST", { name: `from-${width}-${RUN}`, parent: company })).id;
      const to = (await administer<{ id: number }>("/api/organization/units", "POST", { name: `to-${width}-${RUN}`, parent: company })).id;
      const everyone = await administer<{ user: string; name: string }[]>("/api/users", "GET");
      const [first, second, third] = MOVERS.map((name) => everyone.find((one) => one.name === name)!.user);

      for (const user of [first!, second!, third!]) await administer(`/api/organization/users/${encodeURIComponent(user)}/unit`, "PUT", { unit: from });
      await administer(`/api/organization/units/${from}/heads/${encodeURIComponent(first!)}`, "PUT");

      const unitRow = async (id: number) => (await administer<{ id: number; heads: string[]; members: string[] }[]>("/api/organization/units", "GET")).find((one) => one.id === id)!;
      const context = await contextFor(ADMINISTRATOR.name, width, height, "light");

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/organization?unit=${from}`, { waitUntil: "load" });
        await standing(page);

        const rowOf = (name: string) => page.locator("[data-unit-member]").filter({ hasText: name });

        await rowOf(MOVERS[2]!).waitFor({ timeout: 20_000 });

        // The first pressed, the third pressed with Shift: the run of three is chosen.
        await rowOf(MOVERS[0]!).locator("[data-member-check]").click();
        await rowOf(MOVERS[2]!).locator("[data-member-check]").click({ modifiers: ["Shift"] });
        expect(await page.locator("[data-unit-chosen-count]").innerText()).toBe(wording("organization.label.chosen", { count: "3" }));

        // The unit they go to and the second made its head, then who goes where, shown before anything is written.
        const preview = async (): Promise<void> => {
          await page.locator("[data-unit-move]").click();

          const dialog = page.getByRole("dialog").last();

          await dialog.locator("[data-move-to]").click();
          await page.getByRole("option", { name: `company-${RUN} › to-${width}-${RUN}`, exact: true }).click();
          await dialog.locator("[data-move-person]").filter({ hasText: MOVERS[1]! }).locator("[data-move-role]").click();
          await page.getByRole("option", { name: wording("organization.label.role_head"), exact: true }).click();
          await dialog.locator("[data-move-preview-open]").click();
          await dialog.locator("[data-move-row]").nth(2).waitFor({ timeout: 10_000 });
        };

        await preview();

        const rows = page.getByRole("dialog").last().locator("[data-move-row]");
        const said = await rows.allInnerTexts();

        expect(said).toHaveLength(3);
        for (const row of said) expect(row).toContain(`company-${RUN} › from-${width}-${RUN} → company-${RUN} › to-${width}-${RUN}`);
        expect(said[0]).toContain(wording("organization.label.head_dropped", { unit: `from-${width}-${RUN}` }));
        expect(said[0]).toContain(`${wording("organization.label.role_head")} → ${wording("organization.label.role_member")}`);
        expect(said[1]).toContain(`${wording("organization.label.role_member")} → ${wording("organization.label.role_head")}`);
        expect((await contrast(page, "[data-move-row] > span, [data-unit-chosen-count]")).filter((one) => one.ratio < 4.5)).toEqual([]);
        expect(await overflow(page)).toBeLessThanOrEqual(0);

        // Closed at the preview, the move writes nothing.
        await page.getByRole("dialog").last().locator("[data-move-cancel]").click();
        await page.getByRole("button", { name: wording("common.action.discard"), exact: true }).click();
        await page.locator("[data-move-preview]").waitFor({ state: "detached", timeout: 10_000 });
        expect(await unitRow(from)).toMatchObject({ heads: [first], members: [first, second, third] });
        expect(await unitRow(to)).toMatchObject({ heads: [], members: [] });

        // Confirmed, the three move in one act, the second as the head and the first no longer heading the unit left.
        await preview();
        await page.getByRole("dialog").last().locator("[data-move-apply]").click();
        await page.locator("[data-move-preview]").waitFor({ state: "detached", timeout: 10_000 });
        await page.locator("[data-unit-member]").first().waitFor({ state: "detached", timeout: 10_000 });
        expect(await unitRow(to)).toMatchObject({ heads: [second], members: [first, second, third] });
        expect(await unitRow(from)).toMatchObject({ heads: [], members: [] });
        expect(await overflow(page)).toBeLessThanOrEqual(0);
      } finally {
        await context.close();
      }
    }, 120_000);
  }
});
