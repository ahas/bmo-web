import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, BrowserContext, Page } from "playwright-core";

// The console's one order of layers (docs/web.md, 「Floating things」, the layers): with a dialog open, the sidebar
// lies under its shade and a press over the sidebar lands on the shade, never on a sidebar row; and the briefing's
// player, tried from the settings dialog, stands over that dialog, so a press on it reaches it. What is read is what
// the browser draws at a point, `elementFromPoint`, never a component's state. A desktop's width and a phone's. It
// drives the console tests/support/browser-console.ts stands up; the suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "layers", password: "fixture-password-3377" };
const SCREENS = [
  { width: 1280, height: 800, phone: false },
  { width: 360, height: 780, phone: true }
] as const;

let browser: Browser | null = null;
let cookie = "";

beforeAll(async () => {
  if (!origin || !touchReady()) return;

  const login = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ACCOUNT) });

  expect(login.ok).toBe(true);
  cookie = login.headers.get("set-cookie")!.split(";")[0]!;
  browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();
}, BROWSER_HOOK_MS);

async function open(screen: (typeof SCREENS)[number]): Promise<BrowserContext> {
  const context = await browser!.newContext({ viewport: { width: screen.width, height: screen.height }, isMobile: screen.phone, hasTouch: screen.phone, serviceWorkers: "block", reducedMotion: "reduce" });
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
  await context.route(/\/api\/events(\?|$)/, (route) => route.fulfill({ contentType: "text/event-stream", body: `retry: 60000\n\nevent: run\ndata: {"run":"fixture"}\n\n` }));

  return context;
}

// What the browser draws on top at a point: the dialog or its shade, the briefing's player, or something else, named.
async function topAt(page: Page, x: number, y: number): Promise<string> {
  return page.evaluate(([px, py]) => {
    const hit = document.elementFromPoint(px!, py!);

    if (hit === null) return "nothing";
    if (hit.closest("[data-briefing-popup]")) return "player";
    if (hit.closest("[role=dialog], [data-slot=overlay]")) return "sheet";

    return `${hit.tagName.toLowerCase()}#${hit.closest("[id]")?.id ?? ""}`;
  }, [x, y]);
}

describe.skipIf(!origin || !touchReady())("the layers", () => {
  test("a dialog's shade lies over the sidebar, so a press there reaches no sidebar row", async () => {
    const context = await open(SCREENS[0]);

    try {
      const page = await context.newPage();

      // The settings dialog, which every account opens.
      await page.goto(`${origin}/?settings=briefing`, { waitUntil: "load" });

      const sidebar = page.locator("#console-sidebar-default");

      await sidebar.waitFor({ timeout: 20_000 });
      await page.locator("[role=dialog]").first().waitFor({ timeout: 10_000 });

      const box = (await sidebar.boundingBox())!;

      for (const [x, y] of [
        [box.x + 20, box.y + 20],
        [box.x + box.width / 2, box.y + box.height / 2],
        [box.x + 20, box.y + box.height - 20]
      ] as const) {
        expect({ x, y, top: await topAt(page, x, y) }).toEqual({ x, y, top: "sheet" });
      }
    } finally {
      await context.close();
    }
  }, 90_000);

  for (const screen of SCREENS) {
    test(`the briefing tried from the settings dialog plays over that dialog at ${screen.width}px`, async () => {
      const context = await open(screen);

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/?settings=briefing`, { waitUntil: "load" });

        const trial = page.locator("[data-briefing-trial]");

        await trial.waitFor({ timeout: 20_000 });
        await trial.click();

        const player = page.locator("[data-briefing-popup]");

        await player.waitFor({ timeout: 10_000 });
        await page.locator("[role=dialog]").first().waitFor({ timeout: 10_000 });

        const box = (await player.boundingBox())!;
        const x = box.x + box.width / 2;
        const y = box.y + box.height / 2;

        expect({ top: await topAt(page, x, y) }).toEqual({ top: "player" });

        // A press on its close mark reaches it and takes it down, the dialog still standing.
        await player.getByRole("button").last().click();
        await player.waitFor({ state: "detached", timeout: 10_000 });
        expect(await page.locator("[role=dialog]").count()).toBeGreaterThan(0);
      } finally {
        await context.close();
      }
    }, 90_000);
  }
});
