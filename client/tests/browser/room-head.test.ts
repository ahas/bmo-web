import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";
import { UNREAD_ROOM } from "../support/unread-room";

import type { Browser, BrowserContext, Page } from "playwright-core";

// The room's head: the menu button's own box stands 8px from the end of the room's name, the gap every heading row
// keeps between its title and its button (docs/web.md, the room screen's measures, 「Picture, name and menu」), and the
// note a call waiting in the room was set with stands in its original with its translation in its place (docs/web.md,
// the room screen's list of what waits and 「The original, and its translation in its place」). Each is read at a
// desk's width and a phone's, in the light theme and the dark. A group room carrying every button of its own — the
// menu, the waiting calls, the pinned button and the window's time left — while a deployment runs stands them on the
// bar's one line beside a name still read, the time left last of them. The bar folds by its own width (docs/web.md,
// 「The title bar」): on a short one, a phone's or a 1280px window's beside the docked TODO panel, the time left is a
// button whose popover holds it, the pinned button folds into the menu and the set's words fold into its squares, the
// name keeping 40px or more; on a phone the waiting calls fold into the menu too (docs/web.md, 「The window's time left
// stands in the top bar」).
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up, and serves
// the room's waiting calls and the translator through the page's own routes.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "room-head", password: "fixture-password-3051" };
const CHAT = 42;
// A room that is not the owner's own, so the chat agent's window there is counted in its bar.
const GROUP_CHAT = UNREAD_ROOM;
const NOTE = "Check the nightly build and report what failed.";
const READING = "Nightly build checked, failures reported.";
const WIDTHS = [
  { width: 1280, height: 900, phone: false },
  { width: 360, height: 780, phone: true }
] as const;
const SCHEMES = ["light", "dark"] as const;
// The bar at its widest, at a desk's width beside the docked TODO panel, where it stands short, and on a phone.
const BARS = [
  { width: 1600, height: 900, phone: false, short: false },
  { width: 1280, height: 900, phone: false, short: true },
  { width: 360, height: 780, phone: true, short: true }
] as const;

let browser: Browser | null = null;
let cookie = "";

beforeAll(async () => {
  if (!origin || !touchReady()) return;

  const login = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ACCOUNT) });

  expect(login.ok).toBe(true);
  cookie = login.headers.get("set-cookie")!.split(";")[0]!;
  browser = await chromium.launch();
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();
}, BROWSER_HOOK_MS);

// The room with one reminder waiting, its note in English, and a translator that reads it. The press is what is
// driven, so the browser's own translation on opening is off.
async function open(viewport: { width: number; height: number; phone: boolean }, scheme: (typeof SCHEMES)[number]): Promise<BrowserContext> {
  const context = await browser!.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.phone,
    hasTouch: viewport.phone,
    colorScheme: scheme,
    serviceWorkers: "block",
    reducedMotion: "reduce"
  });
  const at = cookie.indexOf("=");

  await context.addCookies([
    { name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! },
    { name: "console_auto_translate", value: "false", url: origin! },
    { name: "nuxt-color-mode", value: scheme, url: origin! }
  ]);
  await context.route(new RegExp(`/api/rooms/(${CHAT}|${GROUP_CHAT})/background$`), (route) =>
    route.fulfill({
      json: {
        calls: [
          { id: "call-a", kind: "reminder", tool: "bmo/remind", note: NOTE, everySeconds: null, until: Date.now() + 3_600_000, agent: "agent-a", startedAt: Date.now() - 60_000 }
        ]
      }
    })
  );
  await context.route(/\/api\/translations$/, (route) => route.fulfill({ json: { readings: [{ text: READING, whole: true }] } }));

  return context;
}

// The gap between the end of the room's name, where its words end or where a name too long for the bar is cut, and
// the menu button's own box.
async function nameToMenu(page: Page): Promise<number> {
  return await page.evaluate(() => {
    const bar = document.querySelector("[data-title-bar]")!;
    const title = bar.querySelector("[data-slot=title]")!;
    const range = document.createRange();

    range.selectNodeContents(title);

    const end = Math.min(range.getBoundingClientRect().right, title.getBoundingClientRect().right);

    return bar.querySelector("[data-room-menu]")!.getBoundingClientRect().left - end;
  });
}

