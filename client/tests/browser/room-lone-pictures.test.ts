import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser } from "playwright-core";

// A message that is one picture and nothing else stands as the picture alone, with no bubble, no name line and no tail,
// its mark not shown and its time laid over its foot, on either side and whatever kind of picture it is; a picture
// with words or a quote keeps its bubble (docs/web.md, the room screen's wordless messages). Its room stands at the
// picture's shape before the file has loaded. The room holds an emoticon a chat service handed over as a plain square
// picture with no words, a photo under its mark alone, a GIF under its mark, a photo with no words from the reader, a
// photo with a caption, a photo answering another message and words from the reader. It drives the console
// tests/support/browser-console.ts stands up; the suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "stickers", password: "fixture-password-3303" };
const LONE_CHAT = 46;
// The rows, each with the shape its picture has.
const LONE = { m9: { width: 360, height: 360 }, m10: { width: 1280, height: 960 }, m11: { width: 800, height: 600 }, m12: { width: 600, height: 1280 } } as const;
const THEIRS = "m10";
const OWN = "m12";
// Someone else's bubble and the reader's own, whose edges a lone picture of the same side holds to.
const THEIR_BUBBLE = "m13";
const OWN_BUBBLE = "m15";
const BUBBLED = ["m13", "m14"];
const WIDTHS = [{ width: 1280, height: 1000 }, { width: 360, height: 780 }] as const;
// The picture and the animation files of those rows, held unanswered so their rooms are read before anything has loaded.
const HELD = new RegExp(`/api/(images|media/animation)/${LONE_CHAT}/(9|10|11|12|13|14)(\\?|$)`);

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

describe.skipIf(!origin || !touchReady())("a message that is one picture", () => {
  for (const viewport of WIDTHS) {
    test(`stands alone with its time over it and keeps its room before it loads at ${viewport.width}px`, async () => {
      const context = await browser!.newContext({ viewport, serviceWorkers: "block" });
      const at = cookie.indexOf("=");

      await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

      try {
        const page = await context.newPage();

        await page.route(HELD, () => undefined);
        await page.goto(`${origin}/rooms/${LONE_CHAT}`, { waitUntil: "load" });
        await page.locator(`[data-message="${OWN_BUBBLE}"] [data-bubble]`).waitFor({ timeout: 30_000 });

        const read = await page.evaluate(
          ({ lone, bubbled, sides }) => {
            const pictureOf = (row: Element) => row.querySelector("video[data-animation], [data-bubble] img")!;
            const box = (el: Element) => el.getBoundingClientRect();
            const groundOf = (el: Element) => {
              const look = getComputedStyle(el);

              return look.backgroundColor !== "rgba(0, 0, 0, 0)" || look.borderTopWidth !== "0px";
            };
            const rows = Object.fromEntries(Object.keys(lone).map((key) => {
              const row = document.querySelector(`[data-message="${key}"]`)!;
              const picture = pictureOf(row);
              const grounds: string[] = [];

              for (let part = picture.parentElement; part !== null && part !== row; part = part.parentElement) {
                if (groundOf(part)) grounds.push(getComputedStyle(part).backgroundColor);
              }

              const shown = box(picture);
              const meta = box(row.querySelector("[data-meta]")!);
              const bubble = row.querySelector("[data-bubble]")!;

              return [key, {
                grounds,
                named: row.querySelector("[data-name]") !== null,
                tailed: row.querySelector(".bubble-tail") !== null,
                marked: /\[(Photo|GIF)/.test((row as HTMLElement).innerText),
                timeOver: meta.top >= shown.top && meta.bottom <= shown.bottom + 1 && meta.right <= shown.right + 1 && meta.left >= shown.left,
                cornered: Number.parseFloat(getComputedStyle(bubble).borderTopLeftRadius) > 0,
                width: shown.width,
                height: shown.height,
                left: shown.left,
                right: shown.right
              }];
            }));
            const bubbles = bubbled.map((key) => getComputedStyle(document.querySelector(`[data-message="${key}"] [data-bubble]`)!).backgroundColor);
            const bubbleBox = (key: string) => box(document.querySelector(`[data-message="${key}"] [data-bubble]`)!);

            return { rows, bubbles, theirBubble: bubbleBox(sides.theirs).left, ownBubble: bubbleBox(sides.own).right };
          },
          { lone: LONE, bubbled: BUBBLED, sides: { theirs: THEIR_BUBBLE, own: OWN_BUBBLE } }
        );

        // Each stands alone, and its room stands at the picture's own shape while its file is held, at a width a picture
        // is drawn at.
        const stood = Object.entries(LONE).map(([key, shape]) => {
          const row = read.rows[key]!;

          return {
            key, grounds: row.grounds, named: row.named, tailed: row.tailed, marked: row.marked, timeOver: row.timeOver, cornered: row.cornered,
            drawn: row.width > 100, shaped: Math.abs(row.height / row.width - shape.height / shape.width) < 0.02
          };
        });

        expect(stood).toEqual(Object.keys(LONE).map((key) => ({
          key, grounds: [], named: false, tailed: false, marked: false, timeOver: true, cornered: true, drawn: true, shaped: true
        })));

        // Someone else's picture holds to the leading edge their bubbles hold to, and the reader's own to the trailing
        // edge the reader's bubbles hold to.
        expect(Math.abs(read.rows[THEIRS]!.left - read.theirBubble)).toBeLessThanOrEqual(1);
        expect(Math.abs(read.rows[OWN]!.right - read.ownBubble)).toBeLessThanOrEqual(1);

        // A photo with a caption and one answering another message keep their bubbles.
        for (const ground of read.bubbles) expect(ground).not.toBe("rgba(0, 0, 0, 0)");
      } finally {
        await context.close();
      }
    }, 60_000);
  }
});
