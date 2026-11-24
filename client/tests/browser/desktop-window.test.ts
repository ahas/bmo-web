import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";
import KO from "../fixtures/browser/desktop-window.test.ko.json";

import type { Browser, BrowserContext, Locator, Page } from "playwright-core";

// The desktop app's window (docs/web.md, 「The desktop app's window」 and 「Settings」, the desktop section): the console
// draws nothing of the app in a browser, and in the app — the app's bridge stood in here, answering as the app does —
// the settings gain the desktop section, whose switches, server and update channel are the app's and change through it, the user menu drops the download page,
// the title bar is the window's drag region, the window's controls stand at its right end where the app says the
// console draws them and call the window's commands, the room for the system's own is kept where they stand inset,
// and a page with no shell carries the window's bar. Each is read at a desk's width and a phone's, from what is drawn.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ADMINISTRATOR = { name: "desktop-window", password: "fixture-password-3811" };
const SIZES = [[1280, 900], [360, 780]] as const;
const WINDOW_TITLE = "window-title-3811";
// The room the system's own window buttons are left, 5rem.
const INSET_PX = 80;

type Controls = "console" | "inset";

let browser: Browser | null = null;
let cookie = "";

beforeAll(async () => {
  if (!origin || !touchReady()) return;

  const answer = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ADMINISTRATOR) });

  expect(answer.ok).toBe(true);
  cookie = answer.headers.get("set-cookie")!.split(";")[0]!;
  browser = await chromium.launch();
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();
}, BROWSER_HOOK_MS);

// A page in a browser, or, with `controls`, in the app: the app's bridge stood in before the console's first script,
// answering the settings, one change at a time and the window's commands as the app does, and keeping every call.
async function pageFor(width: number, height: number, controls: Controls | null): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser!.newContext({ viewport: { width, height }, colorScheme: "light", serviceWorkers: "block", reducedMotion: "reduce" });
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
  if (controls !== null) {
    await context.addInitScript(
      ([windowControls, title]) => {
        const calls: [string, unknown][] = [];
        const switches = [
          { switch: "keepControlWhileLocked", on: true },
          { switch: "closeToTray", on: true },
          { switch: "startAtSignIn", on: false },
          { switch: "startInTray", on: false },
          { switch: "keepAwake", on: false },
          { switch: "laterSwitch", on: true }
        ];
        let maximized = false;
        let updateChannel = "stable";
        let consoleUrl = "https://bmo.example/console/";
        const view = () => ({ switches: switches.map((one) => ({ ...one })), updateChannel, consoleUrl, unreadable: null, windowControls });

        Object.assign(window, { bridgeCalls: calls });
        Object.assign(window, { __TAURI_INTERNALS__: {
          invoke: async (command: string, args?: { setting?: string; on?: boolean; value?: string }) => {
            calls.push([command, args ?? null]);
            switch (command) {
              case "settings":
                return view();
              case "change_setting": {
                if (args?.setting === "keepAwake") throw "keepAwake is not offered on this platform";
                if (args?.setting === "consoleUrl") {
                  // The app asks the address whether it is a BMO console before it keeps it.
                  if (String(args.value).includes("not-bmo")) throw "the address is no BMO console (HTTP 404)";
                  consoleUrl = String(args.value).replace(/\/?$/, "/");

                  return view();
                }
                if (args?.setting === "updateChannel") {
                  if (args.value !== "stable" && args.value !== "preview" && args.value !== "nightly") throw "updateChannel takes a value, stable, preview or nightly";
                  updateChannel = args.value;

                  return view();
                }

                const one = switches.find((entry) => entry.switch === args?.setting)!;

                one.on = args!.on!;

                return view();
              }
              case "plugin:window|is_maximized":
                return maximized;
              case "plugin:window|toggle_maximize":
                maximized = !maximized;

                return null;
              case "plugin:window|title":
                return title;
              default:
                return null;
            }
          }
        } });
      },
      [controls, WINDOW_TITLE] as const
    );
  }

  return { context, page: await context.newPage() };
}

