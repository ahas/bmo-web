import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { measureSource } from "./measure-source";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, BrowserContext, Page } from "playwright-core";
import type { DeployCommit, DeployRunView, DeployView, DeployWaiting, TodoBoard, TodoItem } from "../../apps/web/shared/types";

// The title bar and the TODO panel tell one deployment truth (docs/web.md, 「Deployment in the title bar」 and the TODO
// panel's section): the run under way stands as running with its unit in the bar and on the row whose commit it brings,
// a deployment waiting in the line stands as waiting its turn with its unit in both, and a deployment that has finished
// is marked nowhere, its row back to waiting for its batch. Which item a deployment brings is the domain tests'; this
// reads what the screen draws as the console's word moves the deployment from one state to the next.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up, and serves
// the deployment and the board through the page's own routes.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "deploy-truth", password: "fixture-password-3187" };
const NOW = Date.now();

// Three merged items, each waiting on its commit: the first a run of unit-b brings, the second a deployment of unit-c
// waiting in the line brings, the third none brings.
const COMMITS = ["a".repeat(40), "b".repeat(40), "c".repeat(40)] as const;
const ITEMS = [1, 2, 3] as const;

function item(id: number, commit: string): TodoItem {
  return {
    id,
    title: `deploy-fixture-${id}`,
    instruction: "deploy-fixture-brief",
    requester: "Owner",
    requesterId: 42,
    chatId: 42,
    approved: true,
    awaitingApproval: false,
    recommended: false,
    done: false,
    running: false,
    liveState: null,
    worker: "worker",
    priority: 1,
    status: "open",
    model: null,
    agent: "agent-a",
    ranOn: null,
    note: null,
    reports: [],
    unfinished: null,
    rejections: 0,
    unfinishedResolvedAt: null,
    unfinishedResolution: null,
    heldAt: null,
    heldReason: null,
    heldKind: null,
    mergedInto: null,
    mergedAt: null,
    mergedIntoTitle: null,
    mergedFrom: [],
    attempts: 1,
    progress: null,
    stopped: null,
    holding: null,
    waiting: null,
    deployWaits: false,
    closing: { phase: "waiting-batch", commit },
    deployHeld: false,
    holdPending: false,
    orderActive: false,
    seconds: null,
    spans: [],
    createdAt: Math.floor(NOW / 1000) - 30,
    doneAt: null
  };
}

const brought = (commit: string): DeployCommit[] => [{ commit, subject: "deploy-fixture-change", todoId: null }];

function run(unitName: string, commit: string, ended: boolean): DeployRunView {
  return {
    unitName,
    phase: ended ? "ended" : "running",
    startedAt: NOW - 600_000,
    endedAt: ended ? NOW - 300_000 : null,
    end: ended ? "live" : null,
    commit,
    carried: brought(commit),
    brings: brought(commit),
    plan: ["check", "build", "restart"],
    stages: [{ stage: "build", at: NOW - 60_000 }],
    steps: [],
    ahead: [],
    running: null
  };
}

const waiting = (unitName: string, commit: string): DeployWaiting => ({ unitName, unit: `deploy-${unitName}.service`, commit: commit.slice(0, 12), since: NOW - 120_000, brings: brought(commit) });

// The deployment read after read: unit-b under way with unit-c waiting; unit-b finished long ago with unit-c still
// waiting; then unit-c under way.
const view = (current: DeployRunView | null, line: DeployWaiting[]): DeployView => ({
  release: "release-a",
  detailed: true,
  hold: null,
  run: current,
  runs: current !== null && current.phase === "running" ? [current] : [],
  line
});
const VIEWS: DeployView[] = [
  view(run("unit-b", COMMITS[0], false), [waiting("unit-c", COMMITS[1])]),
  view(run("unit-b", COMMITS[0], true), [waiting("unit-c", COMMITS[1])]),
  view(run("unit-c", COMMITS[1], false), [])
];

// What the bar and each row say in each of those readings.
const RUNNING = wording("deploy.status.running");
const LINE = wording("deploy.status.line");
const ON_ROW = {
  running: wording("todo.label.deploy_deploying"),
  line: wording("todo.label.deploy_in_line"),
  batch: wording("todo.label.deploy_waiting_live")
};
const EXPECTED: { bar: string; rows: string[] }[] = [
  { bar: `${RUNNING} · unit-b`, rows: [`${ON_ROW.running} · unit-b`, `${ON_ROW.line} · unit-c`, ON_ROW.batch] },
  { bar: `${LINE} · unit-c`, rows: [ON_ROW.batch, `${ON_ROW.line} · unit-c`, ON_ROW.batch] },
  { bar: `${RUNNING} · unit-c`, rows: [ON_ROW.batch, `${ON_ROW.running} · unit-c`, ON_ROW.batch] }
];

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

// What the bar's mark and the rows' way-live chips say now, in one read of the page.
async function said(page: Page): Promise<{ bar: string; rows: string[] }> {
  return await page.evaluate((ids) => {
    const words = (element: Element | null | undefined): string => element?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    const visible = (selector: string): Element | undefined => [...document.querySelectorAll(selector)].find((one) => (one as HTMLElement).offsetParent !== null);

    return {
      bar: words(visible("[data-title-bar-actions] [data-deploy-mark]")),
      rows: ids.map((id) => words(visible(`li[data-todo-id="${id}"]`)?.querySelector("[data-item-deploy]")))
    };
  }, [...ITEMS]);
}

