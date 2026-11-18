import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";

import type { Browser, BrowserContext, Locator, Page, Route } from "playwright-core";

// A console dialog holds a change only while its values differ from what it opened with (docs/web.md, 「Forms」;
// bmo-ui's docs/components.md, its forms): text is read trimmed and every kind of nothing alike, so a dialog left
// untouched, or one whose change was put back, closes at once on Esc and on the back gesture, while one holding a
// change asks before it is thrown away, and Esc on that question keeps the dialog. A form whose data lands after the
// reader began reads its change against what it opened with, and one the reader left alone takes what landed and still
// holds no change. The dialogs read are an organisation post, opened from the chart and from a person's manage menu; a
// supervisor's persona; a machine's CPU limit; and a role's and a repository's settings. A desktop's width and a phone's.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up, and serves
// what the console's stand-ins do not answer — a supervisor's settings, a machine's reading — through the page's own
// routes.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "opened-with", password: "fixture-password-3376" };
const RUN = Date.now().toString(36);
const WIDTHS = [
  { width: 1280, height: 800 },
  { width: 360, height: 780 }
];
// The company's one role, the post dialog's role to change to.
const ROLE = { key: "lead", name: "Lead" };
// The room-scope supervisor the agency's stand-in holds, whose settings carry a persona, and the file it reads that
// persona from while it keeps none of its own.
const SUPERVISOR = { name: "agent-c", label: "Agent C" };
const PERSONA_FILE = "A persona read from its file.";
// What the agency answers once a dialog has opened, where it has changed meanwhile.
const LANDED = "Read after opening";

let browser: Browser | null = null;
let cookie = "";
let self = "";
let subunit = { id: 0, name: `post-${RUN}` };

async function call<T>(path: string, method: string, body?: unknown): Promise<T> {
  const answer = await fetch(`${origin}${path}`, {
    method,
    headers: { cookie, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  expect({ path, ok: answer.ok }).toEqual({ path, ok: true });

  return (answer.status === 204 ? null : await answer.json().catch(() => null)) as T;
}

beforeAll(async () => {
  if (!origin || !touchReady()) return;

  const login = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ACCOUNT) });

  expect(login.ok).toBe(true);
  cookie = login.headers.get("set-cookie")!.split(";")[0]!;

  // A company of this run with the account standing in it, a unit under it to give the account a post in, and one role.
  const company = (await call<{ id: number }>("/api/organization/units", "POST", { name: `opened-${RUN}`, parent: null })).id;

  subunit = { id: (await call<{ id: number }>("/api/organization/units", "POST", { name: subunit.name, parent: company })).id, name: subunit.name };
  self = (await call<{ user: string; name: string }[]>("/api/users", "GET")).find((one) => one.name === ACCOUNT.name)!.user;
  await call(`/api/organization/users/${encodeURIComponent(self)}/unit`, "PUT", { unit: company });
  await call(`/api/organization/companies/${company}/roles`, "PUT", { roles: [ROLE] });

  browser = await chromium.launch();
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();
}, BROWSER_HOOK_MS);

async function contextAt(width: number, height: number): Promise<BrowserContext> {
  const context = await browser!.newContext({ viewport: { width, height }, serviceWorkers: "block", reducedMotion: "reduce" });
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

  return context;
}

// The development console builds a screen the first time one is asked for, which may take a while.
async function visit(page: Page, path: string): Promise<void> {
  await page.goto(`${origin}${path}`, { waitUntil: "load", timeout: 60_000 });
  await page.waitForFunction(() => window.useNuxtApp?.().isHydrating === false, null, { timeout: 60_000 });
}

function discard(page: Page): Locator {
  return page.getByRole("button", { name: wording("common.action.discard"), exact: true });
}

function saveButton(page: Page): Locator {
  return page.getByRole("dialog").getByRole("button", { name: wording("common.action.save"), exact: true });
}

async function saveIs(page: Page, state: "enabled" | "disabled"): Promise<void> {
  await saveButton(page).and(page.locator(`:${state}`)).waitFor({ timeout: 10_000 });
}

// The dialog marked by one of its fields closes at once, asking nothing: on Esc, or on the back gesture.
async function closesAtOnce(page: Page, field: Locator, by: "escape" | "back" = "escape"): Promise<void> {
  if (by === "escape") await page.keyboard.press("Escape");
  else await page.goBack();

  await field.waitFor({ state: "detached", timeout: 10_000 });
  expect(await discard(page).count()).toBe(0);
}

