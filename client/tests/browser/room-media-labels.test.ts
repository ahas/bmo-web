import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { LABELS } from "../support/media-labels";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser } from "playwright-core";

// Words that are only the label a chat client keeps for what a line carried count as no words (docs/web.md, the room
// screen's wordless messages): a photo under the picture label, one under the count of pictures and one under the
// lower-case English label stand as the picture alone, a video under the video label and a file under its own name
// carry no words over their player and their line, and a photo whose words hold the label among more keeps them. On a
// phone held upright and on a desktop, in Korean. It drives the console tests/support/browser-console.ts stands up; the
// suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "stickers", password: "fixture-password-3303" };
const LONE_CHAT = 46;
// The labelled rows, each with the label it came under, and the one whose label stands among more words.
const LABELLED = { m16: LABELS.picture, m17: LABELS.pictures, m18: "photo", m19: LABELS.video } as const;
const FILED = { row: "m20", name: "20261118_071900.mp4" } as const;
const CAPTIONED = { row: "m21", words: `${LABELS.picture} from the trip` } as const;
const WIDTHS = [
  { name: "a phone", viewport: { width: 360, height: 780 }, phone: true },
  { name: "a desktop", viewport: { width: 1280, height: 1000 }, phone: false }
] as const;

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

describe.skipIf(!origin || !touchReady())("a chat client's label for what a line carried", () => {
  for (const look of WIDTHS) {
    test(`draws no words under the picture, the video or the file it labels, and a caption holding it stays, on ${look.name}`, async () => {
      const context = await browser!.newContext({ viewport: look.viewport, isMobile: look.phone, hasTouch: look.phone, serviceWorkers: "block" });
      const at = cookie.indexOf("=");

      await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/rooms/${LONE_CHAT}`, { waitUntil: "load" });
        await page.locator(`[data-message="${CAPTIONED.row}"] [data-words]`).waitFor({ timeout: 30_000 });
        await page.locator(`[data-message="${FILED.row}"]`).scrollIntoViewIfNeeded();

        const read = await page.evaluate(
          ({ labelled, filed, captioned }) => {
            // What a row draws as words, a sender's name left aside.
            const wordsOf = (row: string) =>
              [...document.querySelectorAll(`[data-message="${row}"] [data-words]:not([data-name])`)]
                .map((words) => (words as HTMLElement).innerText.trim())
                .filter((words) => words !== "");
            const fileRow = document.querySelector(`[data-message="${filed.row}"]`) as HTMLElement;

            return {
              labelled: Object.fromEntries(
                Object.entries(labelled).map(([row, label]) => {
                  const element = document.querySelector(`[data-message="${row}"]`) as HTMLElement;

                  return [row, { words: wordsOf(row), shown: element.innerText.includes(label) }];
                })
              ),
              // A picture standing alone carries no name line over it, as a picture with words would.
              lonePictures: ["m16", "m17", "m18"].map((row) => document.querySelector(`[data-message="${row}"] [data-name]`) === null),
              fileNamed: fileRow.innerText.split(filed.name).length - 1,
              captioned: wordsOf(captioned.row).join(" ")
            };
          },
          { labelled: LABELLED, filed: FILED, captioned: CAPTIONED }
        );

        for (const row of Object.keys(LABELLED)) {
          expect({ row, ...read.labelled[row] }).toEqual({ row, words: [], shown: false });
        }
        expect(read.lonePictures).toEqual([true, true, true]);
        // The file's own line names it once, and no words above it say the name again.
        expect(read.fileNamed).toBe(1);
        expect(read.captioned).toContain(CAPTIONED.words);
      } finally {
        await context.close();
      }
    }, 60_000);
  }
});