// A signed-in context whose deployment reads as the view the step names, said moved on every connection of the
// stream: each connection says it and closes, and the next opens soon after.
async function signedIn(options: Parameters<Browser["newContext"]>[0], current: () => DeployView): Promise<BrowserContext> {
  const context = await browser!.newContext({ serviceWorkers: "block", reducedMotion: "reduce", ...options });
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
  await context.route(/\/api\/deploy$/, (route) => route.fulfill({ json: current() }));
  await context.route(/\/api\/events(\?|$)/, (route) => route.fulfill({ contentType: "text/event-stream", body: "retry: 200\n\nevent: deploy\ndata: {}\n\n" }));

  return context;
}

describe.skipIf(!origin || !touchReady())("one deployment truth on the title bar and the TODO panel", () => {
  test("the running one is running, a queued one waits its turn, and a finished one is marked nowhere", async () => {
    let step = 0;
    const context = await signedIn({ viewport: { width: 1280, height: 900 } }, () => VIEWS[step]!);

    try {
      await context.route(/\/api\/todos(\?|$)/, async (route) => {
        if (route.request().method() !== "GET") return await route.continue();

        const board = (await (await route.fetch()).json()) as TodoBoard;

        await route.fulfill({ json: { ...board, queue: ITEMS.map((id, index) => item(id, COMMITS[index]!)) } });
      });

      const page = await context.newPage();

      await page.goto(`${origin}/`, { waitUntil: "load" });

      const row = page.locator(`li[data-todo-id="${ITEMS[0]}"]:visible`).first();

      if (!(await row.waitFor({ timeout: 10_000 }).then(() => true, () => false))) {
        await page.getByRole("button", { name: wording("todo.action.open_todo") }).click();
        await row.waitFor({ timeout: 10_000 });
      }

      for (step = 0; step < VIEWS.length; step++) {
        const expected = EXPECTED[step]!;

        // A bounded wait on the screen saying it, then the read the failure message names.
        await page
          .waitForFunction(
            ([want, ids]) => {
              const words = (element: Element | null | undefined): string => element?.textContent?.replace(/\s+/g, " ").trim() ?? "";
              const visible = (selector: string): Element | undefined => [...document.querySelectorAll(selector)].find((one) => (one as HTMLElement).offsetParent !== null);

              return words(visible("[data-title-bar-actions] [data-deploy-mark]")).startsWith(want.bar)
                && ids.every((id, index) => words(visible(`li[data-todo-id="${id}"]`)?.querySelector("[data-item-deploy]")) === want.rows[index]);
            },
            [expected, [...ITEMS]] as const,
            { timeout: 10_000 }
          )
          .catch(() => undefined);

        const now = await said(page);

        expect({ step, bar: now.bar.startsWith(expected.bar) ? expected.bar : now.bar, rows: now.rows }).toEqual({ step, ...expected });
      }
    } finally {
      await context.close();
    }
  }, 90_000);

  // The waiting mark reads in its info colour on the bar in either theme, and its popover lists each deployment in the
  // line by its unit, its commit's short hash and how long it has waited, in tabular figures; at phone width the mark
  // is the icon alone, its words in its name.
  for (const [width, height] of [[1280, 900], [360, 780]] as const) {
    for (const scheme of ["light", "dark"] as const) {
      test(`the line's mark and its list at ${width}px in ${scheme}`, async () => {
        const context = await signedIn({ viewport: { width, height }, colorScheme: scheme }, () => VIEWS[1]!);

        try {
          await context.addCookies([{ name: "nuxt-color-mode", value: scheme, url: origin! }]);

          const page = await context.newPage();

          await page.goto(`${origin}/`, { waitUntil: "load" });

          const mark = page.locator("[data-title-bar-actions] [data-deploy-mark]:visible").first();
          const words = `${LINE} · unit-c`;

          await page.waitForFunction((want) => [...document.querySelectorAll("[data-title-bar-actions] [data-deploy-mark]")].some((one) => one.getAttribute("aria-label") === want), words, { timeout: 10_000 });
          expect(await mark.getAttribute("aria-label")).toBe(words);

          await page.addScriptTag({ type: "module", content: `${measureSource()}\ninstall();` });
          await page.waitForFunction(() => "measure" in window);

          // The mark's colour, its words' and its icon's alike, against the bar it is drawn on: an icon drawn as a mask
          // paints its own ground in that colour, so the mark itself is what is read.
          const read = await page.evaluate(() => {
            const scope = window as unknown as { measure: typeof import("./measure") };

            return Math.max(0, ...scope.measure.contrast("[data-title-bar-actions] [data-deploy-mark]").map((one) => one.ratio));
          });

          expect(read).toBeGreaterThanOrEqual(4.5);

          await mark.click();

          const listed = page.locator("[data-deploy-line] [data-deploy-waiting]");

          await listed.first().waitFor({ timeout: 10_000 });

          const entry = await listed.first().evaluate((one) => ({
            words: [...one.querySelectorAll(":scope > span:not(.iconify)")].map((part) => part.textContent?.trim() ?? ""),
            figures: getComputedStyle(one.querySelector("span.tabular-nums")!).fontVariantNumeric
          }));

          expect(await listed.count()).toBe(1);
          expect(entry.words.slice(0, 2)).toEqual(["unit-c", COMMITS[1].slice(0, 12)]);
          expect(entry.words[2]).not.toBe("");
          expect(entry.figures).toContain("tabular-nums");
          // No run stands in the popover: the one that finished long ago is no part of it.
          expect(await page.locator("[data-deploy-stages]:visible").count()).toBe(0);
        } finally {
          await context.close();
        }
      }, 60_000);
    }
  }
});
