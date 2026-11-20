import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { wording } from "../../apps/web/shared/wording";
import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, BrowserContext, Page } from "playwright-core";

// A voice briefing that arrives plays by itself, and its player closes by itself when it ends (docs/web.md, the
// Messages section, the briefing's player). A browser that will not start a sound nobody pressed for leaves the player
// waiting, showing its play press, and that one press starts it. The voice engine's stop silences it, and nothing
// that ended before the stop plays afterwards.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up, and serves
// the briefing's arrival on the console's own stream and its sound through the console's own route.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "briefing-autoplay", password: "fixture-password-2331" };
const BRIEFING = 77;
const CHAT = -9_000_000_000_099;

// A sigh of silence, four tenths of a second long: the page's own sound, looped while a briefing waits behind it.
const SOUND = Buffer.from("UklGRiQZAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "base64");

// The voice engine's word that a briefing of the room ended done and plays by itself, at the moment it ended.
function endedFrame(id: number, at: number): string {
  return `event: voice\ndata: ${JSON.stringify({
    kind: "briefing.ended",
    id,
    at,
    data: { id, chatId: CHAT, messageId: 9, kind: "summary", title: "fixture briefing", state: "done", durationMs: 400, plays: true, synthesisId: 1, finishedAt: at }
  })}\n\n`;
}

function frame(): string {
  return endedFrame(BRIEFING, Date.now());
}

// The voice engine's word that it stopped every room's briefings, as switching the whole briefing off makes it.
function stoppedFrame(at: number): string {
  return `event: voice\ndata: ${JSON.stringify({ kind: "briefings.stopped", id: 0, at, data: { chatId: null, briefingIds: [] } })}\n\n`;
}

// The receiver's run named at the head of a stream, which the tab takes as the stream having spoken, so it opens the
// next one after its first short pause rather than backing off further.
const RUN_FRAME = `event: run\ndata: ${JSON.stringify({ run: "fixture-run" })}\n\n`;

// A briefing's sound: silence as wave data, the seconds given long. Two seconds ends well within a case and still
// plays long enough that the press is read while it plays rather than after the player went; a minute is still
// playing whenever the engine's stop comes.
const BRIEFING_SECONDS = 2;

function silence(seconds: number): Buffer {
  const rate = 8_000;
  const bytes = rate * 2 * seconds;
  const sound = Buffer.alloc(44 + bytes);

  sound.write("RIFF", 0);
  sound.writeUInt32LE(36 + bytes, 4);
  sound.write("WAVEfmt ", 8);
  sound.writeUInt32LE(16, 16);
  sound.writeUInt16LE(1, 20);
  sound.writeUInt16LE(1, 22);
  sound.writeUInt32LE(rate, 24);
  sound.writeUInt32LE(rate * 2, 28);
  sound.writeUInt16LE(2, 32);
  sound.writeUInt16LE(16, 34);
  sound.write("data", 36);
  sound.writeUInt32LE(bytes, 40);

  return sound;
}

// Whether what is read comes to what is wanted within the time given.
async function until(read: () => Promise<unknown>, want: unknown, timeoutMs: number): Promise<boolean> {
  const ended = Date.now() + timeoutMs;

  while (Date.now() < ended) {
    if ((await read()) === want) return true;

    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  return false;
}

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

// A browser of its own, launched with the autoplay policy the case measures, on the console's opening screen.
async function open(policy: string, width = 1280, height = 900): Promise<{ context: BrowserContext; page: Page; close: () => Promise<void> }> {
  const launched = await chromium.launch({ args: [`--autoplay-policy=${policy}`] });
  const context = await launched.newContext({ viewport: { width, height }, serviceWorkers: "block", reducedMotion: "reduce" });
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
  await context.route(/\/api\/briefings\/\d+\/sound/, (route) => route.fulfill({ status: 200, headers: { "content-type": "audio/wav" }, body: silence(BRIEFING_SECONDS) }));
  await context.route(/\/api\/events(\?|$)/, (route) => route.fulfill({ status: 200, headers: { "content-type": "text/event-stream", "cache-control": "no-cache" }, body: `${frame()}` }));

  const page = await context.newPage();

  await page.goto(`${origin}/`, { waitUntil: "domcontentloaded" });

  return { context, page, close: async () => { await context.close(); await launched.close(); } };
}

// A console with a sound of the page's own already playing, a report read aloud as it were, and its stream held
// until that sound plays so the briefing reaches the console during it.
async function openDuringPageSound(): Promise<{ page: Page; arrive: () => void; close: () => Promise<void> }> {
  const launched = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  const context = await launched.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block", reducedMotion: "reduce" });
  const at = cookie.indexOf("=");
  let arrive: () => void = () => undefined;
  const arrived = new Promise<void>((resolve) => (arrive = resolve));

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
  await context.route(/\/api\/briefings\/\d+\/sound/, (route) => route.fulfill({ status: 200, headers: { "content-type": "audio/wav" }, body: silence(BRIEFING_SECONDS) }));
  await context.route(/\/api\/events(\?|$)/, async (route) => {
    await arrived;

    return await route.fulfill({ status: 200, headers: { "content-type": "text/event-stream", "cache-control": "no-cache" }, body: `${frame()}` });
  });

  const page = await context.newPage();

  await page.goto(`${origin}/`, { waitUntil: "domcontentloaded" });
  await page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    const sound = document.createElement("audio");

    sound.dataset.player = "";
    sound.loop = true;
    sound.src = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
    document.body.append(sound);
    await sound.play();
  }, SOUND.toString("base64"));
  expect(await page.evaluate(() => (document.querySelector("[data-player]:not([data-briefing])") as HTMLAudioElement).paused)).toBe(false);

  return { page, arrive, close: async () => { await context.close(); await launched.close(); } };
}

