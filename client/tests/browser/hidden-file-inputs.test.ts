import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, BrowserContext, Page } from "playwright-core";

// The file inputs the console hides staying hidden (docs/web.md, 「Screens a unit brings」): the room's prompt box
// holds the two pickers its clip opens, and a unit's screen laid plain rules for the `input` element on the page as
// it mounts leaves them out of the page all the same — before any unit's screen has been in play, after one has and
// the room is come back to, and at a desktop's and a phone's width. The box still takes a file the picker brings.
// The rule the screen lays is the stand-in unit's, asked for by its address's query; it stands where an editor
// library inside a real unit's bundle lays its own. It drives the console tests/support/browser-console.ts stands
// up; the suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "hidden-inputs", password: "fixture-password-2412" };
// A room kept on this machine's own record, as `room-attach` drives one.
const CHAT = -9_000_000_000_099;

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

async function open(width: number, height: number): Promise<BrowserContext> {
  const context = await browser!.newContext({ viewport: { width, height }, serviceWorkers: "block", reducedMotion: "reduce" });
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

  return context;
}

// The app stood in the page the server drew: until the mount carries it, no move inside the app is a move and no
// handler of the box reads a file.
async function hydrated(page: Page): Promise<void> {
  await page.waitForFunction(() => Reflect.get(document.querySelector("#__nuxt") ?? {}, "__vue_app__") !== undefined, null, { timeout: 30_000 });
}

// A move inside the app, the way the sidebar makes one: a page drawn anew would wash the rules the unit's screen
// laid, and coming back to a room is one move within the app.
async function go(page: Page, path: string): Promise<void> {
  await page.evaluate(`document.querySelector("#__nuxt").__vue_app__.config.globalProperties.$router.push(${JSON.stringify(path)})`);
}

/** Each file input of the page not drawn, by what marks it: a drawn one is one whose box the page holds. */
async function hiddenInputs(page: Page): Promise<Record<string, string>> {
  return page.$$eval("input[type='file']", (inputs) =>
    Object.fromEntries(
      inputs.map((input) => {
        const element = input as HTMLInputElement;
        const mark = element.dataset.attachPicker !== undefined ? "picker" : element.dataset.attachMedia !== undefined ? "media" : "other";

        return [mark, `${getComputedStyle(element).display}:${element.getClientRects().length}`];
      })
    )
  );
}

describe.skipIf(!origin || !touchReady())("the file inputs the console hides", () => {
  for (const [width, height] of [[1280, 900], [360, 780]] as const) {
    test(`stay out of the room the page they were drawn on came back to, ${width}px wide`, async () => {
      const context = await open(width, height);
      const page = await context.newPage();

      try {
        await page.goto(`${origin}/rooms/${CHAT}`, { waitUntil: "domcontentloaded" });
        await page.locator("textarea").first().waitFor({ timeout: 30_000 });
        await page.locator("[data-attach-picker]").waitFor({ state: "attached", timeout: 20_000 });

        // No unit's screen has been in play: the room's two pickers are mounted and drawn nowhere.
        expect(await hiddenInputs(page)).toEqual({ media: "none:0", picker: "none:0" });

        // The unit's screen, asked to lay its plain rule for the `input` element as it mounts.
        await hydrated(page);
        await go(page, "/screen-a?styles=on");
        await page.locator("[data-screen='screen-a']").waitFor({ timeout: 30_000 });
        await page.locator("[data-bundle-styles]").waitFor({ state: "attached", timeout: 10_000 });

        // Back to the room, where the box and its pickers are mounted again with the rule still on the page.
        await hydrated(page);
        await go(page, `/rooms/${CHAT}`);
        await page.locator("[data-attach-picker]").waitFor({ state: "attached", timeout: 30_000 });

        expect(await hiddenInputs(page)).toEqual({ media: "none:0", picker: "none:0" });
        await page.screenshot({ path: `/tmp/hidden-file-inputs-${width}.png` });

        // Hidden as a drawn box, the clip is the box's own road still: pressed, it opens the browser's chooser,
        // and the file that chooser carries stands in the box.
        const opening = page.waitForEvent("filechooser", { timeout: 15_000 });

        await page.locator(`button[aria-label="${wording("room.action.attach_file")}"]`).first().click();
        (await opening).setFiles({ name: "held.txt", mimeType: "text/plain", buffer: Buffer.from("held by the box\n") });
        await page.locator("[data-picked]").filter({ hasText: "held.txt" }).first().waitFor({ timeout: 20_000 });
      } finally {
        await context.close();
      }
    }, 120_000);
  }
});
