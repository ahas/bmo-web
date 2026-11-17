import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, BrowserContext, Page } from "playwright-core";

// Every sticker and emoticon stands as the picture alone, with no bubble, and a moving one plays over and over past
// the count its own file holds, or stands still on its first frame where the reader asked for less movement
// (docs/web.md, the room screen's wordless messages). The room holds a still sticker, a video sticker, a moving emoticon kept as the
// message's picture whose file plays it once, a GIF sticker that plays once, the emoticon sent with words, an
// animated sticker's scene, and the emoticon sent with a word by the reader, on the right. It drives the console tests/support/browser-console.ts stands up; the suite stands up no
// console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "stickers", password: "fixture-password-3303" };
const STICKER_CHAT = 45;
// The rows by what each sticker is.
const STILL = "m1";
const VIDEO = "m2";
const EMOTICON = "m3";
const GIF = "m4";
const WORDED = "m5";
const SCENE = "m6";
const OWN = "m7";
// How long the browser is given to play what plays: a short clip and a one-second scene play through in far less.
const PLAYED_MS = 15_000;

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

// The sticker room opened in a context of its own, every picture of it drawn.
async function opened(context: BrowserContext): Promise<Page> {
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

  const page = await context.newPage();

  await page.goto(`${origin}/rooms/${STICKER_CHAT}`, { waitUntil: "load" });
  await page.locator(`[data-message="${SCENE}"] [data-sticker-animated] svg`).waitFor({ timeout: 30_000 });
  await page.waitForFunction(
    (rows) => rows.every((row) => {
      const img = document.querySelector<HTMLImageElement>(`[data-message="${row}"] [data-sticker] img`);

      return img !== null && img.complete && img.naturalWidth > 0;
    }),
    [STILL, EMOTICON, GIF, WORDED, OWN],
    { timeout: 30_000 }
  );

  return page;
}

// How the browser reads each sticker picture it was served: how many frames it holds and how many times it repeats.
function servedPictures(page: Page): Promise<Record<string, { frames: number; repeats: number }>> {
  return page.evaluate(async (rows) => {
    const read = async (row: string) => {
      const img = document.querySelector<HTMLImageElement>(`[data-message="${row}"] [data-sticker] img`)!;
      const answer = await fetch(img.currentSrc);
      const decoder = new ImageDecoder({ data: answer.body!, type: answer.headers.get("content-type")! });

      await decoder.tracks.ready;

      const track = decoder.tracks.selectedTrack!;

      await decoder.completed;

      const served = { frames: track.frameCount, repeats: track.repetitionCount };

      decoder.close();

      return [row, served] as const;
    };

    return Object.fromEntries(await Promise.all(rows.map(read)));
  }, [STILL, EMOTICON, GIF, WORDED]);
}

// The scene's drawing now, which changes from frame to frame while it plays.
function sceneDrawn(page: Page): Promise<string> {
  return page.evaluate((row) => document.querySelector(`[data-message="${row}"] [data-sticker-animated] svg`)!.innerHTML, SCENE);
}

