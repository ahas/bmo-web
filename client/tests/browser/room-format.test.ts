import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser } from "playwright-core";

// What a person's message sent with Telegram formatting stands as in a room (docs/web.md, 「Telegram
// formatting」): the inline styles, a spoiler that uncovers on a press, a text link and a bare address, a pre
// block, and a plain and an expandable quote. The harness browser-console.ts seeds three such messages into
// MEDIA_CHAT (ids 8, 9, 10 → rows m8, m9, m10); it drives the console that harness stands up, so the suite
// skips this where no console is served.

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

// The styles the browser ends up drawing for one selector inside a row, and what it holds.
async function drawn(page: import("playwright-core").Page, selector: string) {
  return page.evaluate((one) => {
    const element = document.querySelector(one);

    if (element === null) return null;

    const style = getComputedStyle(element);

    return {
      text: element.textContent ?? "",
      weight: style.fontWeight,
      face: style.fontStyle,
      line: style.textDecorationLine,
      family: style.fontFamily,
      mono: element.tagName === "CODE" || /mono/i.test(style.fontFamily)
    };
  }, selector);
}

describe.skipIf(!origin || !touchReady())("a message's formatting", () => {
  test("stands its inline styles, code, spoiler and links as the chat sent them", async () => {
    const context = await browser!.newContext({ viewport: { width: 1280, height: 1400 }, serviceWorkers: "block" });
    const at = cookie.indexOf("=");

    await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

    try {
      const page = await context.newPage();

      await page.goto(`${origin}/rooms/${MEDIA_CHAT}`, { waitUntil: "load" });
      await page.locator('[data-message="m8"] [data-words]').first().waitFor({ timeout: 30_000 });

      // Each style lands on its own word, and a bare address stands as a link beside the entity's own.
      expect(await drawn(page, '[data-message="m8"] .tg-quote')).toBeNull();
      expect(await drawn(page, '[data-message="m8"] .font-semibold')).toMatchObject({ text: "bold", weight: "600" });
      expect(await drawn(page, '[data-message="m8"] .italic')).toMatchObject({ text: "italic", face: "italic" });
      expect(await drawn(page, '[data-message="m8"] .underline')).toMatchObject({ text: "under", line: "underline" });
      expect(await drawn(page, '[data-message="m8"] .line-through')).toMatchObject({ text: "strike", line: "line-through" });
      expect((await drawn(page, '[data-message="m8"] .tg-code'))!.mono).toBe(true);

      // A text link opens its entity's address in a new tab; the bare web address opens its own.
      const entity = page.locator('[data-message="m8"] a[href="https://example.org/format"]');

      expect(await entity.innerText()).toBe("docs");
      expect(await entity.getAttribute("target")).toBe("_blank");
      expect(await entity.getAttribute("rel")).toContain("noopener");
      // The same message carries the bare web address of its words as a link beside the entity's, the address itself
      // standing in the words and its preview card below them (docs/web.md, the link and link-preview rules).
      expect(await page.locator('[data-message="m8"] [data-words] a[href="https://plain.example"]').count()).toBe(1);

      // A spoiler stands covered — its words held out of the reading — and uncovers on a press.
      const spoiler = page.locator('[data-message="m8"] .tg-spoiler');

      expect(await spoiler.getAttribute("aria-pressed")).toBe("false");
      expect(await spoiler.evaluate((one) => getComputedStyle(one).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
      expect(await spoiler.evaluate((one) => getComputedStyle(one.querySelector(".tg-spoiler-words")!).filter)).toContain("blur");
      await spoiler.click();
      expect(await spoiler.getAttribute("aria-pressed")).toBe("true");
      expect(await spoiler.evaluate((one) => getComputedStyle(one.querySelector(".tg-spoiler-words")!).filter)).toBe("none");
    } finally {
      await context.close();
    }
  }, 120_000);

  test("stands a pre as a block of monospace, and a quote with its rule and an expandable one that opens", async () => {
    const context = await browser!.newContext({ viewport: { width: 1280, height: 1400 }, serviceWorkers: "block" });
    const at = cookie.indexOf("=");

    await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

    try {
      const page = await context.newPage();

      await page.goto(`${origin}/rooms/${MEDIA_CHAT}`, { waitUntil: "load" });
      await page.locator('[data-message="m9"] pre.tg-pre').first().waitFor({ timeout: 30_000 });

      // The pre is a block of the monospace face holding both code lines, and the plain words around it stay normal.
      const pre = await drawn(page, '[data-message="m9"] pre.tg-pre');

      expect(pre!.mono).toBe(true);
      expect(pre!.text).toContain("let x = 1");
      expect(pre!.text).toContain("y = 2");

      // A plain quote stands under its leading rule; the expandable one starts closed and opens on a press.
      const quoted = page.locator('[data-message="m10"] blockquote.tg-quote:not(.tg-quote--press)');

      expect((await quoted.innerText()).replace(/\s+/g, " ").trim()).toBe("quoted one quoted two");
      expect(await quoted.evaluate((one) => parseFloat(getComputedStyle(one).borderInlineStartWidth))).toBeGreaterThanOrEqual(2);

      const expandable = page.locator('[data-message="m10"] blockquote.tg-quote--press');

      expect(await expandable.getAttribute("aria-expanded")).toBe("false");
      expect(await expandable.evaluate((one) => parseFloat(getComputedStyle(one).borderInlineStartWidth))).toBeGreaterThanOrEqual(2);
      const closed = await expandable.evaluate((one) => one.getBoundingClientRect().height);

      await expandable.click();
      expect(await expandable.getAttribute("aria-expanded")).toBe("true");
      expect(await expandable.evaluate((one) => one.getBoundingClientRect().height)).toBeGreaterThan(closed);
    } finally {
      await context.close();
    }
  }, 120_000);

  // A Galaxy S25's portrait width: the formatting stays inside the bubble's own width, the pre scrolling within its
  // box rather than pushing the bubble wider (docs/web.md, 「A bubble is as wide as its widest line」).
  test("keeps the formatting inside the bubble at a phone's width", async () => {
    const context = await browser!.newContext({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
    const at = cookie.indexOf("=");

    await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

    try {
      const page = await context.newPage();

      await page.goto(`${origin}/rooms/${MEDIA_CHAT}`, { waitUntil: "load" });
      await page.locator('[data-message="m9"] pre.tg-pre').first().waitFor({ timeout: 30_000 });

      const fits = await page.evaluate(() => {
        const bubble = document.querySelector('[data-message="m9"] [data-bubble]')!;
        const pre = document.querySelector('[data-message="m9"] pre.tg-pre')!;

        return {
          within: pre.getBoundingClientRect().right <= bubble.getBoundingClientRect().right + 1,
          keepsLines: getComputedStyle(pre).whiteSpace.startsWith("pre")
        };
      });

      expect(fits).toEqual({ within: true, keepsLines: true });

      // The spoiler's hover takes a colour of its own, apart from its rest.
      const cover = await page.locator('[data-message="m8"] .tg-spoiler').evaluate((one) => getComputedStyle(one).backgroundColor);

      await page.locator('[data-message="m8"] .tg-spoiler').hover();
      expect(await page.locator('[data-message="m8"] .tg-spoiler').evaluate((one) => getComputedStyle(one).backgroundColor)).not.toBe(cover);
    } finally {
      await context.close();
    }
  }, 120_000);
});
