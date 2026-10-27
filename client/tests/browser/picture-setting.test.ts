import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser } from "playwright-core";

// A picture set in the console (docs/web.md, 「Profile photos」): one's own in the account settings and a room's from the room's
// menu, each a file picked, shown in its place, saved to the receiver's kept pictures through the relay, and cleared
// back to the provider's. The receiver's answers are served through the page's own routes. It drives the console
// tests/support/browser-console.ts stands up; the suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "pictures", password: "fixture-password-2262" };
const RECORD_CHAT = -9_000_000_000_099;
// One grey pixel.
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNoAAAAggCBd81ytgAAAABJRU5ErkJggg==", "base64");

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

describe.skipIf(!origin || !touchReady())("a picture set in the console", () => {
  for (const [width, height, phone] of [[1280, 900, false], [360, 780, true]] as const) {
    test(`is picked, shown, saved and cleared, for oneself and for a room, ${width}px wide`, async () => {
      const context = await browser!.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, serviceWorkers: "block", reducedMotion: "reduce" });
      const at = cookie.indexOf("=");
      const asked: string[] = [];

      await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
      await context.route(/\/api\/receiver\/avatars\//, async (route) => {
        const request = route.request();

        asked.push(`${request.method()} ${new URL(request.url()).pathname.replace(/^.*\/api\/receiver/, "")}`);
        await route.fulfill({ json: { items: [] } });
      });

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/live?settings=account`, { waitUntil: "load" });

        const own = page.locator("[data-picture-setting='person']");

        await own.waitFor({ timeout: 30_000 });
        await own.locator("input[type=file]").setInputFiles({ name: "me.png", mimeType: "image/png", buffer: PIXEL });
        await own.locator("[data-picture-save]").click();
        await page.getByText(wording("picture.message.saved")).waitFor({ timeout: 10_000 });
        await own.locator("[data-picture-clear]").click();
        await page.getByText(wording("picture.message.cleared")).waitFor({ timeout: 10_000 });

        await page.goto(`${origin}/rooms/${RECORD_CHAT}`, { waitUntil: "load" });
        await page.locator("[data-message]").first().waitFor({ timeout: 30_000 });
        await page.getByRole("button", { name: wording("common.action.more") }).first().click();
        await page.getByRole("menuitem", { name: wording("picture.action.set_room") }).click();

        const room = page.locator("[data-picture-setting='room']");

        await room.waitFor({ timeout: 10_000 });
        await room.locator("input[type=file]").setInputFiles({ name: "room.png", mimeType: "image/png", buffer: PIXEL });
        await room.locator("[data-picture-save]").click();
        await page.getByText(wording("picture.message.saved")).waitFor({ timeout: 10_000 });

        expect(asked).toEqual(["PUT /avatars/person/1", "DELETE /avatars/person/1", `PUT /avatars/room/${RECORD_CHAT}`]);
      } finally {
        await context.close();
      }
    }, 90_000);
  }
});
