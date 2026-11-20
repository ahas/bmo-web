import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";

import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, BrowserContext, Page, Route } from "playwright-core";

// The monitor's node list, a node's ownership and the monitor watching the monitored nodes alone (docs/web.md,
// 「Monitor screen」 and 「The node list」), at a desk's width and a phone's. Every node is shared or personal; a personal
// node that is merely off stands in the neutral grey, a personal node not monitored has no tile on the devices tab and
// its own screen asks for no reading, and a monitored one's tile and its own screen's system card name its owner, a
// skeleton holding the owner's place while the names are read and a failed read of them said once on each screen. The
// administrator sets a node's ownership from its screen, and the node service's refusal stands in the dialog.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up, and serves
// the node list, the users and the machines through the page's own routes. Nothing waits on a clock of the test's.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "monitor-nodes", password: "fixture-password-3688" };
const WIDTHS = [
  { name: "desk", width: 1_280, height: 900 },
  { name: "phone", width: 360, height: 780 }
] as const;

interface NodeRow {
  name: string;
  label: string;
  kind: "ssh" | "hub";
  thisMachine: boolean;
  connected: boolean;
  state: string;
  tone: "good" | "bad" | "unknown";
  ownership: "shared" | "personal";
  account: string | null;
  monitored: boolean;
}

// A shared node is always monitored; a personal one where its account is one the node service is set to monitor.
function node(name: string, kind: NodeRow["kind"], state: string, tone: NodeRow["tone"], account: string | null = null, monitored = account === null): NodeRow {
  return { name, label: name, kind, thisMachine: false, connected: state === "connected", state, tone, ownership: account === null ? "shared" : "personal", account, monitored };
}

const NODES: NodeRow[] = [
  node("pc-a", "ssh", "connected", "good"),
  node("pc-b", "hub", "error", "bad"),
  node("own-a", "hub", "disconnected", "unknown", "2"),
  node("own-b", "hub", "connected", "good", "99"),
  node("own-c", "hub", "connected", "good", "2", true)
];
const USERS = [{ user: "2", name: "tester", fullName: "Test Person", administrator: false }];
const MONITORED = NODES.filter((one) => one.monitored).map((one) => one.name);

function reading(name: string): Record<string, unknown> {
  return {
    name,
    label: name === "local" ? "host-a" : name,
    kind: name === "local" ? "local" : "ssh",
    hardware: null,
    failure: null,
    readAt: Math.floor(Date.now() / 1000),
    tracking: false,
    cpuLimit: null
  };
}

// What the page sent the node service's change, and the machines that answer as none, which a test may add to. A
// context opened with the users held answers them only once `releaseUsers` is called, and one opened with them failing
// answers them 500.
interface Served {
  changes: unknown[];
  refuseNext: boolean;
  missing: Set<string>;
  machineAsks: string[];
  releaseUsers: () => void;
}

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

async function open(width: number, height: number, users: "answer" | "hold" | "fail" = "answer"): Promise<{ context: BrowserContext; served: Served }> {
  const context = await browser!.newContext({ viewport: { width, height }, serviceWorkers: "block", reducedMotion: "reduce" });
  const at = cookie.indexOf("=");
  const held = Promise.withResolvers<void>();
  const served: Served = { changes: [], refuseNext: false, missing: new Set(NODES.filter((one) => !one.monitored).map((one) => one.name)), machineAsks: [], releaseUsers: held.resolve };

  if (users !== "hold") held.resolve();
  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
  await context.route("**/api/nodes", (route) => route.fulfill({ json: NODES }));
  await context.route("**/api/users", async (route) => {
    if (users === "fail") return await route.fulfill({ status: 500, json: { statusCode: 500, message: "users down" } });
    await held.promise;
    await route.fulfill({ json: USERS });
  });
  await context.route((url) => url.pathname.includes("/api/nodes/"), async (route: Route) => {
    const request = route.request();

    if (request.method() !== "PATCH") return await route.fallback();

    served.changes.push(request.postDataJSON());

    if (served.refuseNext) {
      served.refuseNext = false;

      return await route.fulfill({ status: 422, json: { statusCode: 422, message: "refused by the node service" } });
    }

    const name = decodeURIComponent(new URL(request.url()).pathname.split("/").at(-1)!);
    const change = request.postDataJSON() as { ownership: NodeRow["ownership"]; account: string | null };

    return await route.fulfill({ json: { ...NODES.find((one) => one.name === name)!, ...change, monitored: change.ownership === "shared" } });
  });
  await context.route((url) => url.pathname.includes("/api/hardware/machines"), async (route) => {
    const rest = new URL(route.request().url()).pathname.split("/api/hardware/machines")[1] ?? "";

    if (rest === "" || rest === "/") return await route.fulfill({ json: ["local", ...MONITORED].filter((one) => !served.missing.has(one)).map(reading) });
    if (rest.endsWith("/live")) return await route.fulfill({ json: { at: [], series: {} } });
    if (rest.endsWith("/history")) return await route.fulfill({ json: { at: [], pointSeconds: 5, series: {} } });

    const name = decodeURIComponent(rest.slice(1));

    served.machineAsks.push(name);

    if (served.missing.has(name)) return await route.fulfill({ status: 404, json: { statusCode: 404, message: "no machine" } });

    return await route.fulfill({ json: reading(name) });
  });

  return { context, served };
}

