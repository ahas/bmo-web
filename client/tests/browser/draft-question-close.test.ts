import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";
import { wording } from "../../apps/web/shared/wording";

import type { Browser } from "playwright-core";

// A dropdown holding a box keeps the box's text as it goes (docs/web.md, 「What floats keeps what it holds until it
// is off the screen」): a draft question's text box, opened from its cell and closed without saving, never shows the
// refusal of an empty text on any frame. It drives the console tests/support/browser-console.ts stands up, serving
// the table through the page's own route; the suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "draft-close", password: "fixture-password-2259" };
const QUESTION = { name: "final", text: "the last question of the round", source: "default" };

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

describe.skipIf(!origin || !touchReady())("a draft question's box", () => {
  test("opened and closed without saving shows no refusal on any frame", async () => {
    const context = await browser!.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block" });
    const at = cookie.indexOf("=");
    const refusal = wording("agents.error.draft_question_text", { max: "4,000" });

    await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
    await context.route(/\/api\/draft-processes$/, (route) => route.fulfill({ json: { rows: [], questions: [QUESTION] } }));

    try {
      const page = await context.newPage();

      await page.goto(`${origin}/agents?tab=supervisors`, { waitUntil: "load" });

      const cell = page.locator("[data-draft-questions]").getByRole("button", { name: new RegExp(QUESTION.name) });

      await cell.waitFor({ timeout: 30_000 });
      await page.evaluate(`(() => {
        window.__refused = false;
        const look = () => {
          if (document.body.innerText.includes(${JSON.stringify(refusal)})) window.__refused = true;
          requestAnimationFrame(look);
        };
        requestAnimationFrame(look);
      })()`);

      const box = page.locator('[role="group"] textarea');

      for (let round = 0; round < 2; round += 1) {
        await cell.click();
        await box.waitFor();
        expect(await box.inputValue()).toBe(QUESTION.text);
        await page.keyboard.press("Escape");
        await box.waitFor({ state: "detached" });
      }

      // Typed over, closed unsaved, and opened again: the box starts from the saved text.
      await cell.click();
      await box.fill("typed and dropped");
      await page.keyboard.press("Escape");
      await box.waitFor({ state: "detached" });
      await cell.click();
      await box.waitFor();

      expect(await box.inputValue()).toBe(QUESTION.text);
      expect((await page.evaluate("window.__refused")) as boolean).toBe(false);
    } finally {
      await context.close();
    }
  }, 120_000);
});
