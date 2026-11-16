import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, Page } from "playwright-core";
import type { ArchivedMessage } from "../../apps/web/shared/types";

// A line being sent stands in the place its kept message will take, and the kept message takes that place rather
// than standing beside it, even while the send is still out (docs/web.md, the room screen's section on a message
// being sent). Words and a picture are each sent from the room screen while the archive carries them before their
// send answers — the picture's message first without its picture, then with it — and every frame drawn from the
// press on holds exactly one row for each. It drives the console tests/support/browser-console.ts stands up,
// serving the room's page through the page's own routes; the suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
// Where the frames the run passes through are kept, when it is asked to keep them.
const shots = process.env.BMO_ROOM_SENDING_SHOTS?.trim() ?? "";
// The owner's account, the harness's first, to which the owner's sender is linked: what is archived under that sender
// stands as the reader's own, on the right, for that account alone.
const ACCOUNT = { name: "agent-topbar", password: "fixture-password-1558" };
const ROOM = 43;
// The owner's number, the one the receiver's stand-in names: the owner's words are archived under it.
const OWNER = 42;
// The sender the harness's receiver names as the owner's, which every message the owner sends is archived under.
const OWNER_SENDER = 1;
const WORDS = "words on their way";
const WORDS_ID = "9001";
const PICTURE_ID = "9002";
// A four-pixel checker, a PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAGElEQVR4nGNwaHjwwMEBQjLAWUCSAacMAHBSGAE11lAnAAAAAElFTkSuQmCC", "base64");

const earlier: ArchivedMessage = {
  chatId: ROOM, messageId: "9000", senderId: 7, senderName: "person-b", sentAt: Math.floor(Date.now() / 1000) - 600, text: "said before",
  imagePath: null, replyToMessageId: null
};

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

// A promise and the hand that settles it, which holds a send's answer until the test lets it go.
function gate(): { held: Promise<void>; open: () => void } {
  let open = (): void => undefined;
  const held = new Promise<void>((resolve) => {
    open = resolve;
  });

  return { held, open };
}

// Every frame the page draws, the rows of the room's feed it holds, under the stretch of the run it was drawn in.
const SAMPLER = `(() => {
  window.__frames = [];
  window.__stretch = "before";
  const look = () => {
    const rows = [...document.querySelectorAll("[data-message]")].map((row) => row.getAttribute("data-message"));
    const last = window.__frames[window.__frames.length - 1];
    const keys = rows.join(",");

    if (last === undefined || last.keys !== keys || last.stretch !== window.__stretch) {
      window.__frames.push({ stretch: window.__stretch, keys, rows: rows.length });
    }

    requestAnimationFrame(look);
  };

  requestAnimationFrame(look);
})()`;

async function stretch(page: Page, name: string): Promise<void> {
  await page.evaluate(`window.__stretch = ${JSON.stringify(name)}`);
}

async function shoot(page: Page, name: string): Promise<void> {
  if (shots === "") return;

  mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: join(shots, `${name}.png`) });
}

