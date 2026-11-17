import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { closeSync, openSync, writeSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright-core";

import { fileSizeText } from "../../apps/web/shared/file-sizes";
import { wording } from "../../apps/web/shared/wording";
import { scratchDir } from "../support/scratch";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, Page } from "playwright-core";
import type { SentAttachments } from "../../apps/web/shared/types";

// The console holds a file to no limit of its own, only to the largest its room's chat services declare (docs/web.md,
// the room screen's input box): in a room on the record alone, which declares none, a file past fifty megabytes goes in
// through the box and the console's own attach route to the receiver whole; in a room whose chat service declares a
// million bytes, a file past that is turned away in the box naming the chat service and its limit. It drives the
// console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up, whose receiver stand-in
// answers a file sent whole as sent and one cut on its way as not.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "room-attach", password: "fixture-password-2364" };
// The room the harness keeps on this machine's own record, and a room on a chat service declaring a million bytes.
const RECORD_CHAT = -9_000_000_000_099;
const LIMITED_CHAT = -9_002_000_000_003;
const DECLARED = { by: "Chat B", bytes: 1_000_000 };
// Past the fifty megabytes the console once held a file to.
const LARGE_BYTES = 60 * 1024 * 1024;

// Where the files the tests pick are written, taken away once the file is done.
const scratch = scratchDir("bmo-room-file-limit-");

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

// A file of the given size on disk, named for its size as the stand-in reads it, written a mebibyte at a time.
function fileOf(bytes: number): string {
  const path = join(scratch, `${bytes}.bin`);
  const descriptor = openSync(path, "w");
  const piece = new Uint8Array(1024 * 1024).fill(7);

  try {
    for (let written = 0; written < bytes; written += piece.length) writeSync(descriptor, piece, 0, Math.min(piece.length, bytes - written));
  } finally {
    closeSync(descriptor);
  }

  return path;
}

// A room open in a page of its own, once its box and the largest file it takes have been read.
async function openRoom(chat: number): Promise<Page> {
  const context = await browser!.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block", reducedMotion: "reduce" });
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);

  const page = await context.newPage();
  const limitRead = page.waitForResponse((response) => response.url().endsWith(`/api/rooms/${chat}/file-limit`), { timeout: 60_000 });

  await page.goto(`${origin}/rooms/${chat}`, { waitUntil: "domcontentloaded" });
  await page.locator("textarea").first().waitFor({ timeout: 30_000 });
  await page.locator(`button[aria-label="${wording("room.action.attach_file")}"]`).first().waitFor({ timeout: 20_000 });
  expect((await limitRead).ok()).toBe(true);

  return page;
}

describe.skipIf(!origin || !touchReady())("a file and the largest its room takes", () => {
  test("past fifty megabytes goes in whole where the room's chat services declare no limit", async () => {
    const path = fileOf(LARGE_BYTES);
    const page = await openRoom(RECORD_CHAT);

    try {
      await page.locator("[data-attach-picker]").setInputFiles(path);
      await page.locator("[data-picked]").first().waitFor({ timeout: 30_000 });
      expect((await page.locator("[data-picked]").first().innerText()).trim()).toContain(`${LARGE_BYTES}.bin`);

      const sending = page.waitForResponse((response) => response.url().endsWith(`/api/rooms/${RECORD_CHAT}/attach`), { timeout: 180_000 });

      await page.locator("textarea").first().press("Enter");

      const answered = await sending;

      expect(answered.status()).toBe(200);
      expect((await answered.json()) as SentAttachments).toMatchObject({ sent: [{ name: `${LARGE_BYTES}.bin` }], failed: [], checking: [] });
    } finally {
      await page.context().close();
    }
  }, 300_000);

  test("past the limit a room's chat service declares is turned away in the box, naming the service and the limit", async () => {
    const bytes = 2 * DECLARED.bytes;
    const path = fileOf(bytes);
    const page = await openRoom(LIMITED_CHAT);

    try {
      await page.locator("[data-attach-picker]").setInputFiles(path);

      const said = wording("room.error.attachment_too_large", { by: DECLARED.by, limit: fileSizeText(DECLARED.bytes) });

      await page.getByText(said).first().waitFor({ timeout: 30_000 });
      // The file it turned away stands beneath the verdict, by its name and its size.
      await page.getByText(`${bytes}.bin · ${fileSizeText(bytes)}`).first().waitFor({ timeout: 10_000 });
      expect(await page.locator("[data-picked]").count()).toBe(0);
    } finally {
      await page.context().close();
    }
  }, 120_000);
});