describe.skipIf(!origin || !touchReady())("a room's stickers", () => {
  test("every sticker stands as the picture alone and a moving one plays on past its own count", async () => {
    const context = await browser!.newContext({ viewport: { width: 1280, height: 1000 }, serviceWorkers: "block" });

    try {
      const page = await opened(context);

      // No sticker stands in a bubble or on any ground; the words sent with one stand in a bubble of their own a run's
      // step under it, holding to its edge on the side the message stands on.
      const stood = await page.evaluate(
        ({ rows, worded }) => {
          const grounded = (row: string) => {
            const message = document.querySelector(`[data-message="${row}"]`)!;
            const grounds: string[] = [];

            for (let part = message.querySelector("[data-sticker]")!.parentElement; part !== null && part !== message; part = part.parentElement) {
              const look = getComputedStyle(part);

              if (look.backgroundColor !== "rgba(0, 0, 0, 0)" || look.borderTopWidth !== "0px") grounds.push(look.backgroundColor);
            }

            return grounds.length > 0;
          };
          const under = (row: string) => {
            const message = document.querySelector(`[data-message="${row}"]`)!;
            const sticker = message.querySelector("[data-sticker]")!.getBoundingClientRect();
            const bubble = message.querySelector("[data-words]")!.closest(".chat-bubble")!.getBoundingClientRect();

            return { step: Math.round(bubble.top - sticker.bottom), start: Math.round(bubble.left - sticker.left), end: Math.round(bubble.right - sticker.right) };
          };
          const step = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--chat-message-gap"));
          const theirs = under(worded[0]!);
          const own = under(worded[1]!);

          return {
            grounded: rows.filter(grounded),
            steps: [theirs.step === step, own.step === step],
            leading: theirs.start,
            trailing: own.end
          };
        },
        { rows: [STILL, VIDEO, EMOTICON, GIF, WORDED, SCENE, OWN], worded: [WORDED, OWN] }
      );

      expect(stood).toEqual({ grounded: [], steps: [true, true], leading: 0, trailing: 0 });

      // The moving pictures, each kept playing once, are served repeating forever; the still one holds one frame.
      const served = await servedPictures(page);

      expect(served[STILL]!.frames).toBe(1);

      for (const row of [EMOTICON, GIF, WORDED]) {
        expect(served[row]!.frames).toBeGreaterThan(1);
        expect(served[row]!.repeats).toBe(Infinity);
      }

      // The video sticker plays muted and inline, and starts over at its end: its frames' media time runs back twice.
      // The browser plays a muted video only while it is in view, as it is wherever a reader reads it.
      const video = page.locator(`[data-message="${VIDEO}"] video[data-sticker-video]`);

      await video.scrollIntoViewIfNeeded();

      expect(await video.evaluate((one: HTMLVideoElement) => ({ loop: one.loop, muted: one.muted, inline: one.playsInline, controls: one.controls })))
        .toEqual({ loop: true, muted: true, inline: true, controls: false });
      await video.evaluate((one: HTMLVideoElement) => {
        let last = -1;
        const seen = (_now: number, frame: VideoFrameCallbackMetadata): void => {
          if (frame.mediaTime < last) one.dataset.wraps = String(Number(one.dataset.wraps ?? 0) + 1);
          last = frame.mediaTime;
          one.requestVideoFrameCallback(seen);
        };

        one.requestVideoFrameCallback(seen);
      });
      await page.waitForFunction(
        (row) => Number(document.querySelector<HTMLVideoElement>(`[data-message="${row}"] video`)!.dataset.wraps ?? 0) >= 2,
        VIDEO,
        { timeout: PLAYED_MS }
      );

      // The animated sticker's scene plays: its drawing changes.
      const first = await sceneDrawn(page);

      await page.waitForFunction(
        ({ row, drawn }) => document.querySelector(`[data-message="${row}"] [data-sticker-animated] svg`)!.innerHTML !== drawn,
        { row: SCENE, drawn: first },
        { timeout: PLAYED_MS }
      );
    } finally {
      await context.close();
    }
  }, 120_000);

  test("a reader who asked for less movement sees every sticker still on its first frame, on a phone", async () => {
    const context = await browser!.newContext({
      viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true, reducedMotion: "reduce", serviceWorkers: "block"
    });

    try {
      const page = await opened(context);
      const served = await servedPictures(page);

      for (const row of [STILL, EMOTICON, GIF, WORDED]) {
        expect(served[row]!.frames).toBe(1);
      }

      // The video sticker is not started and shows its first frame.
      const video = page.locator(`[data-message="${VIDEO}"] video[data-sticker-video]`);

      await page.waitForFunction((row) => document.querySelector<HTMLVideoElement>(`[data-message="${row}"] video`)!.readyState >= 2, VIDEO, { timeout: 30_000 });
      expect(await video.evaluate((one: HTMLVideoElement) => ({ paused: one.paused, at: one.currentTime }))).toEqual({ paused: true, at: 0 });

      // The scene stands at its start: its drawing stays the same over the frames the browser draws.
      const first = await sceneDrawn(page);

      await page.evaluate(() => new Promise<void>((done) => {
        let left = 30;
        const step = (): void => {
          left -= 1;
          if (left === 0) done();
          else requestAnimationFrame(step);
        };

        requestAnimationFrame(step);
      }));
      expect(await sceneDrawn(page)).toBe(first);
    } finally {
      await context.close();
    }
  }, 120_000);
});
