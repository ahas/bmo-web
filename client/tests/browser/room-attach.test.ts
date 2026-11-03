import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, BrowserContext } from "playwright-core";

// A file goes into a room through the input box's clip (docs/web.md, the room screen's input box), in every room — a room
// the console made among them, where the words never leave this machine. It drives the console given in
// BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up, serving the room's messages and the attach
// route through the page's own routes.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "room-attach", password: "fixture-password-2364" };
// The room the harness keeps on this machine's own record — the road a room the console made takes: its words never
// leave the machine, and a file goes in the same way.
const CHAT = -9_000_000_000_099;
const NOW = 1_800_000_000_000;

// Whether what is read comes to hold within the time given.
async function until<T>(read: () => Promise<T>, holds: (value: T) => boolean, ms = 15_000): Promise<boolean> {
  const end = Date.now() + ms;

  while (Date.now() < end) {
    if (holds(await read())) return true;

    await Bun.sleep(150);
  }

  return false;
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

async function open(width: number, height: number): Promise<{ context: BrowserContext }> {
  const context = await browser!.newContext({ viewport: { width, height }, serviceWorkers: "block", reducedMotion: "reduce" });
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

  return { context };
}

describe.skipIf(!origin || !touchReady())("a file into a room kept on this machine's own record", () => {
  for (const [width, height] of [[1280, 900], [360, 780]] as const) {
    test(`goes in through the clip at ${width}, and no microphone stands beside it`, async () => {
      const { context } = await open(width, height);
      const page = await context.newPage();

      try {
        await page.goto(`${origin}/rooms/${CHAT}`, { waitUntil: "domcontentloaded" });
        await page.locator("textarea").first().waitFor({ timeout: 30_000 });

        // The clip is offered here, and the two buttons are not.
        const clip = page.locator(`button[aria-label="${wording("room.action.attach_file")}"]`).first();

        await clip.waitFor({ timeout: 20_000 });
        // No microphone stands beside it.
        expect(await page.locator('button[aria-label] .i-material-symbols\\:mic').count()).toBe(0);

        // The room settles before the box is used, as a reader finds it.
        await page.waitForTimeout(2_000);

        // The clip's own picker takes the file, which comes into the box.
        await page.locator("[data-attach-picker]").setInputFiles({ name: "report.txt", mimeType: "text/plain", buffer: Buffer.from("the room's file\n") });


        // The box takes the file: it stands in the box with the words that would go beside it.
        expect(await until(async () => await page.locator("[data-picked]").count(), (n) => n > 0)).toBe(true);
        expect((await page.locator("[data-picked]").first().innerText()).trim()).toContain("report.txt");
        await page.screenshot({ path: `/tmp/room-attach-${width}.png` });
      } finally {
        await context.close();
      }
    }, 120_000);
  }
});