async function dotColour(page: Page, name: string): Promise<string> {
  return await page.locator(`[data-node-row="${name}"]`).locator("xpath=ancestor::tr").locator("[data-node-dot]").evaluate((dot) => getComputedStyle(dot).backgroundColor);
}

describe.skipIf(!origin || !touchReady())("the monitor's node list", () => {
  for (const size of WIDTHS) {
    test(`shows each node's ownership and owner, draws an unknown tone grey and filters by ownership (${size.name})`, async () => {
      const { context } = await open(size.width, size.height);
      const page = await context.newPage();

      try {
        await page.goto(`${origin}/monitor?tab=nodes`, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => document.querySelectorAll("[data-node-row]").length === 5, undefined, { timeout: 30_000 });

        const ownerships = await page.locator("[data-node-ownership]").evaluateAll((cells) => cells.map((cell) => cell.getAttribute("data-node-ownership")));

        expect(ownerships).toEqual(["shared", "shared", "personal", "personal", "personal"]);

        // A personal node's account goes by its person's name, and one no user holds still names its id.
        await page.waitForFunction(() => document.querySelector('[data-node-account="2"]')?.textContent?.includes("Test Person") === true, undefined, { timeout: 10_000 });
        expect(await page.locator('[data-node-account="99"]').innerText()).toContain("99");
        expect((await page.locator('[data-node-account=""]').allInnerTexts()).every((text) => text.trim() === "")).toBe(true);

        // A personal node merely off is the neutral grey, never the failure's colour.
        const unknown = await dotColour(page, "own-a");

        expect(unknown).not.toBe(await dotColour(page, "pc-b"));
        expect(unknown).not.toBe(await dotColour(page, "pc-a"));

        // The filter stands in the tab row, which keeps one row's height on a phone and runs off no edge.
        const row = await page.locator("[data-ownership-filter]").evaluate((filter) => {
          const bar = filter.closest("div.h-12")!.getBoundingClientRect();
          const own = filter.getBoundingClientRect();

          return { barHeight: bar.height, right: own.right, width: document.documentElement.clientWidth };
        });

        expect(row.barHeight).toBe(48);
        expect(row.right).toBeLessThanOrEqual(row.width);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

        await page.locator("[data-ownership-filter]").click();
        await page.getByRole("option").nth(2).click();
        await page.waitForFunction(() => document.querySelectorAll("[data-node-row]").length === 3, undefined, { timeout: 10_000 });
        expect(new URL(page.url()).searchParams.get("ownership")).toBe("personal");
        expect(await page.locator("[data-node-row]").evaluateAll((rows) => rows.map((one) => one.getAttribute("data-node-row")))).toEqual(["own-a", "own-b", "own-c"]);
      } finally {
        await context.close();
      }
    }, 60_000);

    test(`sets a personal node shared from its screen, the refusal kept in the dialog, and asks no reading of it (${size.name})`, async () => {
      const { context, served } = await open(size.width, size.height);
      const page = await context.newPage();

      try {
        await page.goto(`${origin}/monitor/own-a`, { waitUntil: "domcontentloaded" });
        await page.locator("[data-node-unmonitored]").waitFor({ timeout: 30_000 });
        await page.locator("[data-node-ownership-section]").waitFor({ timeout: 10_000 });
        expect(await page.locator("[data-machine-monitor]").count()).toBe(0);
        // Its screen never asked the node service for a reading of it.
        expect(served.machineAsks.filter((one) => one === "own-a")).toEqual([]);

        await page.locator("[data-node-ownership-edit]").click();
        const dialog = page.getByRole("dialog");

        await dialog.waitFor();
        // Opened untouched, the save waits for a change.
        expect(await page.locator("[data-node-ownership-save]").isDisabled()).toBe(true);

        await dialog.getByRole("radio").first().click();
        served.refuseNext = true;
        await page.locator("[data-node-ownership-save]").click();
        await page.locator("[data-node-ownership-refusal]").waitFor({ timeout: 10_000 });
        expect(await dialog.isVisible()).toBe(true);
        expect(await page.locator("[data-node-ownership-refusal]").innerText()).toContain("refused by the node service");

        await page.locator("[data-node-ownership-save]").click();
        await dialog.waitFor({ state: "hidden", timeout: 10_000 });
        expect(served.changes).toEqual([{ ownership: "shared", account: null }, { ownership: "shared", account: null }]);
      } finally {
        await context.close();
      }
    }, 60_000);

    test(`the devices tab and its own screen name a monitored personal node's owner, there is no tile for another personal node, and a machine gone from its screen gives way to a line (${size.name})`, async () => {
      const { context, served } = await open(size.width, size.height, "hold");
      const page = await context.newPage();

      try {
        await page.goto(`${origin}/monitor`, { waitUntil: "domcontentloaded" });
        await page.waitForFunction((want) => document.querySelectorAll("[data-machine-tile]").length === want, 1 + MONITORED.length, { timeout: 30_000 });

        // While the names are read the owner's place is a skeleton as tall as the badge it gives way to.
        const waiting = await page.locator("[data-machine-owner-loading]").evaluate((skeleton) => [skeleton.previousElementSibling!.getBoundingClientRect().height, skeleton.getBoundingClientRect().height]);

        expect(waiting[1]).toBe(waiting[0]!);
        served.releaseUsers();

        const tiles = await page.locator("[data-machine-tile]").evaluateAll((all) => all.map((tile) => tile.textContent ?? ""));

        expect(tiles.filter((text) => text.includes("own-"))).toHaveLength(1);
        expect(tiles.some((text) => text.includes("own-a") || text.includes("own-b"))).toBe(false);
        // The administrator reads every user's name, so the owner is named by their person's name.
        await page.waitForFunction(() => document.querySelector("[data-machine-owner]")?.textContent?.includes("Test Person") === true, undefined, { timeout: 10_000 });
        expect(await page.locator("[data-machine-owner]").count()).toBe(1);

        // It stands beside the connection type as one more badge of the same height on the same line, inside its tile.
        const badges = await page.locator("[data-machine-owner]").evaluate((owner) => {
          const kind = owner.previousElementSibling!.getBoundingClientRect();
          const own = owner.getBoundingClientRect();
          const tile = owner.closest("[data-machine-tile]")!.getBoundingClientRect();

          return { kind: [kind.top, kind.height], own: [own.top, own.height], inside: own.right <= tile.right };
        });

        expect(badges.own).toEqual(badges.kind);
        expect(badges.inside).toBe(true);

        // Its own screen's system card names the owner as a fact of its own, the node being untracked, inside the card.
        await page.goto(`${origin}/monitor/own-c`, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => [...document.querySelectorAll("[data-machine-monitor] dd")].some((fact) => fact.textContent?.includes("Test Person")), undefined, { timeout: 30_000 });

        const fact = await page.locator("[data-machine-monitor] dd", { hasText: "Test Person" }).evaluate((value) => {
          const card = value.closest("dl")!.parentElement!.getBoundingClientRect();
          const own = value.getBoundingClientRect();

          return { facts: value.closest("dl")!.querySelectorAll("dd").length, inside: own.left >= card.left && own.right <= card.right };
        });

        expect(fact).toEqual({ facts: 1, inside: true });

        await page.goto(`${origin}/monitor/pc-a`, { waitUntil: "domcontentloaded" });
        await page.locator("[data-machine-monitor]").waitFor({ timeout: 30_000 });
        await page.waitForFunction(() => document.querySelector("[data-node-unmonitored]") === null, undefined, { timeout: 10_000 });
        // A shared node has no owner, so once its reading has come its untracked system card holds no fact.
        await page.locator("[data-machine-monitor] [role=switch]").waitFor({ timeout: 10_000 });
        expect(await page.locator("[data-machine-monitor] dl").count()).toBe(0);

        // The node service stops knowing it as a machine, as it does a node made personal: the cards give way to the line.
        served.missing.add("pc-a");
        await page.locator("[data-node-unmonitored]").waitFor({ timeout: 20_000 });
        expect(await page.locator("[data-machine-monitor]").count()).toBe(0);
      } finally {
        await context.close();
      }
    }, 60_000);

    test(`a failed read of the names is said once above the tiles and under the owner on its screen (${size.name})`, async () => {
      const { context } = await open(size.width, size.height, "fail");
      const page = await context.newPage();

      try {
        await page.goto(`${origin}/monitor`, { waitUntil: "domcontentloaded" });
        await page.locator("[data-owner-names-failed]").waitFor({ timeout: 30_000 });

        // One line above the tiles, the tile naming the personal node alone.
        const said = await page.locator("[data-owner-names-failed]").evaluate((line) => ({
          text: line.textContent,
          aboveTiles: [...document.querySelectorAll("[data-machine-tile]")].every((tile) => tile.getBoundingClientRect().top >= line.getBoundingClientRect().bottom)
        }));

        expect(said).toEqual({ text: wording("hardware.error.users_failed"), aboveTiles: true });
        expect(await page.locator("[data-owner-names-failed]").count()).toBe(1);
        expect(await page.locator("[data-machine-owner]").innerText()).toBe(wording("hardware.label.ownership_personal_node"));

        await page.goto(`${origin}/monitor/own-c`, { waitUntil: "domcontentloaded" });
        await page.locator("[data-machine-monitor] [data-fact-failure]").waitFor({ timeout: 30_000 });

        const fact = await page.locator("[data-fact-failure]").evaluate((reason) => {
          const value = reason.closest("dd")!;
          const card = value.closest("dl")!.parentElement!.getBoundingClientRect();

          return { value: value.firstChild!.textContent!.trim(), reason: reason.textContent, inside: reason.getBoundingClientRect().right <= card.right };
        });

        expect(fact).toEqual({ value: wording("hardware.label.ownership_personal_node"), reason: wording("hardware.error.users_failed"), inside: true });
      } finally {
        await context.close();
      }
    }, 60_000);
  }
});
