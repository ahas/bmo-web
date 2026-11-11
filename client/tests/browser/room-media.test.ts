import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser } from "playwright-core";

// What a messenger sends besides words, drawn in a room (docs/web.md, the room screen): an album of three tall pictures
// filling its bubble's width with nothing bare at its end, an animated sticker played as its scene, and an animation
// playing over and over without sound or a player. It drives the console tests/support/browser-console.ts stands up;
// the suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "pictures", password: "fixture-password-2262" };
const MEDIA_CHAT = 44;

let browser: Browser | null = null;
let cookie = "";

beforeAll(async () => {
  if (!origin || !touchReady()) return;

  const login = await fetch(`${origin}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(ACCOUNT) });

  expect(login.ok).toBe(true);
  cookie = login.headers.get("set-cookie")!.split(";")[0]!;
  browser = await chromium.launch({ args: ["--use-angle=swiftshader"] });
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();
}, BROWSER_HOOK_MS);

describe.skipIf(!origin || !touchReady())("a room's media", () => {
  test("an album of tall pictures fills its bubble, a sticker plays as its scene and an animation loops silently", async () => {
    const context = await browser!.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: "block" });
    const at = cookie.indexOf("=");

    await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

    try {
      const page = await context.newPage();

      await page.goto(`${origin}/rooms/${MEDIA_CHAT}`, { waitUntil: "load" });
      await page.locator("[data-album] img").first().waitFor({ timeout: 30_000 });
      await page.locator("[data-sticker-animated] svg").waitFor({ timeout: 30_000 });

      const read = await page.evaluate(() => {
        const album = document.querySelector("[data-album]")!;
        const right = (el: Element) => el.getBoundingClientRect().right;
        const cells = [...album.querySelectorAll(":scope > div")];
        const video = document.querySelector("video[data-animation]") as HTMLVideoElement | null;

        return {
          bare: Math.round(right(album) - Math.max(...cells.map(right))),
          animation: video === null ? null : { autoplay: video.autoplay, loop: video.loop, muted: video.muted, controls: video.controls }
        };
      });

      expect(read.bare).toBeLessThanOrEqual(1);
      expect(read.animation).toEqual({ autoplay: true, loop: true, muted: true, controls: false });

      // Reactions stand on the time's line, each with its reactors' faces while they are few.
      const reactions = await page.evaluate(() => {
        const chip = document.querySelector("[data-reaction]")!;

        return {
          onMetaLine: chip.closest("[data-meta]")?.querySelector("[data-clock]") != null,
          faces: [...document.querySelectorAll("[data-reaction-faces]")].map((faces) => faces.children.length)
        };
      });

      expect(reactions).toEqual({ onMetaLine: true, faces: [2, 1] });

      // A message deleted on the messenger opens its words on a press.
      await page.locator("button[data-deleted]").click();
      await expect(page.locator("[data-deleted-words]").innerText()).resolves.toBe("words deleted on the messenger");
    } finally {
      await context.close();
    }
  }, 120_000);
});