// The dialog marked by one of its fields asks before its change is thrown away; Esc on the question keeps the
// dialog with its change, and discarding closes it.
async function asksThenDiscards(page: Page, field: Locator): Promise<void> {
  await page.keyboard.press("Escape");
  await discard(page).waitFor({ timeout: 10_000 });
  await page.keyboard.press("Escape");
  await discard(page).waitFor({ state: "detached", timeout: 10_000 });
  expect(await field.count()).toBe(1);

  await field.focus();
  await page.keyboard.press("Escape");
  await discard(page).click();
  await field.waitFor({ state: "detached", timeout: 10_000 });
}

// One choice of a select or a select menu, the list closed after it.
async function choose(page: Page, select: Locator, option: string | RegExp): Promise<void> {
  await select.click();
  await page.getByRole("option", { name: option, exact: true }).first().click();
  await page.getByRole("listbox").waitFor({ state: "detached", timeout: 10_000 });
}

// A route whose answers are held while it is armed until the test lets them land, each laid over by `change` first.
function heldAnswer(change: (body: unknown) => unknown): { armed: { on: boolean }; land: () => void; handle: (route: Route) => Promise<void> } {
  const armed = { on: false };
  let land = (): void => {};
  const landed = new Promise<void>((resolve) => {
    land = resolve;
  });

  return {
    armed,
    land: () => land(),
    handle: async (route) => {
      if (!armed.on) return await route.fallback();

      const answer = await route.fetch();
      const body = change(await answer.json());

      await landed;
      // A request the page dropped meanwhile has no one to answer.
      await route.fulfill({ response: answer, json: body }).catch(() => undefined);
    }
  };
}

// A machine's reading with no CPU limit of its own and none its chip names.
function machine(name: string): Record<string, unknown> {
  return {
    name,
    label: name,
    kind: "ssh",
    hardware: {
      host: name, kernel: "6.1", os: "Linux", hostOs: null, wsl: false, sensorLibrary: "ok", uptimeSeconds: 1000, load: [0.1, 0.2, 0.3],
      cpu: { model: "CPU", threadCount: 8, usage: 0.1, celsius: 40, limitCelsius: null, mhz: 3000, peakMhz: 4000, watts: 30, chip: null, sensors: [] },
      memory: { usedKb: 1_000, totalKb: 8_000, share: 0.125, swapUsedKb: 0, swapTotalKb: 0, swapShare: 0 },
      gpus: [], storage: [], board: { sensors: [], fans: [] }, services: { running: 1, failed: [] }
    },
    failure: null,
    readAt: Math.floor(Date.now() / 1000),
    tracking: true,
    cpuLimit: null
  };
}

