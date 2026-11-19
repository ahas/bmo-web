import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, BrowserContext, Page } from "playwright-core";

// The Monitor screen's devices tab asks the console's own server once a second for one answer holding
// every machine's recorded reading, and no tile asks for its own (docs/web.md, 「Monitor screen」, 「How it
// reads」). So every tile stands at the same moment, and a machine whose record is slow or unreadable cannot
// hold another tile's request. A machine's own monitor still asks that machine.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up, and
// serves the node list, every machine and the live records through the page's own routes. What the page asked
// is read off its own resource timings, so nothing waits on a clock of the test's.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "monitor-polling", password: "fixture-password-2372" };
const NODES = Array.from({ length: 8 }, (_, at) => ({ name: `node-${at + 1}`, label: `Node ${at + 1}`, kind: "ssh", thisMachine: false, state: "connected", tone: "good", ownership: "shared", account: null }));

function reading(name: string): Record<string, unknown> {
  return {
    name,
    label: name === "local" ? "host-a" : name,
    kind: name === "local" ? "local" : "ssh",
    hardware: {
      host: name, kernel: "6.1", os: "Linux", hostOs: null, wsl: false, sensorLibrary: "ok", uptimeSeconds: 1000, load: [0.1, 0.2, 0.3],
      cpu: { model: "CPU", threadCount: 8, usage: 0.1, celsius: 40, limitCelsius: 90, mhz: 3000, peakMhz: 4000, watts: 30, chip: null, sensors: [] },
      memory: { usedKb: 1_000, totalKb: 8_000, share: 0.125, swapUsedKb: 0, swapTotalKb: 0, swapShare: 0 },
      gpus: [], storage: [], board: { sensors: [], fans: [] }, services: { running: 1, failed: [] }
    },
    failure: null,
    readAt: Math.floor(Date.now() / 1000),
    tracking: true,
    cpuLimit: null
  };
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

async function open(width = 1_280, height = 900): Promise<BrowserContext> {
  const context = await browser!.newContext({ viewport: { width, height }, serviceWorkers: "block", reducedMotion: "reduce" });
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
  // The development console loads modules by the hundred; the timings of every request must still be kept.
  await context.addInitScript(() => performance.setResourceTimingBufferSize(2_000));
  await context.route("**/api/nodes", (route) => route.fulfill({ json: NODES }));
  await context.route((url) => url.pathname.includes("/api/hardware/machines"), async (route) => {
    const rest = new URL(route.request().url()).pathname.split("/api/hardware/machines")[1] ?? "";

    if (rest === "" || rest === "/") return await route.fulfill({ json: ["local", ...NODES.map((one) => one.name)].map(reading) });
    if (rest.endsWith("/live")) return await route.fulfill({ json: { at: [], series: {} } });
    if (rest.endsWith("/history")) return await route.fulfill({ json: { at: [], pointSeconds: 5, series: {} } });

    return await route.fulfill({ json: reading(decodeURIComponent(rest.slice(1))) });
  });

  return context;
}

// The overview's one endpoint, and a machine asked by itself, as the page's own resource timings name them.
function askedFrom(page: Page, kind: "batch" | "machine"): Promise<number[]> {
  return page.evaluate((which) => {
    const wanted = performance.getEntriesByType("resource").filter((entry) => {
      const path = new URL(entry.name).pathname;
      const batch = path.endsWith("/api/hardware/machines") || path.endsWith("/api/hardware/machines/");

      return which === "batch" ? batch : path.includes("/api/hardware/machines/") && !batch && !path.endsWith("/live") && !path.endsWith("/history");
    });

    return wanted.map((entry) => entry.startTime).sort((a, b) => a - b);
  }, kind);
}

async function untilAsked(page: Page, kind: "batch" | "machine", count: number): Promise<void> {
  await page.waitForFunction(({ which, want }) => {
    return performance.getEntriesByType("resource").filter((entry) => {
      const path = new URL(entry.name).pathname;
      const batch = path.endsWith("/api/hardware/machines") || path.endsWith("/api/hardware/machines/");

      return which === "batch" ? batch : path.includes("/api/hardware/machines/") && !batch && !path.endsWith("/live") && !path.endsWith("/history");
    }).length >= want;
  }, { which: kind, want: count }, { timeout: 20_000 });
}

describe.skipIf(!origin || !touchReady())("the monitor's devices tab", () => {
  test("asks one answer for every machine each second, and no machine by itself", async () => {
    const context = await open();
    const page = await context.newPage();

    try {
      await page.goto(`${origin}/monitor`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.querySelectorAll("[data-machine-tile]").length === 9, undefined, { timeout: 30_000 });
      await untilAsked(page, "batch", 4);

      // The tile's live drawing is extended by the same recorded readings, not left on its opening fill.
      await page.waitForFunction(() => document.querySelectorAll("[data-machine-tile] figure svg path").length > 0, undefined, { timeout: 10_000 });
      expect(await page.locator("[data-machine-tile] figure svg path").count()).toBeGreaterThan(0);

      // Each piece stands on one line, its use and temperature after its name with a middle dot between, and the
      // memory bars take four parts of the row to the chip's one (docs/web.md, 「Monitor screen」).
      const first = page.locator("[data-machine-tile] [data-tile-pieces] li").first();
      const line = (await first.innerText()).replace(/\s+/g, " ").trim();

      expect(line).toMatch(/^CPU \d+% · \d+°C$/);
      // It is one line on the screen, its figures beside each other rather than stacked.
      expect((await first.boundingBox())!.height).toBeLessThan(28);

      const columns = await page.locator("[data-machine-tile] [data-tile-figures]").first().evaluate((row) => getComputedStyle(row).gridTemplateColumns.split(" ").map(parseFloat));

      expect(columns[0]! / columns[1]!).toBeGreaterThan(3.5);

      // With the chip narrow and no shares beside them, the memories' names and figures stand whole.
      const clipped = await page.locator("[data-machine-tile] [data-tile-figures] dl span").evaluateAll((all) => all.filter((one) => one.scrollWidth > one.clientWidth + 1).map((one) => one.textContent));

      expect(clipped).toEqual([]);

      const batch = await askedFrom(page, "batch");

      expect(await askedFrom(page, "machine")).toEqual([]);

      const gaps = batch.slice(1).map((at, index) => at - batch[index]!);
      const middle = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)]!;

      expect(middle).toBeGreaterThan(700);
      expect(middle).toBeLessThan(1_400);
    } finally {
      await context.close();
    }
  }, 120_000);

  test("stands every tile in one column on a phone", async () => {
    const context = await open(360, 780);
    const page = await context.newPage();

    try {
      await page.goto(`${origin}/monitor`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => document.querySelectorAll("[data-machine-tile]").length === 9, undefined, { timeout: 30_000 });

      const boxes = await page.locator("[data-machine-tile]").evaluateAll((all) => all.map((one) => {
        const box = one.getBoundingClientRect();

        return { left: Math.round(box.left), right: Math.round(box.right) };
      }));

      // One column: every tile shares the left edge, and none reaches past the screen.
      expect(new Set(boxes.map((one) => one.left)).size).toBe(1);
      expect(boxes.every((one) => one.right <= 360)).toBe(true);
    } finally {
      await context.close();
    }
  }, 120_000);

  test("a machine's own monitor still asks that machine every second", async () => {
    const context = await open();
    const page = await context.newPage();

    try {
      await page.goto(`${origin}/monitor/node-1`, { waitUntil: "domcontentloaded" });
      await untilAsked(page, "machine", 3);

      expect(await askedFrom(page, "batch")).toEqual([]);
    } finally {
      await context.close();
    }
  }, 120_000);
});