// The briefing stands in the player, waiting rather than playing over the page's sound or being dropped.
async function standsWaiting(page: Page): Promise<void> {
  await page.locator("[data-briefing-popup]").waitFor({ timeout: 30_000 });
  expect(await until(async () => await page.locator("[data-briefing-press]").getAttribute("aria-label"), wording("briefing.action.listen"), 15_000)).toBe(true);
  expect(await page.evaluate(() => (document.querySelector("audio[data-briefing]") as HTMLAudioElement).paused)).toBe(true);
}

describe.skipIf(!origin || !touchReady())("a briefing that arrives", () => {
  for (const [width, height] of [[1280, 900], [360, 700]] as const) {
    test(`plays by itself and closes as it ends at ${width}`, async () => {
      const held = await open("no-user-gesture-required", width, height);

      try {
        await held.page.locator("[data-briefing-popup]").waitFor({ timeout: 30_000 });

        // No press was made: the player's press reads pause because the sound already plays.
        expect(await until(async () => await held.page.locator("[data-briefing-press]").getAttribute("aria-label"), wording("briefing.action.pause"), 15_000)).toBe(true);

        // The sound runs out, and the player goes by itself.
        expect(await until(async () => await held.page.locator("[data-briefing-popup]").count(), 0, 15_000)).toBe(true);
      } finally {
        await held.close();
      }
    }, 120_000);
  }

  test("waits for one press where the browser refuses a sound nobody pressed for", async () => {
    const held = await open("user-gesture-required");

    try {
      await held.page.locator("[data-briefing-popup]").waitFor({ timeout: 30_000 });
      expect(await until(async () => await held.page.locator("[data-briefing-press]").getAttribute("aria-label"), wording("briefing.action.listen"), 15_000)).toBe(true);

      // The one press is the gesture the browser asked for, and it starts the sound.
      await held.page.locator("[data-briefing-press]").click();
      expect(await until(async () => await held.page.locator("[data-briefing-press]").getAttribute("aria-label"), wording("briefing.action.pause"), 15_000)).toBe(true);
    } finally {
      await held.close();
    }
  }, 120_000);

  test("waits while the page plays its own sound, and starts when that sound stops", async () => {
    const held = await openDuringPageSound();

    try {
      held.arrive();
      await standsWaiting(held.page);

      // The page's sound stops, and the briefing that waited behind it starts.
      await held.page.evaluate(() => (document.querySelector("[data-player]:not([data-briefing])") as HTMLAudioElement).pause());
      expect(await until(async () => await held.page.locator("[data-briefing-press]").getAttribute("aria-label"), wording("briefing.action.pause"), 15_000)).toBe(true);
    } finally {
      await held.close();
    }
  }, 120_000);

  test("starts when the page's sound is taken away with the page", async () => {
    const held = await openDuringPageSound();

    try {
      held.arrive();
      await standsWaiting(held.page);

      // The reader leaves the page, which takes its player with it and fires no pause the document hears.
      await held.page.evaluate(() => document.querySelector("[data-player]:not([data-briefing])")?.remove());
      expect(await until(async () => await held.page.locator("[data-briefing-press]").getAttribute("aria-label"), wording("briefing.action.pause"), 15_000)).toBe(true);
    } finally {
      await held.close();
    }
  }, 120_000);
});

