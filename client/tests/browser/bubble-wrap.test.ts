import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, BrowserContext, Page, Route } from "playwright-core";
import type { ArchivedMessage, Judgement, MessageAttachment } from "../../apps/web/shared/types";
import KO from "../fixtures/browser/bubble-wrap.test.ko.json";

// What a bubble holds keeps inside it, at a phone's widths and a desktop's (docs/web.md, 「Every message
// is a bubble」, the room screen's meta line section, the room screen's listening section):
// - a kept sound stands as a player taking its bubble's whole room, 320 px or the bubble's widest where
//   that is narrower, or wider where its words are, and every other file line keeps inside the bubble the
//   same way;
// - the words break between words, a Korean one included, and the blank they keep for a meta line at
//   their end takes no letter of theirs onto a line of its own: where it has no room on the last line,
//   it alone drops.
// The room is a fixture this test serves itself through the page's own routes, its words of every
// length from a few words to several lines, so at every width some last line leaves the meta line
// room and some just does not. The console around it is the one given in BMO_CONSOLE_TEST_URL, which
// tests/support/browser-console.ts stands up on a scratch database with stand-ins for the units it reads,
// this file's fixture account made there (docs/checks.md, 「How the suite runs the tests」); the suite
// stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "bubble-wrap", password: "fixture-password-1477" };
const WIDTHS = [
  { width: 360, height: 780, phone: true },
  { width: 390, height: 844, phone: true },
  { width: 1280, height: 800, phone: false }
];
const CHAT = -100_000_001_477;
const PLAYER = 320;
const TEST_MS = 90_000;

let browser: Browser | null = null;
let cookie = "";
let owner = 0;