describe.skipIf(!origin || !touchReady())("a line being sent", () => {
  test("stands as exactly one row from the press on, words and a picture alike, while the archive carries them first", async () => {
    const context = await browser!.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block", reducedMotion: "reduce" });
    const at = cookie.indexOf("=");
    const archive: ArchivedMessage[] = [earlier];
    const say = gate();
    const attach = gate();
    let reads = 0;

    await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
    await context.route(/\/api\/control$/, (route) => route.fulfill({ json: { reachable: true, ownerChatId: OWNER } }));
    await context.route(new RegExp(`/api/rooms/${ROOM}/messages(\\?|$)`), (route) => {
      const after = new URL(route.request().url()).searchParams.get("after");

      reads += 1;

      return route.fulfill({
        json: { messages: archive.filter((one) => after === null || Number(one.messageId) > Number(after)), judgements: [], hasMore: false }
      });
    });
    await context.route(new RegExp(`/api/rooms/${ROOM}/say$`), async (route) => {
      await say.held;
      await route.fulfill({ json: { messageId: WORDS_ID } });
    });
    await context.route(new RegExp(`/api/rooms/${ROOM}/attach$`), async (route) => {
      await attach.held;
      await route.fulfill({ json: { sent: [{ name: "a.png", messageId: PICTURE_ID }], failed: [], checking: [] } });
    });
    await context.route(new RegExp(`/api/images/${ROOM}/${PICTURE_ID}$`), (route) => route.fulfill({ body: PNG, contentType: "image/png" }));

    // The feed read again past the archive's change, and a frame drawn from it.
    async function readAgain(page: Page): Promise<void> {
      const from = reads;

      for (let waited = 0; reads === from && waited < 30_000; waited += 100) await Bun.sleep(100);
      expect(reads).toBeGreaterThan(from);
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    }

    try {
      const page = await context.newPage();

      await page.goto(`${origin}/rooms/${ROOM}`, { waitUntil: "load" });
      await page.locator(`[data-message="m${earlier.messageId}"]`).waitFor({ timeout: 30_000 });
      await page.evaluate(SAMPLER);

      const box = page.locator("form textarea").first();

      // Words: the line stands, the archive files them while the send is out, the send answers.
      await stretch(page, "words");
      await box.fill(WORDS);
      await box.press("Enter");
      await page.getByText(WORDS).first().waitFor();
      await shoot(page, "1-words-sending");

      archive.push({ chatId: ROOM, messageId: WORDS_ID, senderId: OWNER_SENDER, senderName: "owner", sentAt: Math.floor(Date.now() / 1000), text: WORDS, imagePath: null, replyToMessageId: null });
      await readAgain(page);
      await page.locator(`[data-message="m${WORDS_ID}"]`).waitFor();
      await shoot(page, "2-words-filed-send-out");

      say.open();
      await readAgain(page);
      await shoot(page, "3-words-sent");

      // A picture: the line stands, the archive files its message without the picture, then keeps the picture,
      // then the send answers.
      await stretch(page, "picture");
      await page.locator('input[type="file"]').first().setInputFiles({ name: "a.png", mimeType: "image/png", buffer: PNG });
      await page.locator("[data-picked]").first().waitFor();
      await box.press("Enter");
      await page.locator("[data-picked]").first().waitFor({ state: "detached" });
      await shoot(page, "4-picture-sending");

      const filed: ArchivedMessage = { chatId: ROOM, messageId: PICTURE_ID, senderId: OWNER_SENDER, senderName: "owner", sentAt: Math.floor(Date.now() / 1000), text: "", imagePath: null, replyToMessageId: null };

      archive.push(filed);
      await readAgain(page);
      expect(await page.locator(`[data-message="m${PICTURE_ID}"]`).count()).toBe(0);
      await shoot(page, "5-picture-filed-without-picture");

      archive[archive.length - 1] = { ...filed, imagePath: `data/images/${ROOM}/${PICTURE_ID}.jpg` };
      await readAgain(page);
      await page.locator(`[data-message="m${PICTURE_ID}"]`).waitFor();
      await shoot(page, "6-picture-kept-send-out");

      attach.open();
      await readAgain(page);
      await shoot(page, "7-picture-sent");

      const frames = (await page.evaluate("window.__frames")) as { stretch: string; keys: string; rows: number }[];
      // The rows of each stretch's frames from the first that held the line on: never two for it, and never none.
      const from = (name: string, before: number): number[] => {
        const rows = frames.filter((frame) => frame.stretch === name).map((frame) => frame.rows);
        const first = rows.findIndex((count) => count !== before);

        return first === -1 ? [] : [...new Set(rows.slice(first))];
      };

      // The earlier message and one row for the words; then one more for the picture.
      expect(from("words", 1)).toEqual([2]);
      expect(from("picture", 2)).toEqual([3]);
      expect(frames.at(-1)?.keys).toBe(`m${earlier.messageId},m${WORDS_ID},m${PICTURE_ID}`);
    } finally {
      await context.close();
    }
  }, 180_000);

  test("three sends fired at once stand as three rows from the press on, in the order sent, each its one row for good", async () => {
    const context = await browser!.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block", reducedMotion: "reduce" });
    const at = cookie.indexOf("=");
    const archive: ArchivedMessage[] = [earlier];
    const sent: string[] = [];
    let reads = 0;
    let next = 9100;

    // The receiver files each send's message before it answers the send, and the archive is read while the send is
    // still out; the send then answers with the number it filed.
    async function files(message: Omit<ArchivedMessage, "messageId">): Promise<string> {
      const messageId = String(next++);
      const from = reads;

      archive.push({ ...message, messageId });
      for (let waited = 0; reads === from && waited < 30_000; waited += 100) await Bun.sleep(100);
      await Bun.sleep(300);

      return messageId;
    }

    await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
    await context.route(/\/api\/control$/, (route) => route.fulfill({ json: { reachable: true, ownerChatId: OWNER } }));
    await context.route(new RegExp(`/api/rooms/${ROOM}/messages(\\?|$)`), (route) => {
      const after = new URL(route.request().url()).searchParams.get("after");

      reads += 1;

      return route.fulfill({ json: { messages: archive.filter((one) => after === null || Number(one.messageId) > Number(after)), judgements: [], hasMore: false } });
    });
    await context.route(new RegExp(`/api/rooms/${ROOM}/say$`), async (route) => {
      const text = String((route.request().postDataJSON() as { text?: unknown }).text ?? "");

      sent.push(text);

      const messageId = await files({ chatId: ROOM, senderId: OWNER_SENDER, senderName: "owner", sentAt: Math.floor(Date.now() / 1000), text, imagePath: null, replyToMessageId: null });

      await route.fulfill({ json: { messageId } });
    });
    await context.route(new RegExp(`/api/rooms/${ROOM}/attach$`), async (route) => {
      sent.push("picture");

      const messageId = await files({ chatId: ROOM, senderId: OWNER_SENDER, senderName: "owner", sentAt: Math.floor(Date.now() / 1000), text: "", imagePath: `data/images/${ROOM}/burst.jpg`, replyToMessageId: null });

      await route.fulfill({ json: { sent: [{ name: "b.png", messageId }], failed: [], checking: [] } });
    });
    await context.route(new RegExp(`/api/images/${ROOM}/\\d+$`), (route) => route.fulfill({ body: PNG, contentType: "image/png" }));

    try {
      const page = await context.newPage();

      await page.goto(`${origin}/rooms/${ROOM}`, { waitUntil: "load" });
      await page.locator(`[data-message="m${earlier.messageId}"]`).waitFor({ timeout: 30_000 });

      // Every frame: the rows after the earlier one, each by the element it is drawn in, so a row drawn again in a
      // new element, gone for a frame or out of its order shows.
      await page.evaluate(`(() => {
        window.__burst = [];
        const ids = new WeakMap();
        let made = 0;
        const look = () => {
          const rows = [...document.querySelectorAll("[data-message]")].slice(1);
          const seen = rows.map((row) => { if (!ids.has(row)) ids.set(row, ++made); return ids.get(row); }).join(",");
          const last = window.__burst[window.__burst.length - 1];

          if (last !== seen) window.__burst.push(seen);
          requestAnimationFrame(look);
        };

        requestAnimationFrame(look);
      })()`);

      const box = page.locator("form textarea").first();

      await box.fill("first of three");
      await box.press("Enter");
      await box.fill("second of three");
      await box.press("Enter");
      await page.locator('input[type="file"]').first().setInputFiles({ name: "b.png", mimeType: "image/png", buffer: PNG });
      await page.locator("[data-picked]").first().waitFor();
      await box.press("Enter");

      if (shots !== "") {
        for (let frame = 0; frame < 6; frame += 1) {
          await shoot(page, `burst-${frame}`);
          await page.waitForTimeout(1_500);
        }
      }

      for (let waited = 0; sent.length < 3 && waited < 90_000; waited += 200) await Bun.sleep(200);
      expect(sent).toEqual(["first of three", "second of three", "picture"]);
      await page.waitForFunction(() => [...document.querySelectorAll("[data-message]")].every((row) => row.getAttribute("data-message")!.startsWith("m")), undefined, { timeout: 30_000 });
      await page.waitForTimeout(2_500);
      await shoot(page, "burst-end");

      const frames = (await page.evaluate("window.__burst")) as string[];
      // From the frame the third row first stood, the same three elements in the same order, and nothing else.
      const standing = frames.filter((frame) => frame.split(",").length >= 3);

      expect(frames.filter((frame) => frame !== "" && frame.split(",").length > 3)).toEqual([]);
      expect([...new Set(standing)]).toHaveLength(1);
      expect(frames.slice(frames.indexOf(standing[0]!))).toEqual([standing[0]!]);
      expect(await page.locator("[data-message]").evaluateAll((rows) => rows.map((row) => row.textContent?.includes("first of three") ? 1 : row.textContent?.includes("second of three") ? 2 : row.querySelector("img") !== null ? 3 : 0))).toEqual([0, 1, 2, 3]);
    } finally {
      await context.close();
    }
  }, 240_000);
});