// A console whose stream says, one opening after another, what each of `turns` gives once it is let go: each stream
// ends after its frames, and the tab opens the next. The sounds the page asked for are kept by briefing.
async function openTurns(turns: Array<() => Promise<string>>): Promise<{ page: Page; sounds: number[]; close: () => Promise<void> }> {
  const launched = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  const context = await launched.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: "block", reducedMotion: "reduce" });
  const at = cookie.indexOf("=");
  const sounds: number[] = [];
  const sound = silence(60);
  let closing: () => void = () => undefined;
  const closed = new Promise<null>((resolve) => (closing = () => resolve(null)));
  let opened = 0;

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
  await context.route(/\/api\/briefings\/\d+\/sound/, (route) => {
    const id = Number(/\/briefings\/(\d+)\//.exec(route.request().url())?.[1]);

    if (!sounds.includes(id)) sounds.push(id);

    return route.fulfill({ status: 200, headers: { "content-type": "audio/wav" }, body: sound });
  });
  await context.route(/\/api\/events(\?|$)/, async (route) => {
    const turn = turns[opened];

    opened += 1;

    // Past the last turn the stream stays open and says nothing until the browser goes.
    const body = await Promise.race([turn === undefined ? closed : turn(), closed]);

    if (body !== null) await route.fulfill({ status: 200, headers: { "content-type": "text/event-stream", "cache-control": "no-cache" }, body: `${RUN_FRAME}${body}` }).catch(() => undefined);
  });

  const page = await context.newPage();

  await page.goto(`${origin}/`, { waitUntil: "domcontentloaded" });

  return { page, sounds, close: async () => { closing(); await context.close(); await launched.close(); } };
}

// The briefing the player's sound is, by the number in its address; null while none stands.
async function playingBriefing(page: Page): Promise<number | null> {
  return await page.evaluate(() => {
    const src = (document.querySelector("audio[data-briefing]") as HTMLAudioElement | null)?.src ?? "";
    const found = /\/briefings\/(\d+)\//.exec(src);

    return found === null ? null : Number(found[1]);
  });
}

describe.skipIf(!origin || !touchReady())("the engine's stop", () => {
  test("silences the briefing playing, starts none waiting, and lets nothing that ended before it play afterwards", async () => {
    let stopAt = 0;
    let letStop: () => void = () => undefined;
    let letOn: () => void = () => undefined;
    const stopGiven = new Promise<void>((resolve) => (letStop = resolve));
    const onGiven = new Promise<void>((resolve) => (letOn = resolve));
    const held = await openTurns([
      // Two briefings of the room end: the first plays, the second waits behind it.
      async () => `${endedFrame(81, Date.now())}${endedFrame(82, Date.now())}`,
      // The whole briefing is switched off.
      async () => {
        await stopGiven;
        stopAt = Date.now();

        return stoppedFrame(stopAt);
      },
      // Switched back on: the engine tells of one that ended before the stop, and then of one that ended after it.
      async () => {
        await onGiven;

        return `${endedFrame(83, stopAt - 1_000)}${endedFrame(84, Date.now())}`;
      }
    ]);

    try {
      expect(await until(async () => await playingBriefing(held.page), 81, 30_000)).toBe(true);
      expect(await until(async () => await held.page.locator("[data-briefing-press]").getAttribute("aria-label"), wording("briefing.action.pause"), 15_000)).toBe(true);

      letStop();
      expect(await until(async () => await held.page.locator("[data-briefing-popup]").count(), 0, 15_000)).toBe(true);

      // The next stream opens no sooner than the tab's first pause, longer than the breath the briefing waiting would
      // have started after; the one that ended after the stop plays, and nothing else did.
      letOn();
      expect(await until(async () => await playingBriefing(held.page), 84, 30_000)).toBe(true);
      expect(await until(async () => await held.page.locator("[data-briefing-press]").getAttribute("aria-label"), wording("briefing.action.pause"), 15_000)).toBe(true);
      expect(held.sounds).toEqual([81, 84]);
    } finally {
      await held.close();
    }
  }, 120_000);
});