beforeAll(async () => {
  if (!origin || !touchReady()) {
    return;
  }

  const login = await fetch(`${origin}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(ACCOUNT)
  });

  expect(login.ok).toBe(true);
  cookie = login.headers.get("set-cookie")!.split(";")[0]!;

  const asked = await fetch(`${origin}/api/owner`, { headers: { cookie } });

  owner = ((await asked.json()) as { chatId: number | null }).chatId ?? 1;
  browser = await chromium.launch();
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();
}, BROWSER_HOOK_MS);

// Twelve seconds of silence, so the player measures a length and stands its bar and clock.
function silence(seconds: number): Uint8Array {
  const rate = 8_000;
  const samples = rate * seconds;
  const bytes = new Uint8Array(44 + samples).fill(128);
  const view = new DataView(bytes.buffer);
  const text = (at: number, word: string) => [...word].forEach((letter, index) => view.setUint8(at + index, letter.charCodeAt(0)));

  text(0, "RIFF");
  view.setUint32(4, 36 + samples, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  text(36, "data");
  view.setUint32(40, samples, true);

  return bytes;
}

const SOUND = silence(12);
const PICTURE = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#4a7"/></svg>`;

let clock = 1_791_500_000;
let next = 7_000;

function row(text: string, mine: boolean, extra: Partial<ArchivedMessage> = {}): ArchivedMessage {
  clock += 60;

  const messageId = String(next++);

  return {
    chatId: CHAT,
    messageId,
    // The owner's number is known only once the console is asked; the room is served with it.
    senderId: mine ? -1 : 0,
    senderName: mine ? ACCOUNT.name : "agent-a",
    sentAt: clock,
    text,
    imagePath: null,
    replyToMessageId: null,
    agent: !mine,
    ...extra
  };
}

function file(id: number, kind: MessageAttachment["kind"], name: string, type: string, bytes: number): MessageAttachment {
  return { id, kind, name, bytes, type, available: true };
}

const FILES: ArchivedMessage[] = [
  row(KO.line_114, false, {
    attachments: [file(1, "audio", "12424-voice.ogg", "audio/ogg", 92_160)]
  }),
  row("", false, { attachments: [file(2, "audio", "12430-voice.ogg", "audio/ogg", 92_160)] }),
  row(KO.line_118, false, {
    attachments: [file(3, "audio", "2026-10-09-weekly-briefing-voice-recording-final-master-version-02.ogg", "audio/ogg", 4_718_592)]
  }),
  row(KO.line_121, true, { attachments: [file(4, "audio", "memo.m4a", "audio/mp4", 20_480)] }),
  row(KO.line_122, false, {
    attachments: [file(5, "document", "2026-10-09-infrastructure-review-meeting-notes-and-follow-up-actions.pdf", "application/pdf", 1_258_291)]
  }),
  row(KO.line_125, false, { imagePath: "fixture.svg" })
];

// Words of every length, on both sides, so at each width some last line just holds the meta line
// and some just does not; and a web address longer than any bubble.
const POOL = KO.line_130.split(" ");
const LONG = "https://example.com/bmo/console/rooms/-100000001477/messages/7000/attachments/12424-voice.ogg?item=1&as=download";

const WORDS: ArchivedMessage[] = [
  row(KO.line_134, true),
  ...Array.from({ length: 34 }, (_, at) => row(Array.from({ length: at + 2 }, (_, word) => POOL[word % POOL.length]).join(" "), at % 2 === 0)),
  row(`${KO.line_136}${LONG}`, true),
  row(`${KO.line_137}${LONG}`, false)
];

const ROWS = [...FILES, ...WORDS];

// An agent's words written in markdown, read as their chat shows them (docs/web.md, 「A bubble reads as its
// message does in the chat」): formatting the chat has, what it lays flat, a spoiler, a code block and a bare
// address. Served in the rows' place by the test that reads it.
const FORMATTED = row(
  "# Heading\n\nSome **bold** and *italic*, a ||secret|| and `code`.\n\n- one\n- two\n\n> quoted\n\n```sh\nls -la\n```\n\nSee https://example.com/formatted now.",
  false
);
// A tall narrow picture under words wider than it, so the bubble is wider than its picture.
const NARROW_PICTURE = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="600"><rect width="200" height="600" fill="#a47"/></svg>`;
const NARROW = row("A caption long enough to make the bubble wider than the tall narrow picture above it.", false, { imagePath: "narrow.svg" });
// The rows the room is served with: every row, or the ones a test puts in their place.
let served: ArchivedMessage[] = ROWS;
// A verdict on each of the owner's words, so their meta line carries its mark as the owner's does.
const JUDGEMENTS: Judgement[] = WORDS.filter((each) => each.agent === false).map((each, at) => ({
  id: 90_000 + at,
  chatId: CHAT,
  messageId: each.messageId,
  stage: "content-judge",
  verdict: "PASS",
  detail: null,
  createdAt: each.sentAt
}));

async function open(viewport: (typeof WIDTHS)[number]): Promise<BrowserContext> {
  const context = await browser!.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    isMobile: viewport.phone,
    hasTouch: viewport.phone,
    serviceWorkers: "block",
    reducedMotion: "reduce"
  });
  const at = cookie.indexOf("=");

  await context.addCookies([{ name: cookie.slice(0, at), value: cookie.slice(at + 1), url: origin! }]);
  await context.route(/\/api\/control$/, (route) => route.fulfill({ json: { reachable: true, ownerChatId: owner } }));
  await context.route(/\/api\/events(\?|$)/, (route) => route.abort());
  await context.route(/\/api\/rooms$/, (route) =>
    route.fulfill({
      json: [{ chatId: CHAT, title: KO.line_167, messageCount: ROWS.length, lastMessageAt: ROWS.at(-1)!.sentAt, unread: 0, firstUnread: null, readTo: null }]
    })
  );
  await context.route(new RegExp(`/api/rooms/${CHAT}/`), answerRoom);
  await context.route(new RegExp(`/api/media/audio/${CHAT}/`), (route) => route.fulfill({ contentType: "audio/wav", body: Buffer.from(SOUND) }));
  await context.route(new RegExp(`/api/images/${CHAT}/`), (route) => route.fulfill({ contentType: "image/svg+xml", body: PICTURE }));

  return context;
}

async function answerRoom(route: Route): Promise<void> {
  const url = new URL(route.request().url());

  if (url.pathname.endsWith("/messages")) {
    const whole = !url.searchParams.has("before") && !url.searchParams.has("after");

    const messages = served.map((each) => (each.senderId === -1 ? { ...each, senderId: owner } : each));

    await route.fulfill({ json: { messages: whole ? messages : [], judgements: whole && served === ROWS ? JUDGEMENTS : [], hasMore: false } });
  } else if (url.pathname.endsWith("/read")) {
    await route.fulfill({ json: { unread: 0, firstUnread: null, readTo: null } });
  } else {
    await route.fulfill({ status: 404, json: { message: "no such fixture" } });
  }
}

// The room entered from inside the console, as a person goes to it.
async function enter(page: Page): Promise<void> {
  const listed = page.waitForResponse(/\/api\/rooms$/);

  await page.goto(`${origin}/`, { waitUntil: "load" });
  await page.waitForFunction(() => {
    const root: (Element & { __vue_app__?: { $nuxt?: { isHydrating?: boolean } } }) | null = document.querySelector("#__nuxt");

    return root?.__vue_app__?.$nuxt?.isHydrating === false;
  });
  await listed;
  await page.evaluate(async (path) => {
    const root: (Element & { __vue_app__?: { config: { globalProperties: { $router: { push: (to: string) => Promise<unknown> } } } } }) | null = document.querySelector("#__nuxt");

    await root!.__vue_app__!.config.globalProperties.$router.push(path);
  }, `/rooms/${CHAT}`);
}

// The room entered from inside the console, as a person goes to it, its rows all standing, their
// players measured and their bubbles fitted. A player at rest says its sound's length on its meta line
// once it has read it, so a player is measured when that clock stands there.
async function visit(page: Page): Promise<void> {
  await enter(page);

  for (const each of ROWS) {
    await page.locator(`[data-message="m${each.messageId}"]`).waitFor({ state: "attached", timeout: 20_000 });
  }

  await page.locator(`[data-message="m${FILES.at(-1)!.messageId}"] img`).waitFor({ state: "attached", timeout: 20_000 });

  // An agent's words are drawn by the markdown renderer, which loads after the row stands, so a web address
  // in them is a link only once it has; the words are read when every address stands as one. The plain form
  // the row first drew is replaced in the same pass, but a slower machine can be measured between the two,
  // when the address still stands as text beside its link, so that form is waited out as well.
  for (const each of WORDS.filter((row) => row.text.includes(LONG))) {
    await page.locator(`[data-message="m${each.messageId}"] a[href="${LONG}"]`).first().waitFor({ state: "attached", timeout: 20_000 });
    await page.waitForFunction(([messageId, address]) => {
      const words = document.querySelector(`[data-message="m${messageId}"] [data-words]:not([data-name])`);

      if (words === null) return false;

      const walker = document.createTreeWalker(words, NodeFilter.SHOW_TEXT);

      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        if (node.textContent?.includes(address) === true && node.parentElement?.closest("a") === null) return false;
      }

      return true;
    }, [each.messageId, LONG] as const, { timeout: 20_000 });
  }
  await page.waitForFunction(
    (count) => [...document.querySelectorAll("[data-attachment]")].filter((block) => /\d+:\d+/.test(block.textContent ?? "")).length === count,
    FILES.filter((each) => each.attachments?.[0]?.kind === "audio").length,
    { timeout: 20_000 }
  );
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
}

interface Placed {
  message: string;
  width: number;
  // How far the block, and the last button in it, reach past the room the bubble keeps inside its
  // padding, on either side; nought or less is inside.
  pastStart: number;
  pastEnd: number;
  buttonPastEnd: number;
  // How much the bubble's cut hides of what it holds, sideways.
  hidden: number;
  // How much room the bubble keeps inside its padding.
  room: number;
}

// Every file block the room stands, against the bubble it stands in.
async function placed(page: Page): Promise<Placed[]> {
  return await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("[data-message] [data-attachment]")].map((block) => {
      const message = /^m(-?\d+)$/.exec(block.closest<HTMLElement>("[data-message]")!.dataset.message ?? "")?.[1] ?? "";
      const cut = block.closest<HTMLElement>("[data-bubble]")!.firstElementChild as HTMLElement;
      // The body the block's line stands in keeps the bubble's padding.
      const body = block.parentElement!.parentElement!;
      const look = getComputedStyle(body);
      const frame = body.getBoundingClientRect();
      const start = frame.left + Number.parseFloat(look.paddingLeft);
      const end = frame.right - Number.parseFloat(look.paddingRight);
      const box = block.getBoundingClientRect();
      const buttons = block.querySelectorAll("button, a");
      const last = buttons[buttons.length - 1]!.getBoundingClientRect();

      return {
        message,
        width: box.width,
        pastStart: start - box.left,
        pastEnd: box.right - end,
        buttonPastEnd: last.right - end,
        hidden: cut.scrollWidth - cut.clientWidth,
        room: end - start
      };
    })
  );
}

interface Worded {
  message: string;
  // The lines the letters stand on, as each one's foot and reach, with the blank at their end and
  // again with it taken away at the same bubble width.
  lines: string[];
  bare: string[];
  // Where the words break between two letters with no space between them, as the two letters.
  midWord: string[];
  // Whether the meta line is one that may stand at the words' end, whether it stands at the end of their
  // last line of letters, and whether it covers any.
  inline: boolean;
  besideLast: boolean;
  covers: boolean;
  hidden: number;
}

// Every bubble of words: its letters' lines with the blank kept for a meta line at their end and
// without it, read in one pass so the bubble's width is the same for both.
async function worded(page: Page): Promise<Worded[]> {
  return await page.evaluate(() => {
    const bubbles = [...document.querySelectorAll<HTMLElement>("[data-message]")].filter((each) => each.querySelector("[data-words]:not([data-name])") !== null);
    const letters = (words: HTMLElement): DOMRect[] => {
      const boxes: DOMRect[] = [];
      const walker = document.createTreeWalker(words, NodeFilter.SHOW_TEXT);

      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        const range = document.createRange();

        range.selectNodeContents(node);
        boxes.push(...[...range.getClientRects()].filter((box) => box.width > 0));
      }

      return boxes;
    };
    // Read from the words' own corner, since a blank taken away above moves every bubble under it.
    const lines = (words: HTMLElement): string[] => {
      const feet = new Map<number, number>();
      const corner = words.getBoundingClientRect();

      for (const box of letters(words)) {
        const foot = Math.round(box.bottom - corner.top);

        feet.set(foot, Math.max(feet.get(foot) ?? 0, Math.round(box.right - corner.left)));
      }

      return [...feet].sort(([one], [other]) => one - other).map(([foot, reach]) => `${foot}:${reach}`);
    };
    const midWord = (words: HTMLElement): string[] => {
      const breaks: string[] = [];
      const walker = document.createTreeWalker(words, NodeFilter.SHOW_TEXT);

      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        // A web address folds anywhere, as it must.
        if (node.parentElement?.closest("a") !== null) {
          continue;
        }

        const text = node.textContent ?? "";
        const range = document.createRange();
        const foot = (at: number) => {
          range.setStart(node!, at);
          range.setEnd(node!, at + 1);

          return Math.round(range.getBoundingClientRect().bottom);
        };

        for (let at = 0; at + 1 < text.length; at++) {
          if (text[at]!.trim() !== "" && text[at + 1]!.trim() !== "" && foot(at) !== foot(at + 1)) {
            breaks.push(text.slice(at, at + 2));
          }
        }
      }

      return breaks;
    };
    const blanks = document.createElement("style");

    blanks.textContent = "[data-meta-room] [data-words] *::after { content: none !important; }";

    const withBlank = bubbles.map((bubble) => lines(bubble.querySelector<HTMLElement>("[data-words]:not([data-name])")!));
    // Each bubble held at the width it stands at, since one that fits its contents would narrow
    // with its blank gone and wrap its words elsewhere.
    const held = bubbles.map((bubble) => {
      const frame = bubble.querySelector<HTMLElement>("[data-bubble]")!;
      const width = frame.style.width;

      frame.style.width = `${frame.getBoundingClientRect().width}px`;

      return () => (frame.style.width = width);
    });

    document.head.append(blanks);

    const bare = bubbles.map((bubble) => lines(bubble.querySelector<HTMLElement>("[data-words]:not([data-name])")!));

    blanks.remove();
    held.forEach((release) => release());

    return bubbles.map((bubble, at) => {
      const words = bubble.querySelector<HTMLElement>("[data-words]:not([data-name])")!;
      const meta = bubble.querySelector<HTMLElement>("[data-meta]")!.getBoundingClientRect();
      const boxes = letters(words);
      const foot = Math.max(...boxes.map((box) => box.bottom));
      const cut = bubble.querySelector<HTMLElement>("[data-bubble]")!.firstElementChild as HTMLElement;

      return {
        message: /^m(-?\d+)$/.exec(bubble.dataset.message ?? "")?.[1] ?? "",
        lines: withBlank[at]!,
        bare: bare[at]!,
        midWord: midWord(words),
        inline: bubble.querySelector("[data-meta-inline]") !== null,
        besideLast: meta.top < foot - 1,
        covers: boxes.some((box) => box.bottom > meta.top && box.top < meta.bottom && box.right > meta.left && box.left < meta.right),
        hidden: cut.scrollWidth - cut.clientWidth
      };
    });
  });
}

describe.skipIf(!origin || !touchReady())("an agent's words in a bubble", () => {
  test("stand as their chat shows them: its formatting, what it lays flat, a spoiler a press uncovers, a code block in its box", async () => {
    const context = await open(WIDTHS[2]!);

    served = [FORMATTED];

    try {
      const page = await context.newPage();

      await enter(page);

      const words = page.locator(`[data-message="m${FORMATTED.messageId}"] .markdown--message`);

      // The reading arrives after the row stands; the bubble is read once it has drawn the words.
      await words.locator("b").first().waitFor({ state: "attached", timeout: 30_000 });

      const drawn = await words.evaluate((root) => ({
        bold: root.querySelector("b")?.textContent,
        italic: root.querySelector("i")?.textContent,
        code: root.querySelector(":scope > code")?.textContent,
        quote: root.querySelector("blockquote")?.textContent,
        flat: root.querySelectorAll("h1, h2, ul, ol, li, table").length,
        text: (root as HTMLElement).innerText,
        box: root.querySelector(".markdown-code")?.getAttribute("data-language"),
        fenced: root.querySelector(".markdown-code pre code")?.textContent?.trim(),
        copy: root.querySelectorAll(".markdown-code [data-copy]").length,
        link: root.querySelector('a[href="https://example.com/formatted"]')?.getAttribute("target"),
        breaks: getComputedStyle(root).whiteSpace
      }));

      expect(drawn).toMatchObject({
        bold: "bold", italic: "italic", code: "code", quote: "quoted", flat: 0, box: "sh", fenced: "ls -la", copy: 1, link: "_blank", breaks: "pre-wrap"
      });
      // What the chat has no formatting for is laid flat: the heading its words, the list behind its marks.
      expect(drawn.text).toContain("Heading");
      expect(drawn.text).toContain("• one\n• two");

      // The spoiler is covered until it is pressed, and covered again by the next press.
      const spoiler = words.locator("[data-spoiler]");
      const covered = () => spoiler.evaluate((span) => ({ shown: span.hasAttribute("data-shown"), ink: getComputedStyle(span).color }));

      expect(await spoiler.textContent()).toBe("secret");
      expect(await covered()).toEqual({ shown: false, ink: "rgba(0, 0, 0, 0)" });
      await spoiler.click();
      expect((await covered()).shown).toBe(true);
      expect((await covered()).ink).not.toBe("rgba(0, 0, 0, 0)");
      await spoiler.click();
      expect((await covered()).shown).toBe(false);
    } finally {
      served = ROWS;
      await context.close();
    }
  }, TEST_MS);
});

describe.skipIf(!origin || !touchReady())("a picture narrower than its bubble", () => {
  test("stands in the middle of the bubble's width, over its own blurred copy filling the sides", async () => {
    const context = await open(WIDTHS[2]!);

    await context.route(new RegExp(`/api/images/${CHAT}/`), (route) => route.fulfill({ contentType: "image/svg+xml", body: NARROW_PICTURE }));
    served = [NARROW];

    try {
      const page = await context.newPage();

      await enter(page);

      const picture = page.locator(`[data-message="m${NARROW.messageId}"] button img:not([data-stand-in])`);

      await picture.waitFor({ state: "attached", timeout: 30_000 });
      await page.waitForFunction((id) => {
        const drawn = document.querySelector<HTMLImageElement>(`[data-message="m${id}"] button img:not([data-stand-in])`);

        return drawn !== null && drawn.complete && drawn.naturalWidth > 0;
      }, NARROW.messageId, { timeout: 30_000 });

      const placed = await picture.evaluate((drawn) => {
        const image = drawn as HTMLImageElement;
        const box = image.closest("button")!;
        const backdrop = box.querySelector<HTMLElement>("[data-picture-backdrop]");
        const frame = box.getBoundingClientRect();
        // The picture is drawn contained in its box: its drawn width is its height at its own ratio.
        const drawnWidth = frame.height * (image.naturalWidth / image.naturalHeight);
        const look = getComputedStyle(image);

        return {
          box: Math.round(frame.width),
          own: Math.round(drawnWidth),
          fit: look.objectFit,
          at: look.objectPosition,
          fills: Math.round(image.getBoundingClientRect().width) === Math.round(frame.width),
          backdrop: backdrop === null ? null : {
            blur: getComputedStyle(backdrop).filter,
            fit: getComputedStyle(backdrop).backgroundSize,
            shows: getComputedStyle(backdrop).backgroundImage.includes(new URL(image.src).pathname),
            covers: Math.round(backdrop.getBoundingClientRect().width) >= Math.round(frame.width)
          },
          images: box.querySelectorAll("img:not([data-stand-in])").length,
          cut: getComputedStyle(box).overflow
        };
      });

      // The bubble is wider than the picture, the picture is drawn whole in the middle of that width, and its
      // blurred copy covers the box behind it, cut at the box's edges.
      expect(placed.box).toBeGreaterThan(placed.own + 40);
      expect(placed).toMatchObject({ fit: "contain", at: "50% 50%", fills: true, cut: "hidden" });
      expect(placed.backdrop).toMatchObject({ fit: "cover", shows: true, covers: true });
      // The copy is no image element of its own: the bubble holds the one picture.
      expect(placed.images).toBe(1);
      expect(placed.backdrop!.blur).toContain("blur(");
    } finally {
      served = ROWS;
      await context.close();
    }
  }, TEST_MS);
});

describe.skipIf(!origin || !touchReady())("what a bubble holds keeps inside it", () => {
  for (const viewport of WIDTHS) {
    test(`every player and file line stands inside its bubble, and the words keep their lines, at ${viewport.width}px`, async () => {
      const context = await open(viewport);

      try {
        const page = await context.newPage();

        await visit(page);

        const blocks = await placed(page);

        expect(blocks.map((block) => block.message)).toEqual(FILES.filter((each) => each.attachments !== undefined).map((each) => each.messageId));

        for (const block of blocks) {
          expect(block.pastStart).toBeLessThanOrEqual(0.5);
          expect(block.pastEnd).toBeLessThanOrEqual(0.5);
          expect(block.buttonPastEnd).toBeLessThanOrEqual(0.5);
          expect(block.hidden).toBe(0);
        }

        // A player takes its bubble's whole room, which is 320 px, or the bubble's widest where that is
        // narrower, or wider where the words beside the player are wider.
        const widest = Math.max(...blocks.map((block) => block.room));

        for (const player of blocks.slice(0, 4)) {
          expect(Math.abs(player.width - player.room)).toBeLessThanOrEqual(0.5);
          expect(player.width).toBeGreaterThanOrEqual(Math.min(PLAYER, widest) - 0.5);
        }

        const bubbles = await worded(page);

        expect(bubbles.map((bubble) => bubble.message)).toEqual(expect.arrayContaining(WORDS.map((each) => each.messageId)));

        // Each failing bubble is named with what it did, so a failure says which words and how.
        // The words stand on as many lines with the blank as without it; which words end which line may
        // differ, since the room balances its lines and the blank on the last one is part of it.
        expect(bubbles.filter((bubble) => bubble.lines.length !== bubble.bare.length).map(({ message, lines, bare }) => ({ message, lines, bare }))).toEqual([]);
        expect(bubbles.filter((bubble) => bubble.midWord.length > 0).map(({ message, midWord }) => ({ message, midWord }))).toEqual([]);
        expect(bubbles.filter((bubble) => bubble.covers || bubble.hidden !== 0).map(({ message, covers, hidden }) => ({ message, covers, hidden }))).toEqual([]);

        // Some last lines left the meta line room and some did not, so both ways were read.
        const inline = bubbles.filter((bubble) => bubble.inline);

        expect(inline.some((bubble) => bubble.besideLast)).toBe(true);
        expect(inline.some((bubble) => !bubble.besideLast)).toBe(true);

        // The owner's sentence that brought this about stands on one line at a phone's width too.
        expect(bubbles.find((bubble) => bubble.message === WORDS[0]!.messageId)!.lines).toHaveLength(1);
      } finally {
        await context.close();
      }
    }, TEST_MS);
  }
});