async function standing(page: Page): Promise<void> {
  await page.waitForFunction(() => window.useNuxtApp?.().isHydrating === false, null, { timeout: 30_000 });
}

async function bridgeCalls(page: Page): Promise<[string, unknown][]> {
  return page.evaluate(() => (window as Window & { bridgeCalls?: [string, unknown][] }).bridgeCalls ?? []);
}

// The sidebar the reader holds: on a phone, the drawer opened from the title bar.
async function sidebar(page: Page, phone: boolean): Promise<Locator> {
  if (!phone) return page.locator("body");

  await page.getByRole("button", { name: KO.open_sidebar }).click();

  return page.getByRole("dialog");
}

// The user menu's entries, opened from the sidebar's foot.
async function userMenuEntries(page: Page, phone: boolean): Promise<string[]> {
  const holder = await sidebar(page, phone);

  await holder.getByRole("button", { name: ADMINISTRATOR.name, exact: true }).click();

  const menu = page.getByRole("menu");

  await menu.getByRole("menuitem").first().waitFor({ timeout: 10_000 });

  return menu.getByRole("menuitem").allTextContents();
}

async function settingsSections(page: Page): Promise<string[]> {
  const dialog = page.getByRole("dialog");

  await dialog.waitFor({ timeout: 20_000 });

  return dialog.locator("nav a, nav button").allTextContents();
}