describe.skipIf(!origin || !touchReady())("a console dialog holds a change only while its values differ from what it opened with", () => {
  for (const { width, height } of WIDTHS) {
    test(`a post opened from the chart asks only once a person or its role is changed, at ${width}px`, async () => {
      const context = await contextAt(width, height);
      const page = await context.newPage();
      const role = page.locator("[data-post-role]");
      const open = async (): Promise<void> => {
        await page.locator("[data-unit-add-post]").click();
        await role.waitFor({ timeout: 10_000 });
      };

      try {
        await visit(page, `/organization?unit=${subunit.id}`);

        await open();
        await closesAtOnce(page, role);
        await open();
        await closesAtOnce(page, role, "back");

        await open();
        await choose(page, page.locator("[data-post-person]"), ACCOUNT.name);
        await asksThenDiscards(page, role);

        // A role changed asks; changed back to none, the dialog holds nothing again.
        await open();
        await choose(page, role, ROLE.name);
        await page.keyboard.press("Escape");
        await discard(page).waitFor({ timeout: 10_000 });
        await page.keyboard.press("Escape");
        await discard(page).waitFor({ state: "detached", timeout: 10_000 });
        await choose(page, role, wording("organization.label.no_position"));
        await closesAtOnce(page, role);
      } finally {
        await context.close();
      }
    }, 90_000);

    // The manage menu hands the focus back to its button only once its leaving is drawn, after the dialog has opened
    // and the unit is chosen; bmo-ui refuses that focus as a dismissal, but its settings dialog still asks the discard
    // question for it while it holds a change, and asks again for the focus the question hands back. It stays a todo
    // until the vendored bmo-ui leaves a refused outside focus unasked.
    test.todo(`a post opened from a person's manage menu asks only once a unit is chosen, at ${width}px`, async () => {
      const context = await contextAt(width, height);
      const page = await context.newPage();
      const unit = page.locator("[data-post-unit]");
      const open = async (): Promise<void> => {
        await page.locator("[data-roster-manage]:visible").click({ timeout: 30_000 });
        await page.getByRole("menuitem", { name: wording("roster.action.add_post"), exact: true }).click();
        await unit.waitFor({ timeout: 10_000 });
      };

      try {
        await visit(page, `/organization?tab=people&user=${encodeURIComponent(self)}`);

        await open();
        await closesAtOnce(page, unit);
        await open();
        await closesAtOnce(page, unit, "back");

        await open();
        await choose(page, unit, new RegExp(`${subunit.name}$`));
        await saveIs(page, "enabled");
        expect(await discard(page).count()).toBe(0);
        await asksThenDiscards(page, unit);
      } finally {
        await context.close();
      }
    }, 90_000);

    test(`a supervisor's persona typed back to its file's text holds no change, at ${width}px`, async () => {
      const context = await contextAt(width, height);
      const page = await context.newPage();
      const persona = page.getByRole("textbox", { name: wording("agents.label.piece_persona"), exact: true });
      const fileMark = page.getByRole("dialog").getByText(wording("agents.label.persona_file"), { exact: true });
      const open = async (): Promise<void> => {
        await page.getByRole("button", { name: wording("common.aria.menu_of", { name: SUPERVISOR.label }), exact: true }).click({ timeout: 30_000 });
        await page.getByRole("menuitem", { name: wording("agents.action.settings") }).click();
        await persona.waitFor({ timeout: 15_000 });
        expect(await persona.inputValue()).toBe(PERSONA_FILE);
      };

      await context.route(`**/api/supervisors/${SUPERVISOR.name}/settings`, (route) =>
        route.fulfill({
          json: {
            name: SUPERVISOR.name, sessions: 0, generation: {}, generationSettings: [], referenceOn: true, persona: null, personaFile: PERSONA_FILE,
            system: { text: PERSONA_FILE, characters: PERSONA_FILE.length, hash: "0".repeat(64) }
          }
        })
      );

      try {
        await visit(page, `/agents?tab=supervisors`);

        await open();
        await saveIs(page, "disabled");
        await closesAtOnce(page, persona);

        // Typed onto and put back: the file's text again.
        await open();
        await persona.click();
        await page.keyboard.press("ControlOrMeta+End");
        await page.keyboard.type(" more");
        await saveIs(page, "enabled");
        for (let at = 0; at < 5; at += 1) await page.keyboard.press("Backspace");
        await saveIs(page, "disabled");
        expect(await persona.inputValue()).toBe(PERSONA_FILE);
        await fileMark.waitFor({ timeout: 10_000 });
        await closesAtOnce(page, persona);

        // Emptied, an own empty persona, then written out again as the file's.
        await open();
        await persona.click();
        await page.keyboard.press("ControlOrMeta+a");
        await page.keyboard.press("Backspace");
        await saveIs(page, "enabled");
        await page.keyboard.type(PERSONA_FILE);
        await saveIs(page, "disabled");
        await closesAtOnce(page, persona, "back");

        // A persona of its own asks.
        await open();
        await persona.click();
        await page.keyboard.press("ControlOrMeta+End");
        await page.keyboard.type("abc");
        await saveIs(page, "enabled");
        await asksThenDiscards(page, persona);
      } finally {
        await context.close();
      }
    }, 90_000);

    test(`a CPU limit typed and emptied again on a machine with none holds no change, at ${width}px`, async () => {
      const context = await contextAt(width, height);
      const page = await context.newPage();
      const limit = page.getByRole("dialog").locator("input");
      const open = async (): Promise<void> => {
        await page.getByRole("button", { name: wording("hardware.title.cpu_limit"), exact: true }).click({ timeout: 30_000 });
        await limit.waitFor({ timeout: 10_000 });
        expect(await limit.inputValue()).toBe("");
      };

      await context.route("**/api/nodes", (route) => route.fulfill({ json: [{ name: "node-a", label: "Node A", kind: "ssh", thisMachine: false }] }));
      await context.route((url) => url.pathname.includes("/api/hardware/machines"), async (route) => {
        const rest = new URL(route.request().url()).pathname.split("/api/hardware/machines")[1] ?? "";

        if (rest === "" || rest === "/") return await route.fulfill({ json: [machine("node-a")] });
        if (rest.endsWith("/live")) return await route.fulfill({ json: { at: [], series: {} } });
        if (rest.endsWith("/history")) return await route.fulfill({ json: { at: [], pointSeconds: 5, series: {} } });

        return await route.fulfill({ json: machine(decodeURIComponent(rest.slice(1))) });
      });

      try {
        await visit(page, `/monitor/node-a`);

        await open();
        await closesAtOnce(page, limit);

        // A number typed, then the box emptied: no limit, as it opened.
        await open();
        await limit.click();
        await page.keyboard.type("80");
        await limit.blur();
        await saveIs(page, "enabled");
        await limit.click();
        await page.keyboard.press("ControlOrMeta+a");
        await page.keyboard.press("Backspace");
        await limit.blur();
        await saveIs(page, "disabled");
        await closesAtOnce(page, limit);

        await open();
        await limit.click();
        await page.keyboard.type("85");
        await limit.blur();
        await saveIs(page, "enabled");
        await asksThenDiscards(page, limit);
      } finally {
        await context.close();
      }
    }, 90_000);

    test(`a role's dialog asks only for a change still standing, at ${width}px`, async () => {
      const context = await contextAt(width, height);
      const page = await context.newPage();
      const description = page.getByRole("dialog").getByRole("textbox", { name: wording("agents.label.description"), exact: true });
      const name = page.getByRole("dialog").getByRole("textbox", { name: wording("common.label.name"), exact: true });
      const open = async (): Promise<void> => {
        await page.locator("#setting-role-worker").click({ timeout: 30_000 });
        await description.waitFor({ timeout: 10_000 });
      };

      try {
        await visit(page, `/agents?tab=roles`);

        // A new role's empty form, left as it opened.
        await page.locator("[data-tab-add]").click({ timeout: 30_000 });
        await name.waitFor({ timeout: 10_000 });
        await closesAtOnce(page, name);

        await open();
        await closesAtOnce(page, description);
        await open();
        await closesAtOnce(page, description, "back");

        // Typed and taken back, or nothing but spaces: no change.
        await open();
        await description.click();
        await page.keyboard.type("abc");
        await saveIs(page, "enabled");
        for (let at = 0; at < 3; at += 1) await page.keyboard.press("Backspace");
        await saveIs(page, "disabled");
        await closesAtOnce(page, description);

        await open();
        await description.click();
        await page.keyboard.type("   ");
        await saveIs(page, "disabled");
        await closesAtOnce(page, description);

        await open();
        await description.click();
        await page.keyboard.type("abc");
        await asksThenDiscards(page, description);
      } finally {
        await context.close();
      }
    }, 90_000);

    test(`a role's dialog reads its change against what it opened with when the role lands late, at ${width}px`, async () => {
      const context = await contextAt(width, height);
      const page = await context.newPage();
      const description = page.getByRole("dialog").getByRole("textbox", { name: wording("agents.label.description"), exact: true });
      const late = (held: ReturnType<typeof heldAnswer>) => async (): Promise<void> => {
        held.armed.on = true;
        await page.locator("#setting-role-worker").click({ timeout: 30_000 });
        await description.waitFor({ timeout: 10_000 });
      };
      const changed = (body: unknown): unknown => {
        const view = body as { roles: { name: string; description: string | null }[] };

        return { ...view, roles: view.roles.map((one) => (one.name === "worker" ? { ...one, description: LANDED } : one)) };
      };

      try {
        await visit(page, `/agents?tab=roles`);
        await page.locator("#setting-role-worker").waitFor({ timeout: 20_000 });

        // Written before the role lands: what was written stays, read against the empty description it opened with.
        const first = heldAnswer(changed);

        await context.route(/\/api\/roles$/, first.handle);
        await late(first)();
        await description.click();
        await page.keyboard.type("abc");
        const landing = page.waitForResponse((answer) => /\/api\/roles$/.test(new URL(answer.url()).pathname));

        first.land();
        await landing;
        expect(await description.inputValue()).toBe("abc");
        await page.keyboard.press("Escape");
        await discard(page).waitFor({ timeout: 10_000 });
        await page.keyboard.press("Escape");
        await discard(page).waitFor({ state: "detached", timeout: 10_000 });
        await description.click();
        await page.keyboard.press("End");
        for (let at = 0; at < 3; at += 1) await page.keyboard.press("Backspace");
        await saveIs(page, "disabled");
        await closesAtOnce(page, description);
        await context.unroute(/\/api\/roles$/, first.handle);

        // Pressed but left alone while the role lands changed: the form takes what landed and holds no change.
        const second = heldAnswer(changed);

        await context.route(/\/api\/roles$/, second.handle);
        await late(second)();
        await description.click();
        second.land();
        await page.waitForFunction((text) => [...document.querySelectorAll("[role=dialog] input")].some((one) => (one as HTMLInputElement).value === text), LANDED, { timeout: 10_000 });
        await saveIs(page, "disabled");
        await closesAtOnce(page, description);
      } finally {
        await context.close();
      }
    }, 90_000);

    test(`a repository's dialog asks only for a change still standing, at ${width}px`, async () => {
      const context = await contextAt(width, height);
      const page = await context.newPage();
      const dialog = page.getByRole("dialog");
      const label = dialog.getByRole("textbox", { name: wording("agents.label.display_name"), exact: true });
      const preamble = dialog.getByRole("textbox", { name: wording("agents.label.preamble"), exact: true });
      const open = async (): Promise<void> => {
        await page.locator("#setting-repository-repo-a").click({ timeout: 30_000 });
        await preamble.waitFor({ timeout: 10_000 });
      };

      try {
        await visit(page, `/agents?tab=repositories`);

        // A new repository's empty form, left as it opened.
        await page.locator("[data-tab-add]").click({ timeout: 30_000 });
        await preamble.waitFor({ timeout: 10_000 });
        await closesAtOnce(page, preamble);

        await open();
        await closesAtOnce(page, preamble);
        await open();
        await closesAtOnce(page, preamble, "back");

        // Typed and taken back, or nothing but spaces: no change.
        await open();
        await label.click();
        await page.keyboard.type("abc");
        await saveIs(page, "enabled");
        for (let at = 0; at < 3; at += 1) await page.keyboard.press("Backspace");
        await saveIs(page, "disabled");
        await closesAtOnce(page, preamble);

        await open();
        await preamble.click();
        await page.keyboard.type("   ");
        await saveIs(page, "disabled");
        await closesAtOnce(page, preamble);

        await open();
        await preamble.click();
        await page.keyboard.type("abc");
        await asksThenDiscards(page, preamble);
      } finally {
        await context.close();
      }
    }, 90_000);

    test(`a repository's dialog reads its change against what it opened with when the repository lands late, at ${width}px`, async () => {
      const context = await contextAt(width, height);
      const page = await context.newPage();
      const preamble = page.getByRole("dialog").getByRole("textbox", { name: wording("agents.label.preamble"), exact: true });
      const late = (held: ReturnType<typeof heldAnswer>) => async (): Promise<void> => {
        held.armed.on = true;
        await page.locator("#setting-repository-repo-a").click({ timeout: 30_000 });
        await preamble.waitFor({ timeout: 10_000 });
      };
      const changed = (body: unknown): unknown => (body as { name: string }[]).map((one) => (one.name === "repo-a" ? { ...one, preamble: LANDED } : one));

      try {
        await visit(page, `/agents?tab=repositories`);
        await page.locator("#setting-repository-repo-a").waitFor({ timeout: 20_000 });

        // Written before the repository lands: what was written stays, read against the empty preamble it opened with.
        const first = heldAnswer(changed);

        await context.route(/\/api\/repositories$/, first.handle);
        await late(first)();
        await preamble.click();
        await page.keyboard.type("abc");
        const landing = page.waitForResponse((answer) => /\/api\/repositories$/.test(new URL(answer.url()).pathname));

        first.land();
        await landing;
        expect(await preamble.inputValue()).toBe("abc");
        await page.keyboard.press("Escape");
        await discard(page).waitFor({ timeout: 10_000 });
        await page.keyboard.press("Escape");
        await discard(page).waitFor({ state: "detached", timeout: 10_000 });
        await preamble.click();
        await page.keyboard.press("ControlOrMeta+End");
        for (let at = 0; at < 3; at += 1) await page.keyboard.press("Backspace");
        await saveIs(page, "disabled");
        await closesAtOnce(page, preamble);
        await context.unroute(/\/api\/repositories$/, first.handle);

        // Pressed but left alone while the repository lands changed: the form takes what landed and holds no change.
        const second = heldAnswer(changed);

        await context.route(/\/api\/repositories$/, second.handle);
        await late(second)();
        await preamble.click();
        second.land();
        await page.waitForFunction((text) => [...document.querySelectorAll("[role=dialog] textarea")].some((one) => (one as HTMLTextAreaElement).value === text), LANDED, { timeout: 10_000 });
        await saveIs(page, "disabled");
        await closesAtOnce(page, preamble);
      } finally {
        await context.close();
      }
    }, 90_000);
  }
});
