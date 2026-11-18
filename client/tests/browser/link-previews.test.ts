import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, Page } from "playwright-core";

// A link in a room's message stands a card filled from its page (docs/web.md, the link previews rule): the page's
// title, description, site and picture, the picture served by the console itself, in a card whose shape does not
// change as it fills, on either side of the room and at a desk's and a phone's width. The harness
// browser-console.ts seeds link messages into MEDIA_CHAT: person-b's to a page declaring its sharing tags (m30), the
// reader's own to a page declaring a title and a description alone (m31) and person-b's long words around a link
// (m32), each read through the harness's
// stand-in for the tool host as bmo-explorer's link preview answers it. It drives the console that harness stands
// up, so the suite skips this where none is served.

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

// The least width a card asks of its bubble, in CSS pixels.
const CARD_LEAST = 320;

// One message's card as drawn: its words, its box, its row's box, the room its bubble gives its cards, and its
// picture's source and loaded width.
async function card(page: Page, message: string) {
  return page.evaluate((id) => {
    const row = document.querySelector(`[data-message="${id}"]`)!;
    const link = row.querySelector<HTMLAnchorElement>("[data-link-preview]")!;
    const picture = link.querySelector<HTMLImageElement>("[data-link-picture]");
    const box = link.getBoundingClientRect();
    const rowBox = row.getBoundingClientRect();
    // What the card list stands in, whose content box is the room the bubble gives its cards.
    const holder = link.closest("ul")!.parentElement!;
    const ground = getComputedStyle(holder);

    return {
      href: link.href,
      site: link.querySelector("[data-link-site]")?.textContent?.trim() ?? null,
      title: link.querySelector("[data-link-title]")?.textContent?.trim() ?? null,
      description: link.querySelector("[data-link-description]")?.textContent?.trim() ?? null,
      picture: picture === null ? null : { src: picture.currentSrc, width: picture.naturalWidth },
      height: box.height,
      width: box.width,
      room: holder.clientWidth - parseFloat(ground.paddingLeft) - parseFloat(ground.paddingRight),
      inside: box.left >= rowBox.left && box.right <= rowBox.right
    };
  }, message);
}

describe.skipIf(!origin || !touchReady())("a link's card", () => {
  for (const [label, width, height] of [["desk", 1280, 1000], ["phone", 360, 780]] as const) {
    test(`stands the page's title, description and picture on either side, at a ${label}'s width`, async () => {
      const context = await browser!.newContext({ viewport: { width, height }, serviceWorkers: "block" });
      const at = cookie.indexOf("=");

      await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/rooms/${MEDIA_CHAT}`, { waitUntil: "load" });

        // A card is drawn once its message comes near the screen, and the long message under it keeps it further
        // from the end on a phone.
        await page.locator('[data-message="m30"]').scrollIntoViewIfNeeded();

        const theirs = page.locator('[data-message="m30"] [data-link-preview]');
        const before = await theirs.evaluate((element) => element.getBoundingClientRect().height);

        await theirs.scrollIntoViewIfNeeded();
        await page.locator('[data-message="m30"] [data-link-picture]').waitFor({ timeout: 30_000 });
        await page.waitForFunction(() => {
          const picture = document.querySelector<HTMLImageElement>('[data-message="m30"] [data-link-picture]');

          return picture !== null && picture.complete && picture.naturalWidth > 0;
        }, null, { timeout: 30_000 });
        await page.locator('[data-message="m31"] [data-link-title]').waitFor({ timeout: 30_000 });

        const filled = await card(page, "m30");

        expect(filled).toMatchObject({ site: "Example Site", title: "A page worth reading", description: "What the page says of itself, in a sentence or two.", inside: true });
        expect(filled.href).toEndWith("/link-page");
        // The picture comes from the console's own route, cut to the card's square, never from the page's site.
        expect(filled.picture!.src).toBe(`${origin}/api/rooms/${MEDIA_CHAT}/links/30/0/image`);
        expect(filled.picture!.width).toBe(240);
        // The card kept the shape it stood with before its page was read.
        expect(filled.height).toBe(before);

        // The reader's own message: a page declaring no site and no picture stands its title and description, its
        // host for a site and no picture, in a card of the same shape.
        const mine = await card(page, "m31");

        expect(mine).toMatchObject({ site: "127.0.0.1", title: "Plain page title", description: "The page's meta description.", picture: null, inside: true });
        expect(mine.height).toBe(filled.height);

        // A card takes the whole room its bubble gives it, never past it: at its least width where the words are
        // short and the row has the room, as wide as the bubble where long words widened it, and the bubble's room
        // where a phone's bubble holds less.
        const wide = await card(page, "m32");

        for (const drawn of [filled, mine, wide]) expect(Math.abs(drawn.width - drawn.room)).toBeLessThan(1);
        if (label === "desk") {
          // The reader's own message is its address alone, narrower than a card: its bubble stands as wide as the
          // card's least width asks, the card at exactly that width.
          expect(Math.abs(mine.width - CARD_LEAST)).toBeLessThan(1);
          expect(filled.width).toBeGreaterThanOrEqual(CARD_LEAST - 1);
          expect(wide.width).toBeGreaterThan(CARD_LEAST + 40);
        } else {
          for (const drawn of [filled, mine, wide]) expect(drawn.width).toBeLessThanOrEqual(CARD_LEAST);
        }
      } finally {
        await context.close();
      }
    }, 90_000);
  }
});