// A browser of its own, a profile of its own in each context, whose stream says on every opening that a new briefing
// of the room ended just now. Its sound runs a minute, so it is still playing when the mute is pressed.
async function openProfiles(width: number, height: number): Promise<{ profile: () => Promise<Page>; close: () => Promise<void> }> {
  const launched = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  const at = cookie.indexOf("=");
  const sound = silence(60);
  let next = 900;

  async function profile(): Promise<Page> {
    const context = await launched.newContext({ viewport: { width, height }, serviceWorkers: "block", reducedMotion: "reduce" });

    await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
    await context.route(/\/api\/briefings\/\d+\/sound/, (route) => route.fulfill({ status: 200, headers: { "content-type": "audio/wav" }, body: sound }));
    await context.route(/\/api\/events(\?|$)/, (route) => {
      next += 1;

      return route.fulfill({ status: 200, headers: { "content-type": "text/event-stream", "cache-control": "no-cache" }, body: `${RUN_FRAME}${endedFrame(next, Date.now())}` });
    });

    const page = await context.newPage();

    await page.goto(`${origin}/`, { waitUntil: "domcontentloaded" });

    return page;
  }

  return { profile, close: async () => await launched.close() };
}

async function pressReads(page: Page, key: string): Promise<boolean> {
  return await until(async () => await page.locator("[data-briefing-press]").getAttribute("aria-label"), wording(key), 15_000);
}

describe.skipIf(!origin || !touchReady())("this device's mute", () => {
  for (const [width, height] of [[1280, 900], [360, 700]] as const) {
    test(`holds this browser's briefings across a reload, and another profile plays on, at ${width}`, async () => {
      const held = await openProfiles(width, height);

      try {
        const muted = await held.profile();
        const mute = muted.locator("[data-briefing-mute]");

        // Unmuted, the briefing plays by itself; muted, it pauses where it is and the mark says so.
        await muted.locator("[data-briefing-popup]").waitFor({ timeout: 30_000 });
        expect(await pressReads(muted, "briefing.action.pause")).toBe(true);
        expect(await mute.getAttribute("aria-label")).toBe(wording("briefing.action.mute"));
        await mute.click();
        expect(await pressReads(muted, "briefing.action.listen")).toBe(true);
        expect(await mute.getAttribute("aria-label")).toBe(wording("briefing.action.unmute"));

        // Within the player, which stands within the page at this width.
        const box = (await muted.locator("[data-briefing-popup]").boundingBox())!;
        const button = (await mute.boundingBox())!;

        expect(box.x >= 0 && box.x + box.width <= width).toBe(true);
        expect(button.x >= box.x && button.x + button.width <= box.x + box.width).toBe(true);

        // Reloaded, the next briefing comes to the player and waits for a press, still muted.
        await muted.reload({ waitUntil: "domcontentloaded" });
        await muted.locator("[data-briefing-popup]").waitFor({ timeout: 30_000 });
        expect(await pressReads(muted, "briefing.action.listen")).toBe(true);
        expect(await mute.getAttribute("aria-label")).toBe(wording("briefing.action.unmute"));
        expect(await muted.evaluate(() => (document.querySelector("audio[data-briefing]") as HTMLAudioElement).paused)).toBe(true);

        // Another profile of the same account keeps no mute, so its briefing plays by itself.
        const other = await held.profile();

        await other.locator("[data-briefing-popup]").waitFor({ timeout: 30_000 });
        expect(await pressReads(other, "briefing.action.pause")).toBe(true);
        expect(await other.locator("[data-briefing-mute]").getAttribute("aria-label")).toBe(wording("briefing.action.mute"));
      } finally {
        await held.close();
      }
    }, 120_000);
  }
});
