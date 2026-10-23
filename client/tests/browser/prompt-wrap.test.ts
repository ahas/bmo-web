import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";

import { BROWSER_HOOK_MS, touchReady } from "./touch";

import type { Browser, CDPSession, Page } from "playwright-core";

// A line written in the room's input box keeps its breaks while the writing goes on (docs/web.md, 「A
// line written in an input box keeps its breaks while the writing goes on」): Hangul words typed one
// syllable at a time through an input method, each syllable composed through its lone initial and its
// open form before it is committed, and after every step no break standing before the letter being
// written has moved, gone or come.
//
// A textarea gives no rectangle for its letters, so its lines are read off a copy of it laid out by its
// own computed style, one span to a letter, and the copy is held to the box by its line count at every
// step.
//
// It drives the console given in BMO_CONSOLE_TEST_URL, the one tests/support/browser-console.ts stands up:
// the development server on a scratch database, with stand-ins for the units it reads and this file's fixture
// account made there as an administrator, so the owner's room opens to it (docs/checks.md, 「How the suite
// runs the tests」). The suite stands up no console, so there it skips.

const origin = process.env.BMO_CONSOLE_TEST_URL;
const ACCOUNT = { name: "prompt-wrap", password: "fixture-password-1575" };
const WIDTHS = [
  { width: 1280, height: 800, phone: false },
  { width: 360, height: 780, phone: true }
];
const TEST_MS = 120_000;

// The compatibility letter an input method shows for each of the nineteen initials before a vowel joins it.
const INITIALS = [0x3131, 0x3132, 0x3134, 0x3137, 0x3138, 0x3139, 0x3141, 0x3142, 0x3143, 0x3145, 0x3146, 0x3147, 0x3148, 0x3149, 0x314a, 0x314b, 0x314c, 0x314d, 0x314e];
const SYLLABLES = 0xac00;

type Step = { compose: string } | { commit: string };

// Thirty words of one to five syllables, the same ones on every run.
function writing(): Step[] {
  let seed = 7;
  const next = (below: number) => {
    seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
    return (seed >> 16) % below;
  };
  const steps: Step[] = [];

  for (let word = 0; word < 30; word += 1) {
    for (let syllable = 1 + next(5); syllable > 0; syllable -= 1) {
      const initial = next(19);
      const open = SYLLABLES + (initial * 21 + next(21)) * 28;
      const final = next(3) === 0 ? 1 + next(27) : 0;

      steps.push({ compose: String.fromCodePoint(INITIALS[initial]!) }, { compose: String.fromCodePoint(open) });

      if (final !== 0) {
        steps.push({ compose: String.fromCodePoint(open + final) });
      }

      steps.push({ commit: String.fromCodePoint(open + final) });
    }

    steps.push({ commit: " " });
  }

  return steps;
}

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

// Where each line after the first begins, as a letter's place in the box's words, and how many lines
// the box itself holds.
async function lines(page: Page): Promise<{ starts: number[]; held: number }> {
  return await page.evaluate(() => {
    const box = [...document.querySelectorAll("textarea")].filter((each) => each.getClientRects().length > 0).at(-1)!;
    const style = getComputedStyle(box);
    const copy = document.createElement("div");

    for (const property of style) {
      copy.style.setProperty(property, style.getPropertyValue(property));
    }

    Object.assign(copy.style, {
      position: "fixed",
      top: "0",
      left: "-9999px",
      height: "auto",
      maxHeight: "none",
      overflow: "visible",
      boxSizing: "content-box",
      width: `${box.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight)}px`
    });
    document.body.append(copy);

    const letters = [...box.value].map((letter) => copy.appendChild(Object.assign(document.createElement("span"), { textContent: letter })));
    const starts: number[] = [];
    let top: number | null = null;

    letters.forEach((letter, at) => {
      const rect = letter.getClientRects()[0];

      if (rect !== undefined && (top === null || rect.top > top + 2)) {
        if (top !== null) {
          starts.push(at);
        }

        top = rect.top;
      }
    });
    copy.remove();

    const padding = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);

    return { starts, held: Math.round((box.scrollHeight - padding) / Number.parseFloat(style.lineHeight)) };
  });
}

async function type(input: CDPSession, step: Step): Promise<void> {
  if ("compose" in step) {
    await input.send("Input.imeSetComposition", { text: step.compose, selectionStart: 1, selectionEnd: 1 });
  } else {
    await input.send("Input.insertText", { text: step.commit });
  }
}

describe.skipIf(!origin || !touchReady())("the room's input box while it is written in", () => {
  for (const viewport of WIDTHS) {
    test(`no written line moves as Hangul is composed at ${viewport.width}px`, async () => {
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

      try {
        const page = await context.newPage();

        // Typed into before the page has taken over, the words would be dropped as it does.
        await page.goto(`${origin}/rooms/${owner}`, { waitUntil: "load" });
        await page.waitForFunction(() => {
          const root: (Element & { __vue_app__?: { $nuxt?: { isHydrating?: boolean } } }) | null = document.querySelector("#__nuxt");

          return root?.__vue_app__?.$nuxt?.isHydrating === false;
        });
        await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);

        const box = page.locator("textarea:visible").last();

        await box.waitFor();
        await box.fill("");
        await box.focus();

        const input = await context.newCDPSession(page);
        const moved: string[] = [];
        const astray: number[] = [];
        let before: number[] = [];
        let written = 0;
        let lineCount = 0;

        for (const [at, step] of writing().entries()) {
          await type(input, step);

          const now = await lines(page);
          const gone = before.filter((start) => !now.starts.includes(start));
          const come = now.starts.filter((start) => !before.includes(start) && start < written);

          if (gone.length > 0 || come.length > 0) {
            moved.push(`step ${at} at letter ${written}: gone ${gone.join(",")} come ${come.join(",")}`);
          }

          if (now.starts.length + 1 !== now.held) {
            astray.push(at);
          }

          before = now.starts;
          lineCount = now.held;

          if ("commit" in step) {
            written = [...(await box.inputValue())].length;
          }
        }

        await box.fill("");

        // The words ran over several lines, so a break had the chance to move.
        expect(lineCount).toBeGreaterThan(2);
        expect(astray).toEqual([]);
        expect(moved).toEqual([]);
      } finally {
        await context.close();
      }
    }, TEST_MS);
  }
});