describe.skipIf(!origin || !touchReady())("the room's head", () => {
  for (const viewport of WIDTHS) {
    for (const scheme of SCHEMES) {
      test(`keeps 8px between the name and the menu, and reads a waiting call's note in place, ${viewport.width}px wide, ${scheme}`, async () => {
        const context = await open(viewport, scheme);
        const page = await context.newPage();

        try {
          await page.goto(`${origin}/rooms/${CHAT}`, { waitUntil: "load" });
          await page.locator("[data-title-bar] [data-room-menu]").waitFor({ timeout: 30_000 });
          expect(Math.round(await nameToMenu(page))).toBe(8);

          // The waiting call's note opens as the agent wrote it, under its line, and the press stands its reading in its
          // place; the show-original press puts the note back.
          // From the sm width the waiting calls' own button opens the list; under it the room's menu does, as a drawer.
          const opener = viewport.phone ? page.locator("[data-title-bar] [data-room-menu]") : page.locator("[data-room-background]");
          const openList = async (): Promise<void> => {
            await opener.click();
            if (viewport.phone) await page.getByRole("menuitem", { name: wording("room.label.background_count", { n: "1" }), exact: true }).click({ timeout: 10_000 });
          };

          const note = page.locator("[data-room-background-list] [data-background-note]");

          await opener.waitFor({ timeout: 30_000 });

          // A press made before the page's handlers land is lost, so the list is opened again, a bounded number of times.
          for (let tries = 0; tries < 3 && !(await note.isVisible()); tries += 1) {
            if (tries > 0) await page.keyboard.press("Escape");
            await openList().catch(() => undefined);
            await note.waitFor({ timeout: 5_000 }).catch(() => undefined);
          }

          await note.waitFor({ timeout: 5_000 });

          expect((await note.innerText()).trim()).toBe(NOTE);
          // Every line of the entry, the reading's own among them, is drawn at the caption size, 14px.
          expect(await page.locator("[data-room-background-list] li").first().evaluate((entry) => [...entry.querySelectorAll("[data-reading], [data-background-note], li > span")].map((line) => getComputedStyle(line).fontSize))).toEqual(["14px", "14px", "14px", "14px"]);
          await page.locator("[data-room-background-list] [data-reading-translate]").click();
          await page.locator("[data-room-background-list] [data-reading-original]").waitFor({ timeout: 20_000 });
          expect((await note.innerText()).trim()).toBe(READING);
          await page.locator("[data-room-background-list] [data-reading-original]").click();
          expect((await note.innerText()).trim()).toBe(NOTE);
        } finally {
          await context.close();
        }
      }, 120_000);
    }
  }
});

// The room's own buttons and the set at the bar's right end, as they stand: each one's box, left to right.
async function barParts(page: Page): Promise<{ bar: number; width: number; title: number; own: { name: string; left: number; right: number }[]; set: number; mark: { width: number; height: number } }> {
  return await page.evaluate(() => {
    const bar = document.querySelector("[data-title-bar]")!;
    const shown = (one: Element) => one.getBoundingClientRect().width > 0;
    const marks = ["data-room-menu", "data-pinned-button", "data-room-background", "data-window-clock", "data-window-clock-button"];
    const own = marks
      .flatMap((mark) => [...bar.querySelectorAll(`[${mark}]`)].filter(shown).map((one) => ({ name: mark, left: one.getBoundingClientRect().left, right: one.getBoundingClientRect().right })))
      .sort((a, b) => a.left - b.left);

    const mark = bar.querySelector("[data-deploy-mark]")!.getBoundingClientRect();

    return {
      bar: bar.getBoundingClientRect().height,
      width: bar.getBoundingClientRect().width,
      title: bar.querySelector("[data-slot=title]")!.getBoundingClientRect().width,
      own,
      set: bar.querySelector("[data-title-bar-actions]")!.getBoundingClientRect().left,
      mark: { width: mark.width, height: mark.height }
    };
  });
}

