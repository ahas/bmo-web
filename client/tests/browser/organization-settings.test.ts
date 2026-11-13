import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";

import type { Browser, BrowserContext, Locator, Page } from "playwright-core";

// The settings dialog holds what a person sets for themselves alone, and the organisation settings screen what is set
// for the whole deployment or for other people, a tab to a section; its units tab stands the units as a tree beside
// the unit chosen, the tree a bottom drawer on a narrow screen (docs/web.md, 「Settings」 and 「Organisation settings」).
// The tree opens and closes each branch in place, three levels deep, without choosing. Several people chosen at once,
// a run of them by Shift, move into another unit with their roles in one act after its preview, and a preview
// closed moves nobody. Each is read at a desk's width
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

const PERSONAL = ["settings.label.account", "settings.label.theme", "settings.label.palette"];
const ADMINISTRATOR_PERSONAL = [...PERSONAL, "settings.label.notifications", "settings.label.briefing"];
const MOVED = ["settings.label.invites", "settings.label.permissions", "settings.label.providers", "settings.label.secrets", "research.title.supervisor"];
const TABS = ["organization.label.chart", "settings.label.invites", "settings.label.permissions", "settings.label.providers", "settings.label.secrets"];

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

// The tabs of the organisation settings screen as its tab row names them.
async function tabNames(page: Page): Promise<string[]> {
  const row = page.locator(`[aria-label="${wording("organization.aria.tabs")}"]`);

  await row.waitFor({ timeout: 20_000 });

  return (await row.getByRole("tab").allInnerTexts()).map((one) => one.trim());
}

// Nothing on the page runs past the screen's edge sideways.
async function overflow(page: Page): Promise<number> {
  return await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

// The contrast an element's words are drawn at against the ground under them, each colour read back as the browser
// paints it and a translucent one laid over what stands beneath.
async function contrast(page: Page, selector: string): Promise<{ text: string; ratio: number }[]> {
  return await page.locator(selector).evaluateAll((elements) => {
    const canvas = document.createElement("canvas");
    const pen = canvas.getContext("2d", { willReadFrequently: true })!;

    canvas.width = canvas.height = 1;

    const painted = (colour: string): [number, number, number, number] => {
      pen.clearRect(0, 0, 1, 1);
      pen.fillStyle = colour;
      pen.fillRect(0, 0, 1, 1);

      const [r, g, b, a] = pen.getImageData(0, 0, 1, 1).data;

      return [r!, g!, b!, a! / 255];
    };
    const over = (top: [number, number, number, number], under: [number, number, number]): [number, number, number] =>
      [0, 1, 2].map((at) => top[at]! * top[3] + under[at]! * (1 - top[3])) as [number, number, number];
    const ground = (element: Element | null): [number, number, number] => {
      const layers: [number, number, number, number][] = [];

      for (let one = element; one !== null; one = one.parentElement) {
        const layer = painted(getComputedStyle(one).backgroundColor);

        if (layer[3] > 0) layers.push(layer);
        if (layer[3] === 1) break;
      }

      return layers.reverse().reduce<[number, number, number]>((under, layer) => over(layer, under), [255, 255, 255]);
    };
    const light = (rgb: [number, number, number]): number => {
      const [r, g, b] = rgb.map((value) => {
        const channel = value / 255;

        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });

      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };

    return elements
      .filter((element) => (element as HTMLElement).innerText.trim() !== "")
      .map((element) => {
        const under = ground(element);
        const words = over(painted(getComputedStyle(element).color), under);
        const [high, low] = [light(words), light(under)].sort((a, b) => b - a);

        return { text: (element as HTMLElement).innerText.trim(), ratio: Math.round(((high! + 0.05) / (low! + 0.05)) * 100) / 100 };
      });
  });
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

        expect(new Set(heights).size).toBe(1);
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

    for (const scheme of ["light", "dark"] as const) {
      test(`the administrator's, at ${width}px in ${scheme}`, async () => {
        const context = await contextFor(ADMINISTRATOR.name, width, height, scheme);

        try {
          const page = await context.newPage();

          expect(await dialogSections(page, "/")).toEqual(ADMINISTRATOR_PERSONAL.map((key) => wording(key)));

          // The console search finds each tab of the screen, and choosing one lands on it.
          if (width >= 1024) {
            await page.keyboard.press("Escape");
            await page.getByRole("dialog").first().waitFor({ state: "hidden", timeout: 10_000 });
            await page.keyboard.press("Control+K");
            await page.keyboard.type(wording("settings.label.secrets"));

            const hit = page.getByRole("option", { name: new RegExp(wording("settings.label.secrets")) }).first();

            await hit.waitFor({ timeout: 10_000 });
            await hit.click();
            await page.waitForURL((url) => url.pathname.endsWith("/organization") && url.searchParams.get("tab") === "secrets", { timeout: 10_000 });
          }

          // A link made before a section moved lands on its tab.
          await page.goto(`${origin}/?settings=providers`, { waitUntil: "load" });
          await page.waitForURL((url) => url.pathname.endsWith("/organization") && url.searchParams.get("tab") === "providers", { timeout: 20_000 });
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
          expect(await tabNames(page)).toEqual([wording("settings.label.invites")]);

          // A head asks for a link into their unit from the tab row's add and its dialog, and the service
          // takes the ask as theirs: a link stands among the open ones, or, where the deployment names no machine hub
          // to bind the new account to, the service's refusal says so in the pack's words rather than that they may
          // not invite.
          const drop = page.getByRole("button", { name: wording("invites.action.drop"), exact: true });
          const open = await drop.count();
          const create = page.getByRole("button", { name: wording("invites.label.make"), exact: true });

          await create.and(page.locator(":enabled")).waitFor({ timeout: 10_000 });
          await create.click();
          await page.getByRole("button", { name: wording("invites.action.make"), exact: true }).click();

          const answered = await page.waitForFunction(
            ([name, before, refusal]) => {
              const made = [...document.querySelectorAll("button")].filter((one) => one.textContent?.trim() === name).length === before + 1;
              const refused = document.querySelector('[role="alert"]')?.textContent?.trim() === refusal;

              return made ? "made" : refused ? "refused" : false;
            },
            [wording("invites.action.drop"), open, wording("invites.error.no_hub")] as const,
            { timeout: 10_000 }
          );

          if ((await answered.jsonValue()) === "made") {
            await drop.last().click();
            await page.waitForFunction(([name, before]) => [...document.querySelectorAll("button")].filter((one) => one.textContent?.trim() === name).length === before, [wording("invites.action.drop"), open] as const, { timeout: 10_000 });
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
