import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser } from "playwright-core";

// What a messenger sends besides words, drawn in a room (docs/web.md, the room screen): an album of three tall pictures
// filling its bubble's width with nothing bare at its end, an animated sticker played as its scene, an animation
// playing over and over without sound or a player, and a video standing in its bubble as the shared player's still. It
// drives the console tests/support/browser-console.ts stands up; the suite stands up no console, so there it skips.

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

  // A video stands as the shared player's still the way a picture stands (docs/web.md, the room screen's attachments
  // section): run to its bubble's edges with no corners or edge of its own, at its shape under the 20rem cap, its
  // length over its first frame and its file line in the inner room under it; a press opens the full player over the
  // screen, playing, and its closing leaves the conversation where it stood. A desktop in light, and a Galaxy S25
  // held upright in dark.
  for (const look of [
    { name: "a desktop in light", viewport: { width: 1280, height: 1000 }, scheme: "light", phone: false },
    { name: "a phone in dark", viewport: { width: 360, height: 780 }, scheme: "dark", phone: true }
  ] as const) {
    test(`a video stands in its bubble as a still and opens the full player, on ${look.name}`, async () => {
      const context = await browser!.newContext({
        viewport: look.viewport, colorScheme: look.scheme, isMobile: look.phone, hasTouch: look.phone, serviceWorkers: "block"
      });
      const at = cookie.indexOf("=");

      // The screen mode is the reader's choice, kept in its cookie, and a reader who never chose one reads dark.
      await context.addCookies([
        { name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! },
        { name: "nuxt-color-mode", value: look.scheme, url: origin! }
      ]);

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/rooms/${MEDIA_CHAT}`, { waitUntil: "load" });
        expect(await page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(look.scheme === "dark");
        await page.locator('[data-message="m12"] [data-video-length]').waitFor({ timeout: 30_000 });
        await page.locator('[data-message="m11"] [data-video-length]').waitFor({ timeout: 30_000 });

        const read = await page.evaluate(() => {
          const shown = (id: string) => {
            const row = document.querySelector(`[data-message="${id}"]`)!;
            const bubble = row.querySelector("[data-bubble]")!.getBoundingClientRect();
            const still = row.querySelector("[data-video-still]")!;
            const box = still.getBoundingClientRect();
            const frame = still.querySelector("[data-video-frame]")!.getBoundingClientRect();
            const line = row.querySelector("[data-attachment]")!.getBoundingClientRect();
            const look = getComputedStyle(still);

            return {
              flush: Math.max(Math.abs(box.left - bubble.left), Math.abs(box.right - bubble.right)),
              edged: look.borderTopWidth !== "0px" || look.borderTopLeftRadius !== "0px",
              cut: getComputedStyle(still.parentElement!).overflow === "hidden",
              bubble: Math.round(bubble.width),
              frame: { width: Math.round(frame.width), height: Math.round(frame.height) },
              lineInset: Math.round(line.left - bubble.left),
              lineUnder: line.top >= box.bottom,
              length: still.querySelector("[data-video-length]")!.textContent,
              mark: still.querySelector("[data-video-play]") !== null
            };
          };

          return { wide: shown("m11"), tall: shown("m12") };
        });

        for (const one of [read.wide, read.tall]) {
          expect(one.flush).toBeLessThanOrEqual(1);
          expect(one).toMatchObject({ edged: false, cut: true, lineInset: 12, lineUnder: true, length: "00:03", mark: true });
          expect(one.bubble).toBeLessThanOrEqual(320);
        }

        // The wide video fills its bubble at its own ratio; the tall one stands at the 20rem cap at its ratio.
        expect(read.wide.frame.width).toBe(read.wide.bubble);
        expect(Math.abs(read.wide.frame.height - (read.wide.frame.width * 9) / 16)).toBeLessThanOrEqual(1);
        expect(read.tall.frame).toEqual({ width: 180, height: 320 });

        const scroller = await page.evaluateHandle(() => {
          let at: HTMLElement | null = document.querySelector('[data-message="m11"]');

          while (at !== null && !/(auto|scroll)/.test(getComputedStyle(at).overflowY)) at = at.parentElement;

          return at!;
        });
        const still = page.locator('[data-message="m11"] [data-video-still]');

        // The press scrolls the still into view first, so the place is read once it stands there.
        await still.scrollIntoViewIfNeeded();
        const before = await scroller.evaluate((element) => element.scrollTop);

        if (look.phone) await still.tap();
        else await still.click();

        const dialog = page.getByRole("dialog", { name: "clip-wide.webm" });

        await dialog.locator("[data-video-player]").waitFor();
        await dialog.locator("video[data-player]").evaluate(
          (video: HTMLVideoElement) =>
            new Promise<void>((resolve, fail) => {
              const timer = setTimeout(() => fail(new Error("the full player did not start")), 10_000);
              const started = () => {
                clearTimeout(timer);
                resolve();
              };

              if (!video.paused) started();
              else video.addEventListener("playing", started, { once: true });
            })
        );

        if (look.phone) await page.goBack();
        else await page.keyboard.press("Escape");

        await dialog.waitFor({ state: "detached" });
        expect(new URL(page.url()).pathname).toEndWith(`/rooms/${MEDIA_CHAT}`);
        expect(await scroller.evaluate((element) => element.scrollTop)).toBe(before);
      } finally {
        await context.close();
      }
    }, 120_000);
  }
});