describe.skipIf(!origin || !touchReady())("a group room's bar holding every button of its own", () => {
  for (const viewport of BARS) {
    test(`stands on one line beside the room's name while a deployment runs, the time left last, ${viewport.width}px wide`, async () => {
      const context = await open(viewport, "dark");
      const page = await context.newPage();

      await context.route(new RegExp(`/api/rooms/${GROUP_CHAT}/window$`), (route) => route.fulfill({ json: { openFor: 1_800 } }));
      // A deployment running, so the set at the right end stands at its widest: its mark beside the usage figures, and
      // TODO on a phone, where the panel does not stand docked.
      await context.route(/\/api\/deploy$/, (route) =>
        route.fulfill({
          json: {
            release: "release-a",
            detailed: true,
            hold: null,
            run: { unitName: "unit-a", phase: "running", startedAt: Date.now() - 60_000, endedAt: null, end: null, commit: null, brings: [], plan: [], stages: [{ stage: "build", at: Date.now() }], steps: [], ahead: [], running: null }
          }
        })
      );
      await context.route(new RegExp(`/api/rooms/${GROUP_CHAT}/pins$`), (route) =>
        route.fulfill({ json: { items: [{ messageId: "1", senderName: "person-b", text: "A pinned line long enough to be cut", pinnedAt: 1 }] } })
      );

      try {
        await page.goto(`${origin}/rooms/${GROUP_CHAT}`, { waitUntil: "load" });
        await page.locator(`[data-title-bar] ${viewport.short ? "[data-window-clock-button]" : "[data-window-clock]"}`).waitFor({ timeout: 30_000 });
        if (!viewport.short) await page.locator("[data-title-bar] [data-pinned-button]").waitFor({ timeout: 30_000 });
        if (!viewport.phone) await page.locator("[data-title-bar] [data-room-background]").waitFor({ timeout: 30_000 });

        // The set at the right end stands whole: the deployment's mark and the usage figures, and TODO on a phone; a
        // desk's TODO panel stands docked beside the room instead of its button.
        const setParts = viewport.phone ? 3 : 2;

        await page.waitForFunction((count) => [...document.querySelector("[data-title-bar] [data-title-bar-actions]")!.children].filter((part) => part.getBoundingClientRect().width > 0).length === count, setParts, { timeout: 30_000 });

        const parts = await barParts(page);
        const own = viewport.phone
          ? ["data-room-menu", "data-window-clock-button"]
          : viewport.short
            ? ["data-room-menu", "data-room-background", "data-window-clock-button"]
            : ["data-room-menu", "data-room-background", "data-pinned-button", "data-window-clock"];

        expect(parts.bar).toBe(48);
        expect(parts.width < 768).toBe(viewport.short);
        expect(parts.title).toBeGreaterThanOrEqual(40);
        expect(parts.own.map((part) => part.name)).toEqual(own);
        expect(parts.own.at(-1)!.right).toBeLessThanOrEqual(parts.set);
        // The deployment's mark stands as its square on a short bar, its words folded into its tooltip.
        expect(parts.mark.width === parts.mark.height).toBe(viewport.short);

        if (viewport.short) {
          // The pinned button stands first in the room's menu, and on a phone the waiting calls after it.
          const folded = [wording("room.label.pinned_count", { n: "1" }), ...(viewport.phone ? [wording("room.label.background_count", { n: "1" })] : [])];

          await page.locator("[data-title-bar] [data-room-menu]").click();
          await page.getByRole("menuitem", { name: wording("room.label.pinned_count", { n: "1" }), exact: true }).waitFor({ timeout: 10_000 });
          expect((await page.getByRole("menuitem").allInnerTexts()).slice(0, folded.length)).toEqual(folded);
          expect(await page.getByRole("menuitem", { name: wording("room.label.background_count", { n: "1" }), exact: true }).count()).toBe(viewport.phone ? 1 : 0);
          await page.keyboard.press("Escape");
          await page.getByRole("menu").waitFor({ state: "detached", timeout: 10_000 });

          // The time left is read in the popover its button opens.
          await page.locator("[data-title-bar] [data-window-clock-button]").click();
          await page.locator("[data-window-clock-popover] [role=timer]").waitFor({ timeout: 10_000 });
          expect(await page.locator("[data-window-clock-popover] [role=timer]").textContent()).toMatch(/\d+:\d{2}/);
        }
      } finally {
        await context.close();
      }
    }, 120_000);
  }
});