describe.skipIf(!origin || !touchReady())("the desktop app's window", () => {
  for (const [width, height] of SIZES) {
    const phone = width < 1024;

    test(`a browser draws nothing of the app, at ${width}px`, async () => {
      const { context, page } = await pageFor(width, height, null);

      try {
        await page.goto(`${origin}/?settings=desktop`, { waitUntil: "load", timeout: 120_000 });
        await standing(page);

        // The key names no section a browser holds, so the dialog opens at the first, and the desktop one is no section.
        await page.getByRole("dialog").getByRole("heading", { name: wording("settings.label.account"), exact: true }).first().waitFor({ timeout: 20_000 });
        expect(await page.locator("[data-desktop-settings]").count()).toBe(0);
        if (!phone) expect((await settingsSections(page)).map((text) => text.trim())).not.toContain(wording("settings.label.desktop"));
        await page.keyboard.press("Escape");
        if (phone) await page.keyboard.press("Escape");
        await page.getByRole("dialog").waitFor({ state: "detached", timeout: 10_000 });

        expect(await page.evaluate(() => document.documentElement.dataset.windowControls ?? null)).toBeNull();
        expect(await page.locator("[data-tauri-drag-region]").count()).toBe(0);
        expect(await page.locator("[data-window-control-set], [data-window-strip]").count()).toBe(0);
        expect(await userMenuEntries(page, phone)).toContain(wording("desktop.title.page"));
      } finally {
        await context.close();
      }
    }, 180_000);

    test(`in the app the settings hold the app's switches, changed through it, at ${width}px`, async () => {
      const { context, page } = await pageFor(width, height, "console");

      try {
        await page.goto(`${origin}/?settings=desktop`, { waitUntil: "load", timeout: 120_000 });
        await standing(page);

        const section = page.locator("[data-desktop-settings]");

        await section.locator("[data-desktop-switch]").first().waitFor({ timeout: 20_000 });
        if (!phone) expect((await settingsSections(page)).map((text) => text.trim())).toContain(wording("settings.label.desktop"));

        // The app's switches in its order, one the console has no words for left out.
        expect(await section.locator("[data-desktop-switch]").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-desktop-switch")))).toEqual([
          "keepControlWhileLocked",
          "closeToTray",
          "startAtSignIn",
          "startInTray",
          "keepAwake"
        ]);

        const toggle = (key: string) => section.locator(`[data-desktop-switch="${key}"]`).getByRole("switch");

        await expect(toggle("closeToTray").getAttribute("aria-checked")).resolves.toBe("true");
        await toggle("closeToTray").click();
        await page.waitForFunction(() => document.querySelector('[data-desktop-switch="closeToTray"] [role="switch"]')?.getAttribute("aria-checked") === "false", null, { timeout: 10_000 });
        expect((await bridgeCalls(page)).filter(([command]) => command === "change_setting")).toEqual([["change_setting", { setting: "closeToTray", on: false }]]);

        // A change the app refuses puts the switch back and says so under the row's name, the app's reason with it.
        await toggle("keepAwake").click();

        const refusal = section.locator('[data-desktop-switch="keepAwake"] [data-desktop-refusal]');

        await refusal.waitFor({ timeout: 10_000 });
        expect(await refusal.textContent()).toContain(wording("desktop.error.change_failed"));
        expect(await refusal.textContent()).toContain("keepAwake is not offered on this platform");
        await expect(toggle("keepAwake").getAttribute("aria-checked")).resolves.toBe("false");

        // Every switch stands inside the window.
        for (const box of await section.getByRole("switch").evaluateAll((switches) => switches.map((one) => one.getBoundingClientRect().toJSON() as DOMRect))) {
          expect(box.x).toBeGreaterThanOrEqual(0);
          expect(box.x + box.width).toBeLessThanOrEqual(width);
        }
      } finally {
        await context.close();
      }
    }, 180_000);

    test(`in the app the update channel is chosen through it, the default marked, at ${width}px`, async () => {
      const { context, page } = await pageFor(width, height, "console");

      try {
        await page.goto(`${origin}/?settings=desktop`, { waitUntil: "load", timeout: 120_000 });
        await standing(page);

        const row = page.locator("[data-desktop-settings] [data-desktop-channel]");

        await row.waitFor({ timeout: 20_000 });
        expect(await row.textContent()).toContain(wording("desktop.label.update_channel"));
        expect(await row.textContent()).toContain(wording("desktop.message.update_channel"));

        // The three real values in the app's order, the default marked, as one group of radios named by the setting.
        const group = row.getByRole("radiogroup", { name: wording("desktop.label.update_channel") });
        const stable = wording("desktop.label.default_value", { value: wording("desktop.label.channel_stable") });
        const preview = wording("desktop.label.channel_preview");
        const nightly = wording("desktop.label.channel_nightly");

        expect((await group.getByRole("radio").allTextContents()).map((text) => text.trim())).toEqual([stable, preview, nightly]);
        await expect(group.getByRole("radio", { name: stable }).getAttribute("aria-checked")).resolves.toBe("true");

        // Each choice stands inside the window, and nothing stands over it where a finger presses it.
        for (const choice of await group.getByRole("radio").all()) {
          await choice.scrollIntoViewIfNeeded();

          const box = (await choice.boundingBox())!;

          expect(box.x).toBeGreaterThanOrEqual(0);
          expect(box.x + box.width).toBeLessThanOrEqual(width);
          expect(await choice.evaluate((one) => {
            const { x, y, width: w, height: h } = one.getBoundingClientRect();

            return one.contains(document.elementFromPoint(x + w / 2, y + h / 2));
          })).toBe(true);
        }

        // Choosing a channel asks the app, which answers with it chosen and the others not; choosing the default goes
        // back the same way.
        for (const name of [preview, nightly, stable]) {
          await group.getByRole("radio", { name, exact: true }).click();
          await page.waitForFunction(
            (chosen) => [...document.querySelectorAll("[data-desktop-channel] [role='radio']")].some((one) => one.textContent?.trim() === chosen && one.getAttribute("aria-checked") === "true"),
            name,
            { timeout: 10_000 }
          );
          expect((await group.getByRole("radio", { checked: true }).allTextContents()).map((text) => text.trim())).toEqual([name]);
        }
        expect((await bridgeCalls(page)).filter(([command]) => command === "change_setting")).toEqual([
          ["change_setting", { setting: "updateChannel", value: "preview" }],
          ["change_setting", { setting: "updateChannel", value: "nightly" }],
          ["change_setting", { setting: "updateChannel", value: "stable" }]
        ]);
        expect(await row.locator("[data-desktop-refusal]").count()).toBe(0);
      } finally {
        await context.close();
      }
    }, 180_000);

    test(`in the app the server is shown and changed through its form, a refusal said in it, at ${width}px`, async () => {
      const { context, page } = await pageFor(width, height, "console");

      try {
        await page.goto(`${origin}/?settings=desktop`, { waitUntil: "load", timeout: 120_000 });
        await standing(page);

        const row = page.locator("[data-desktop-settings] [data-desktop-server]");

        await row.waitFor({ timeout: 20_000 });
        expect(await row.textContent()).toContain(wording("desktop.label.server"));
        expect(await row.locator("[data-desktop-server-address]").textContent()).toBe("https://bmo.example/console/");

        // The row sits between the switches and the channel, inside the window, and nothing covers its button.
        const order = await page.locator("[data-desktop-settings] [data-desktop-switch], [data-desktop-settings] [data-desktop-server], [data-desktop-settings] [data-desktop-channel]").evaluateAll((rows) =>
          rows.map((one) => (one.hasAttribute("data-desktop-server") ? "server" : one.hasAttribute("data-desktop-channel") ? "channel" : "switch"))
        );

        expect(order.slice(-2)).toEqual(["server", "channel"]);

        const change = row.getByRole("button", { name: wording("desktop.action.change_server"), exact: true });

        await change.scrollIntoViewIfNeeded();

        const box = (await change.boundingBox())!;

        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
        expect(await change.evaluate((one) => {
          const { x, y, width: w, height: h } = one.getBoundingClientRect();

          return one.contains(document.elementFromPoint(x + w / 2, y + h / 2));
        })).toBe(true);

        // The row's button opens the form, the address as it stands in its field, its save closed until the address differs.
        await change.click();

        const form = page.getByRole("dialog", { name: wording("desktop.title.server") });
        const field = form.getByRole("textbox", { name: wording("desktop.label.server_address") });
        const save = form.getByRole("button", { name: wording("common.action.save"), exact: true });

        await field.waitFor({ timeout: 10_000 });
        expect(await field.inputValue()).toBe("https://bmo.example/console/");
        expect(await form.textContent()).toContain(wording("desktop.message.server_address"));
        expect(await save.isDisabled()).toBe(true);

        // An address the app refuses keeps the form open, the app's reason in it.
        await field.fill("https://not-bmo.example/");
        await save.click();

        const refusal = form.locator("[data-desktop-server-refusal]");

        await refusal.waitFor({ timeout: 10_000 });
        expect(await refusal.textContent()).toContain(wording("desktop.error.change_failed"));
        expect(await refusal.textContent()).toContain("the address is no BMO console (HTTP 404)");

        // An address the app takes says the app starts again, the form held still, every part of it inside the window.
        await field.fill("https://other-bmo.example/console");
        await save.click();
        await form.locator("[data-desktop-server-restarting]").waitFor({ timeout: 10_000 });
        expect(await form.locator("[data-desktop-server-restarting]").textContent()).toBe(wording("desktop.message.server_restarting"));
        expect(await form.locator("[data-desktop-server-refusal]").count()).toBe(0);
        expect(await field.getAttribute("readonly")).not.toBeNull();
        for (const part of [field, save]) {
          const one = (await part.boundingBox())!;

          expect(one.x).toBeGreaterThanOrEqual(0);
          expect(one.x + one.width).toBeLessThanOrEqual(width);
        }
        expect((await bridgeCalls(page)).filter(([command]) => command === "change_setting")).toEqual([
          ["change_setting", { setting: "consoleUrl", value: "https://not-bmo.example/" }],
          ["change_setting", { setting: "consoleUrl", value: "https://other-bmo.example/console" }]
        ]);
      } finally {
        await context.close();
      }
    }, 180_000);

    test(`in the app the title bar is the window's frame with its controls, at ${width}px`, async () => {
      const { context, page } = await pageFor(width, height, "console");

      try {
        await page.goto(`${origin}/`, { waitUntil: "load", timeout: 120_000 });
        await standing(page);

        const bar = page.locator("[data-title-bar]").first();
        const controls = bar.locator("[data-window-control-set]");

        await controls.waitFor({ timeout: 20_000 });
        expect(await bar.getAttribute("data-tauri-drag-region")).toBe("deep");
        expect(await page.evaluate(() => document.documentElement.dataset.windowControls)).toBe("console");

        // Minimise, maximise and close at the bar's right end, the last of everything in it, inside the window.
        const buttons = controls.getByRole("button");

        expect(await buttons.evaluateAll((all) => all.map((one) => one.getAttribute("aria-label")))).toEqual([
          wording("desktop.action.minimize"),
          wording("desktop.action.maximize"),
          wording("desktop.action.close_window")
        ]);

        const close = (await buttons.last().boundingBox())!;
        const lastInBar = await bar.getByRole("button").last().boundingBox();

        expect(close.x + close.width).toBeLessThanOrEqual(width);
        expect(close.x).toBeGreaterThan(width / 2);
        expect(lastInBar).toEqual(close);

        // Each calls the window's own command, the maximise turning into the restore once the window is maximised.
        await buttons.nth(0).click();
        await buttons.nth(1).click();
        await controls.getByRole("button", { name: wording("desktop.action.restore"), exact: true }).waitFor({ timeout: 10_000 });
        await buttons.nth(2).click();

        const frame = (await bridgeCalls(page)).map(([command]) => command).filter((command) => ["plugin:window|minimize", "plugin:window|toggle_maximize", "plugin:window|close"].includes(command));

        expect(frame).toEqual(["plugin:window|minimize", "plugin:window|toggle_maximize", "plugin:window|close"]);

        // The download page is not offered in the app.
        expect(await userMenuEntries(page, phone)).not.toContain(wording("desktop.title.page"));
      } finally {
        await context.close();
      }
    }, 180_000);

    test(`where the system's own buttons stand inset, their room is kept and none are drawn, at ${width}px`, async () => {
      const { context, page } = await pageFor(width, height, "inset");

      try {
        await page.goto(`${origin}/`, { waitUntil: "load", timeout: 120_000 });
        await standing(page);
        await page.waitForFunction(() => document.documentElement.dataset.windowControls === "inset", null, { timeout: 20_000 });

        expect(await page.locator("[data-window-control-set]").count()).toBe(0);

        // At a desk's width the sidebar's head starts after the room; on a phone, whose sidebar is a drawer, the title bar.
        const first = phone ? page.locator("[data-title-bar]").first().getByRole("button").first() : page.locator('[data-tauri-drag-region="deep"]:not([data-title-bar]) a').first();
        const box = (await first.boundingBox())!;

        expect(box.x).toBeGreaterThanOrEqual(INSET_PX);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
      } finally {
        await context.close();
      }
    }, 180_000);

    test(`a page with no shell carries the window's bar in the app alone, at ${width}px`, async () => {
      for (const controls of [null, "console"] as const) {
        const { context, page } = await pageFor(width, height, controls);

        try {
          await page.goto(`${origin}/desktop/pair?code=ABCD-EFGH&in=app`, { waitUntil: "load", timeout: 120_000 });
          await standing(page);

          const strip = page.locator("[data-window-strip]");

          if (controls === null) {
            await page.locator("main, body").first().waitFor();
            expect(await strip.count()).toBe(0);
            continue;
          }

          await strip.locator("[data-window-title]").getByText(WINDOW_TITLE, { exact: true }).waitFor({ timeout: 20_000 });
          expect(await strip.getAttribute("data-tauri-drag-region")).toBe("deep");

          const bar = (await strip.boundingBox())!;
          const close = (await strip.getByRole("button", { name: wording("desktop.action.close_window"), exact: true }).boundingBox())!;

          expect(bar.y).toBe(0);
          expect(bar.width).toBe(width);
          expect(close.x + close.width).toBeLessThanOrEqual(width);
          await strip.getByRole("button", { name: wording("desktop.action.close_window"), exact: true }).click();
          expect((await bridgeCalls(page)).map(([command]) => command)).toContain("plugin:window|close");
        } finally {
          await context.close();
        }
      }
    }, 240_000);
  }
});
