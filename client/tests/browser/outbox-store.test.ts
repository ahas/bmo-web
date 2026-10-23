import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";
import type { Browser, Page } from "playwright-core";
import { BROWSER_HOOK_MS, touchReady } from "./touch";
import KO from "../fixtures/browser/outbox-store.test.ko.json";

// The lines on their way outlive the page (docs/web.md, the room screen's section on what the browser keeps): kept in the browser's own
// database, a reload puts each back in its order and its state, its file with it, and a line the page
// let go of is gone from it. IndexedDB is an origin's, so the page is served from one rather than set
// as content.
const ready = touchReady();
const built = ready ? await Bun.build({ entrypoints: [new URL("../../apps/web/app/domain/outbox-store.ts", import.meta.url).pathname], target: "browser" }) : null;
const script = built === null ? "" : (await Promise.all(built.outputs.map((output) => output.text()))).join("\n");

let browser: Browser | null = null;
let server: ReturnType<typeof Bun.serve> | null = null;
let page: Page;

beforeAll(async () => {
  if (!ready) {
    return;
  }

  server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response(`<!doctype html><script type="module">${script}\nwindow.kept = { outboxStore };</script>`, { headers: { "content-type": "text/html" } })
  });
  browser = await chromium.launch();
  page = await browser.newPage();
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();
  server?.stop(true);
}, BROWSER_HOOK_MS);

async function opened(): Promise<void> {
  await page.goto(`http://127.0.0.1:${server?.port}/`);
  await page.waitForFunction(() => "kept" in window);
}

interface Line {
  key: string;
  sendKey: string;
  text: string;
  state: string;
  messageId: number | null;
  file: { key: string; name: string; type: string; body: string } | null;
}

// What a fresh page's store gives back for a room, the files read back to their words.
async function loaded(chatId: number): Promise<Line[]> {
  return page.evaluate(async (chatId) => {
    const scope: Window & { kept?: { outboxStore: (preview: (file: File) => null) => { load: (id: number) => Promise<unknown[]> } } } = window;
    const store = scope.kept!.outboxStore(() => null);
    const items = (await store.load(chatId)) as { key: string; sendKey: string; text: string; state: string; messageId: number | null; file: { key: string; file: File } | null }[];

    return Promise.all(
      items.map(async (held) => ({
        key: held.key,
        sendKey: held.sendKey,
        text: held.text,
        state: held.state,
        messageId: held.messageId,
        file: held.file === null ? null : { key: held.file.key, name: held.file.file.name, type: held.file.file.type, body: await held.file.file.text() }
      }))
    );
  }, chatId);
}

// Saves the room's lines as a page would, each change once more after the one before.
async function saved(chatId: number, steps: { key: string; state: string; messageId: number | null; withFile?: boolean }[][]): Promise<void> {
  await page.evaluate(
    async ({ chatId, steps, words }) => {
      const scope: Window & { kept?: { outboxStore: () => { save: (id: number, items: unknown[]) => Promise<void> } } } = window;
      const store = scope.kept!.outboxStore();

      for (const step of steps) {
        await store.save(
          chatId,
          step.map((line) => ({
            key: line.key,
            sendKey: `send-${line.key}`,
            text: `${words.text}${line.key}`,
            file: line.withFile === true ? { key: `picked-${line.key}`, file: new File([`${words.file}${line.key}`], `${line.key}.png`, { type: "image/png" }), previewUrl: null } : null,
            startedAt: 100,
            state: line.state,
            reason: null,
            messageId: line.messageId,
            checkingSince: null,
            reply: null
          }))
        );
      }
    },
    // The page runs on its own, so the words a line is made of are handed to it.
    { chatId, steps, words: { text: KO.line_82, file: KO.line_83 } }
  );
}

describe.skipIf(!ready)("the lines a room keeps in the browser", () => {
  test("come back after a reload in their order and state, each file with them, and the dropped ones do not", async () => {
    await opened();
    await saved(-5, [
      [
        { key: "a", state: "sending", messageId: null },
        { key: "b", state: "waiting", messageId: null, withFile: true },
        { key: "c", state: "failed", messageId: null }
      ],
      [
        { key: "a", state: "sending", messageId: 41 },
        { key: "b", state: "waiting", messageId: null, withFile: true }
      ]
    ]);
    await saved(-6, [[{ key: "other", state: "sending", messageId: null }]]);

    await page.reload();
    await page.waitForFunction(() => "kept" in window);

    expect(await loaded(-5)).toEqual([
      { key: "a", sendKey: "send-a", text: KO.line_118, state: "sending", messageId: 41, file: null },
      { key: "b", sendKey: "send-b", text: KO.line_119, state: "waiting", messageId: null, file: { key: "picked-b", name: "b.png", type: "image/png", body: KO.line_119_2 } }
    ]);
    expect((await loaded(-6)).map((line) => line.key)).toEqual(["other"]);
  });

  test("a page that saves a room leaves another tab's lines of it alone", async () => {
    await opened();
    await saved(-7, [[{ key: "mine", state: "sending", messageId: null }]]);
    await page.evaluate(async () => {
      const scope: Window & { kept?: { outboxStore: () => { save: (id: number, items: unknown[]) => Promise<void> } } } = window;
      const store = scope.kept!.outboxStore();

      await store.save(-7, []);
    });

    expect((await loaded(-7)).map((line) => line.key)).toEqual(["mine"]);
  });
});
