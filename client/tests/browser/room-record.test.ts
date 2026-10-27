import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser } from "playwright-core";

// A room the console made on the record road (docs/web.md, 「Which messages stand on the right」, 「An agent's words wear
// the agent's face in every room」): the owner's words, archived under their own sender, stand on the right, and the
// chat agent's, which stand under no number there, wear the agent's own face rather than its letter. It drives the
// console tests/support/browser-console.ts stands up; the suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "room-record", password: "fixture-password-2260" };
const RECORD_CHAT = -9_000_000_000_099;

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

describe.skipIf(!origin || !touchReady())("a room the console made", () => {
  for (const [width, height, phone] of [[1280, 900, false], [360, 780, true]] as const) {
    test(`stands the owner's words on the right and the chat agent's with its own face, ${width}px wide`, async () => {
      const context = await browser!.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, serviceWorkers: "block", reducedMotion: "reduce" });
      const at = cookie.indexOf("=");

      await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/rooms/${RECORD_CHAT}`, { waitUntil: "load" });
        await page.locator("[data-message]").nth(2).waitFor({ timeout: 30_000 });

        const rows = await page.locator("[data-row]").evaluateAll((all) =>
          all.filter((row) => row.hasAttribute("data-message")).map((row) => ({ text: row.textContent ?? "", mine: row.hasAttribute("data-mine") }))
        );

        expect(rows.map((row) => row.mine)).toEqual([true, false, true]);

        // The agent's run wears a picture, not its label's letter.
        const face = page.locator("[data-run]").nth(1).locator("img").first();

        await face.waitFor({ timeout: 20_000 });
        expect(await face.getAttribute("src")).toContain("/api/avatars/person/501");
      } finally {
        await context.close();
      }
    }, 90_000);

    test(`stands what the record kept done to its messages: reactions, an edit, a delete and a pin, ${width}px wide`, async () => {
      const context = await browser!.newContext({ viewport: { width, height }, isMobile: phone, hasTouch: phone, serviceWorkers: "block", reducedMotion: "reduce" });
      const at = cookie.indexOf("=");

      await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

      try {
        const page = await context.newPage();

        await page.goto(`${origin}/rooms/${RECORD_CHAT}`, { waitUntil: "load" });
        await page.locator("[data-message]").nth(2).waitFor({ timeout: 30_000 });

        // Two put the same emoji on the first message, the reader's own sender among them.
        const reaction = page.locator('[data-message="m-1"] [data-reaction]');

        expect(await reaction.count()).toBe(1);
        expect((await reaction.innerText()).replace(/\s/g, "")).toBe("\u{1F44D}2");
        expect(await reaction.getAttribute("class")).toContain("bg-primary/15");
        // The first is pinned, and the room's top bar carries the button that goes to it.
        expect(await page.locator('[data-message="m-1"] [data-pinned]').count()).toBe(1);
        expect(await page.locator("[data-pinned-button]").count()).toBe(1);
        // The agent's answer was edited, and the third message was deleted, kept in its place with no words.
        expect(await page.locator('[data-message="m-2"] [data-edited]').count()).toBe(1);
        expect(await page.locator('[data-message="m-3"] [data-deleted]').count()).toBe(1);
        expect(await page.locator('[data-message="m-3"] [data-reaction]').count()).toBe(0);
      } finally {
        await context.close();
      }
    }, 90_000);
  }
});
