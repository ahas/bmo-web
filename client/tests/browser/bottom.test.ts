import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chromium } from "playwright-core";
import type { Browser, Page } from "playwright-core";
import { BROWSER_HOOK_MS, openTouch, touchReady } from "./touch";

const ready = touchReady();
const built = ready ? await Bun.build({
  entrypoints: ["../../apps/web/app/domain/bottom.ts", "../../apps/web/app/domain/first-line.ts"].map(path => new URL(path, import.meta.url).pathname),
  target: "browser",
}) : null;
const script = built === null ? "" : (await Promise.all(built.outputs.map(output => output.text()))).join("\n");

// One browser for the file, each test on a page of its own. A browser started while the other files
// hold the cores takes seconds to come up, which a hook opening one is given and a test is not.
let browser: Browser;

beforeAll(async () => {
  if (ready) browser = await answered("Chromium starting", chromium.launch(), BROWSER_HOOK_MS);
}, BROWSER_HOOK_MS);

afterAll(async () => {
  await browser?.close();
}, BROWSER_HOOK_MS);

// Exercise the shipped controller in the browser's layout/event pipeline. In particular a
// ResizeObserver test double cannot reproduce scroll events arriving after content growth.
// A conversation's rows keep the scroll margin a held day mark asks of them.
// The browser's own scroll anchoring stays off unless a test is about it.
async function mount(page: Page, options = "{}", anchoring = "none"): Promise<void> {
  await page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1">
    <style>[data-row] { scroll-margin-top: 40px }</style>
    <div id="viewport" style="height:400px;width:300px;overflow-y:auto;overflow-anchor:${anchoring}">
      <div id="content"><div style="height:1200px">older messages</div></div>
    </div>`);
  await page.addScriptTag({ type: "module", content: script + `
    window.follower = followBottom(document.getElementById('viewport'), document.getElementById('content'), ${options});
    window.follower.jump();` });
  await loaded(page, "the follower to mount", () => "follower" in window);
  await frames(page);
}

// Every wait of this file has a deadline and names what it waited for, so a browser that stops
// answering fails the test saying what did not come rather than holding it until it is cut. A wait
// inside the page carries a deadline of its own, which tells frames that stopped coming from a scroll
// that kept moving; the one around it says the page or the browser itself stopped answering.
const WAIT_MS = 8_000;

async function answered<T>(what: string, work: Promise<T>, ms = WAIT_MS + 2_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([work, new Promise<never>((_, fail) => { timer = setTimeout(() => fail(new Error(`no answer came for ${what} within ${ms}ms`)), ms); })]);
  } finally {
    clearTimeout(timer);
  }
}

// A condition looked at on a clock of its own rather than on animation frames, which are what may
// have stopped.
async function loaded(page: Page, what: string, ready: (arg: number) => boolean, arg = 0): Promise<void> {
  await answered(what, page.waitForFunction(ready, arg, { polling: 50, timeout: WAIT_MS }).catch((error: unknown) => {
    throw new Error(`${what} did not come within ${WAIT_MS}ms: ${error instanceof Error ? error.message.split("\n")[0] : String(error)}`);
  }));
}

const CHAT = "{ ...readsFromFirstLine(() => document.getElementById('content')), smooth: true }";

// A glide ends when the offset has stood still for a few frames running. One that has not by the
// deadline says whether frames stopped coming or the offset kept moving, and where it last stood.
async function glided(page: Page): Promise<void> {
  await answered("the glide coming to rest", page.locator("#viewport").evaluate((e, ms) => new Promise<void>((resolve, fail) => {
    let last = -1;
    let still = 0;
    const seen: number[] = [];
    const deadline = setTimeout(() => fail(new Error(seen.length === 0
      ? `no animation frame came within ${ms}ms while a glide was waited for`
      : `the scroll did not come to rest within ${ms}ms over ${seen.length} frames: its last offsets ${seen.slice(-8).join(", ")}, the end at ${e.scrollHeight - e.clientHeight}`)), ms);
    const look = (): void => {
      seen.push(e.scrollTop);
      still = e.scrollTop === last ? still + 1 : 0;
      last = e.scrollTop;
      if (still >= 5) {
        clearTimeout(deadline);
        resolve();
      } else requestAnimationFrame(look);
    };
    requestAnimationFrame(look);
  }), WAIT_MS));
}

async function say(page: Page, height: number, mine = false): Promise<void> {
  await page.locator("#content").evaluate((e, { height, mine }) => {
    const row = document.createElement("div");
    row.style.height = `${height}px`;
    row.dataset.row = String(e.children.length);
    if (mine) row.dataset.mine = "";
    e.append(row);
  }, { height, mine });
  await frames(page);
}

// How far below the viewport's top a row stands.
async function rowTop(page: Page, row: number): Promise<number> {
  return page.evaluate(row => document.querySelector(`[data-row="${row}"]`)!.getBoundingClientRect().top
    - document.getElementById("viewport")!.getBoundingClientRect().top, row);
}

async function frames(page: Page): Promise<void> {
  await answered("two animation frames", page.evaluate(ms => new Promise<void>((resolve, fail) => {
    const deadline = setTimeout(() => fail(new Error(`no animation frame came within ${ms}ms`)), ms);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      clearTimeout(deadline);
      resolve();
    }));
  }), WAIT_MS));
}

async function metrics(page: Page) {
  return page.locator("#viewport").evaluate(e => ({
    top: e.scrollTop, gap: e.scrollHeight - e.scrollTop - e.clientHeight,
  }));
}

async function grow(page: Page, height = 600): Promise<void> {
  await page.locator("#content").evaluate((e, height) => {
    const row = document.createElement("div");
    row.style.height = `${height}px`;
    row.textContent = "new message";
    e.append(row);
  }, height);
  await frames(page);
}

async function desktop(run: (page: Page) => Promise<void>): Promise<void> {
  const page = await answered("a new page", browser.newPage());
  try {
    await mount(page);
    await run(page);
  } finally {
    await answered("the page closing", page.close());
  }
}

async function chat(run: (page: Page) => Promise<void>): Promise<void> {
  const page = await answered("a new page", browser.newPage());
  try {
    await mount(page, CHAT);
    await run(page);
  } finally {
    await answered("the page closing", page.close());
  }
}

describe.skipIf(!ready)("a conversation read from its first line in Chromium", () => {
  test("carries a long new row only until its first line stands under the top, and holds it there", async () => {
    await chat(async page => {
      await say(page, 600);
      await glided(page);
      expect(await rowTop(page, 1)).toBeCloseTo(40, 0);
      await say(page, 100);
      await glided(page);
      expect(await rowTop(page, 1)).toBeCloseTo(40, 0);
      await page.locator("#viewport").evaluate(e => { e.scrollTop = e.scrollHeight; });
      await frames(page);
      await say(page, 600);
      await glided(page);
      expect(await rowTop(page, 3)).toBeCloseTo(40, 0);
    });
  }, 20_000);

  test("reads a reply in several rows from its first, and a long message of the reader's own from its first line", async () => {
    await chat(async page => {
      await say(page, 50, true);
      await glided(page);
      expect((await metrics(page)).gap).toBeLessThanOrEqual(1);
      await say(page, 100);
      await glided(page);
      expect((await metrics(page)).gap).toBeLessThanOrEqual(1);
      await say(page, 600);
      await glided(page);
      expect(await rowTop(page, 2)).toBeCloseTo(40, 0);
      await page.locator("#viewport").evaluate(e => { e.scrollTop -= 300; });
      await frames(page);
      await page.evaluate(() => {
        const scope: Window & { follower?: { catchUp(): void } } = window;

        scope.follower!.catchUp();
      });
      expect((await metrics(page)).gap).toBeLessThanOrEqual(1);
      await say(page, 700, true);
      await glided(page);
      expect(await rowTop(page, 4)).toBeCloseTo(40, 0);
    });
  }, 20_000);

  test("keeps the end at once when the window shrinks under a reader there", async () => {
    await chat(async page => {
      await say(page, 100);
      await glided(page);
      await page.locator("#viewport").evaluate(e => { (e as HTMLElement).style.height = "250px"; });
      await frames(page);
      expect((await metrics(page)).gap).toBeLessThanOrEqual(1);
    });
  }, 20_000);

  test("glides a new row up from the foot, and moves at once for a reader who asked for less movement", async () => {
    await chat(async page => {
      await page.locator("#viewport").evaluate(e => {
        const tops: number[] = [];
        Object.assign(window, { tops });
        e.addEventListener("scroll", () => tops.push(e.scrollTop));
      });
      await say(page, 300);
      await glided(page);
      const tops = await page.evaluate(() => {
        const scope: Window & { tops?: number[] } = window;

        return scope.tops!;
      });
      expect(new Set(tops).size).toBeGreaterThan(2);
      expect((await metrics(page)).gap).toBeLessThanOrEqual(1);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await say(page, 300);
      expect((await metrics(page)).gap).toBeLessThanOrEqual(1);
    });
  }, 20_000);
});

describe.skipIf(!ready)("room bottom following in Chromium", () => {
  test("allows one pixel of rounding but leaves a reader two pixels above the end", async () => {
    await desktop(async page => {
      await page.locator("#viewport").evaluate(e => { e.scrollTop -= 1; });
      await frames(page);
      await grow(page);
      expect((await metrics(page)).gap).toBeLessThanOrEqual(1);
      await page.locator("#viewport").evaluate(e => { e.scrollTop -= 2; });
      await frames(page);
      const before = await metrics(page);
      await grow(page);
      expect((await metrics(page)).top).toBe(before.top);
    });
  }, 20_000);

  test("follows large appends, successive streaming growth and viewport shrink", async () => {
    await desktop(async page => {
      await grow(page);
      expect((await metrics(page)).gap).toBeLessThanOrEqual(1);
      for (let i = 0; i < 6; i++) {
        await page.locator("#content > div:last-child").evaluate((e, i) => {
          (e as HTMLElement).style.height = `${700 + i * 80}px`;
        }, i);
        await frames(page);
        expect((await metrics(page)).gap).toBeLessThanOrEqual(1);
      }
      await page.locator("#viewport").evaluate(e => { (e as HTMLElement).style.height = "250px"; });
      await frames(page);
      expect((await metrics(page)).gap).toBeLessThanOrEqual(1);
    });
  }, 20_000);

  test("leaves readers 60px and 400px above the bottom in place, then resumes at the bottom", async () => {
    await desktop(async page => {
      for (const distance of [60, 400]) {
        await page.locator("#viewport").evaluate((e, d) => { e.scrollTop = e.scrollHeight - e.clientHeight - d; }, distance);
        await frames(page);
        const before = await metrics(page);
        await grow(page);
        expect((await metrics(page)).top).toBe(before.top);
      }
      await page.locator("#viewport").evaluate(e => { e.scrollTop = e.scrollHeight; });
      await frames(page);
      await grow(page);
      expect((await metrics(page)).gap).toBeLessThanOrEqual(1);
    });
  }, 20_000);

  test("a queued scroll event after growth does not revoke bottom following", async () => {
    await desktop(async page => {
      await page.evaluate(() => {
        const v = document.getElementById("viewport")!;
        const c = document.getElementById("content")!;
        c.style.paddingBottom = "600px";
        // Deliver the scroll from the previous bottom jump before ResizeObserver delivery.
        v.dispatchEvent(new Event("scroll"));
      });
      await frames(page);
      expect((await metrics(page)).gap).toBeLessThanOrEqual(1);
    });
  }, 20_000);

  // A placeholder standing at the end — later messages on their way — goes, and the browser brings
  // the offset down to keep the window inside what is left. That is not the reader leaving the end.
  test("the end coming up because what stood under it went away keeps the reader following", async () => {
    await desktop(async page => {
      await page.locator("#content").evaluate(e => {
        const placeholder = document.createElement("div");
        placeholder.id = "placeholder";
        placeholder.style.height = "200px";
        e.append(placeholder);
      });
      await frames(page);
      expect((await metrics(page)).gap).toBeLessThanOrEqual(1);
      await page.locator("#placeholder").evaluate(e => e.remove());
      await frames(page);
      await grow(page, 56);
      expect((await metrics(page)).gap).toBeLessThanOrEqual(1);
    });
  }, 20_000);

  test("a user moving up before the next follow callback is not pulled back", async () => {
    await desktop(async page => {
      const before = await metrics(page);
      await page.evaluate(() => {
        document.getElementById("viewport")!.scrollTop -= 60;
        document.getElementById("content")!.style.paddingBottom = "600px";
        const scope: Window & { follower?: { follow(): void } } = window;

        scope.follower!.follow();
      });
      await frames(page);
      expect((await metrics(page)).top).toBe(before.top - 60);
    });
  }, 20_000);

  test("late image layout follows only the reader at the bottom, and teardown stops observers", async () => {
    await desktop(async page => {
      await page.locator("#content").evaluate(e => {
        const image = document.createElement("img");
        image.id = "late-image";
        e.append(image);
      });
      await frames(page);
      await page.locator("#late-image").evaluate(e => {
        (e as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="600"/>';
      });
      await loaded(page, "the late picture to decode at 600px", () => (document.getElementById("late-image") as HTMLImageElement).naturalHeight === 600);
      await frames(page);
      expect((await metrics(page)).gap).toBeLessThanOrEqual(1);
      await page.locator("#viewport").evaluate(e => { e.scrollTop -= 60; });
      await frames(page);
      const reading = await metrics(page);
      await page.locator("#late-image").evaluate(e => {
        (e as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="900"/>';
      });
      await loaded(page, "the late picture to decode at 900px", () => (document.getElementById("late-image") as HTMLImageElement).naturalHeight === 900);
      await frames(page);
      expect((await metrics(page)).top).toBe(reading.top);
      await page.locator("#viewport").evaluate(e => { e.scrollTop = e.scrollHeight; });
      await frames(page);
      await page.evaluate(() => {
        const scope: Window & { follower?: { stop(): void } } = window;

        scope.follower!.stop();
      });
      const before = await metrics(page);
      await grow(page);
      expect((await metrics(page)).top).toBe(before.top);
    });
  }, 20_000);

  // Rows above the view laying themselves out anew once drawn, while the end grows in the same frame:
  // the browser holds what is in view by moving the scroll up, which is no reader scrolling away.
  test("the browser's own scroll anchoring keeps a reader at the end following it", async () => {
    const page = await answered("a new page", browser.newPage());
    try {
      await mount(page, "{}", "auto");
      for (let row = 0; row < 6; row++) await say(page, 100);
      expect((await metrics(page)).gap).toBeLessThanOrEqual(1);
      await page.locator("#content").evaluate(e => {
        (e.firstElementChild as HTMLElement).style.height = "600px";
        const row = document.createElement("div");
        row.style.height = "32px";
        e.append(row);
      });
      await frames(page);
      await frames(page);
      expect((await metrics(page)).gap).toBeLessThanOrEqual(1);
      await grow(page, 100);
      expect((await metrics(page)).gap).toBeLessThanOrEqual(1);
    } finally {
      await answered("the page closing", page.close());
    }
  }, 20_000);

  // What holds to the view while the reader scrolls — a sticky date, a photo held over the foot —
  // stands still on screen, and is never taken for the browser holding the content in place.
  test("a reader scrolling up past something sticky is let go of", async () => {
    await desktop(async page => {
      await page.locator("#content").evaluate(e => {
        const row = document.createElement("div");
        row.style.height = "1200px";
        const held = document.createElement("div");
        held.style.cssText = "position:sticky;top:180px;height:40px";
        row.append(held);
        e.append(row);
      });
      await frames(page);
      expect((await metrics(page)).gap).toBeLessThanOrEqual(1);
      await page.locator("#viewport").evaluate(e => { e.scrollTop -= 300; });
      await frames(page);
      const before = await metrics(page);
      await grow(page, 100);
      expect((await metrics(page)).top).toBe(before.top);
    });
  }, 20_000);

  test("a real mobile swipe releases following while new and streaming content grows", async () => {
    const touch = await openTouch();
    try {
      await mount(touch.page);
      await grow(touch.page);
      expect((await metrics(touch.page)).gap).toBeLessThanOrEqual(1);
      await touch.swipe({ x: 150, y: 120 }, { x: 150, y: 300 }, { steps: 16, pauseMs: 25 });
      await touch.page.waitForTimeout(500);
      const before = await metrics(touch.page);
      expect(before.gap).toBeGreaterThan(1);
      await grow(touch.page);
      await grow(touch.page, 40);
      expect((await metrics(touch.page)).top).toBe(before.top);
    } finally {
      await touch.close();
    }
    // The session waits its turn on the machine's one finger before it opens, so the test is given
    // what a hook opening one is.
  }, BROWSER_HOOK_MS);
});

// What the reader opens or folds in a message keeps the message where it stands (docs/web.md,
// 「Scroll anchoring」), and the way down is told only when the reader stands away from the end.
const ANCHORED = "{ ...readsFromFirstLine(() => document.getElementById('content')), smooth: true, anchorOf: (target) => target instanceof Element ? target.closest('[data-row]') : null, onAway: (away) => { window.told = [...(window.told ?? []), away]; } }";

async function anchored(run: (page: Page) => Promise<void>): Promise<void> {
  const page = await answered("a new page", browser.newPage());
  try {
    await mount(page, ANCHORED);
    await run(page);
  } finally {
    await answered("the page closing", page.close());
  }
}

// The reader presses inside a row and the row takes a new height, as a chip opening or folding does.
async function press(page: Page, row: number, height: number): Promise<void> {
  await page.evaluate(({ row, height }) => {
    const element = document.querySelector<HTMLElement>(`[data-row="${row}"]`)!;
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    element.style.height = `${height}px`;
  }, { row, height });
}

describe.skipIf(!ready)("scroll anchoring and the way down in Chromium", () => {
  test("opening a message keeps its top, and the view stops when that top reaches the top", async () => {
    await anchored(async page => {
      await say(page, 100);
      await glided(page);
      const top = await rowTop(page, 1);
      await press(page, 1, 700);
      await frames(page);
      expect(await rowTop(page, 1)).toBeLessThanOrEqual(top);
      await glided(page);
      expect(Math.round(await rowTop(page, 1))).toBe(40);
    });
  }, 20_000);

  test("folding a message at the end holds its top, then glides down to the new end", async () => {
    await anchored(async page => {
      await say(page, 100);
      await glided(page);
      await press(page, 1, 700);
      await glided(page);
      const top = await rowTop(page, 1);
      await press(page, 1, 100);
      await frames(page);
      expect(Math.abs((await rowTop(page, 1)) - top)).toBeLessThan(60);
      await glided(page);
      expect((await metrics(page)).gap).toBeLessThanOrEqual(1);
      expect(await page.locator("#viewport").evaluate(e => e.lastElementChild?.id)).toBe("content");
    });
  }, 20_000);

  // An answer's link card coming in after the answer itself is more of what arrived, not the reader's
  // own change: its site's icon loads, then the card lays itself out and grows the message, and the
  // reader stays with the end, the next message followed too.
  test("a link card arriving in the newest message keeps a reader at the end following it", async () => {
    await anchored(async page => {
      await page.locator("#content").evaluate(e => {
        const row = document.createElement("div");
        row.id = "card";
        row.dataset.row = String(e.children.length);
        row.style.minHeight = "60px";
        row.append(document.createElement("img"));
        e.append(row);
      });
      await frames(page);
      await glided(page);
      expect((await metrics(page)).gap).toBeLessThanOrEqual(1);
      await page.locator("#card img").evaluate(e => {
        (e as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"/>';
      });
      await loaded(page, "the link card's picture to decode", () => document.querySelector<HTMLImageElement>("#card img")!.naturalHeight === 16);
      await page.locator("#card").evaluate(e => { e.style.minHeight = "300px"; });
      await frames(page);
      await glided(page);
      expect((await metrics(page)).gap).toBeLessThanOrEqual(1);
      await say(page, 100);
      await glided(page);
      expect((await metrics(page)).gap).toBeLessThanOrEqual(1);
    });
  }, 20_000);

  // A message being read from its first line is still new: a picture arriving in it grows it downwards
  // and never carries its top past the top, though the end moves further than that.
  test("a picture arriving in a long new message keeps its first line under the top", async () => {
    await anchored(async page => {
      await say(page, 600);
      await glided(page);
      expect(Math.round(await rowTop(page, 1))).toBe(40);
      await page.locator("[data-row=\"1\"]").evaluate(e => {
        const image = document.createElement("img");
        image.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"/>';
        e.append(image);
      });
      await loaded(page, "the new message's picture to decode", () => document.querySelector<HTMLImageElement>("[data-row=\"1\"] img")!.naturalHeight === 16);
      await page.locator("[data-row=\"1\"]").evaluate(e => { e.style.height = "800px"; });
      await frames(page);
      await glided(page);
      expect(Math.round(await rowTop(page, 1))).toBe(40);
    });
  }, 20_000);

  // Opening a room: the rows standing as the reader comes to the end have been read, and their cards,
  // pictures and players sizing themselves afterwards — above the view, in it, in a message taller
  // than the window — keep the reader at the very end, at once rather than by a glide.
  for (const anchoring of ["none", "auto"]) {
    test(`rows standing at the end that size themselves late keep the reader there (anchoring ${anchoring})`, async () => {
      const page = await answered("a new page", browser.newPage());
      try {
        await mount(page, ANCHORED, anchoring);
        await page.locator("#content").evaluate(e => {
          for (const height of [100, 100, 500]) {
            const row = document.createElement("div");
            row.style.height = `${height}px`;
            row.dataset.row = String(e.children.length);
            row.append(document.createElement("img"));
            e.append(row);
          }
        });
        await page.evaluate(() => {
          const scope: Window & { follower?: { jump: () => void } } = window;

          scope.follower!.jump();
        });
        await frames(page);
        expect((await metrics(page)).gap).toBeLessThanOrEqual(1);
        for (const [row, height] of [[1, 300], [3, 700], [2, 160]] as const) {
          await page.locator(`[data-row="${row}"] img`).evaluate(e => {
            (e as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"/>';
          });
          await loaded(page, `row ${row}'s picture to decode`, (row: number) => document.querySelector<HTMLImageElement>(`[data-row="${row}"] img`)!.naturalHeight === 16, row);
          await page.locator(`[data-row="${row}"]`).evaluate((e, height) => { e.style.height = `${height}px`; }, height);
          await frames(page);
          expect((await metrics(page)).gap).toBeLessThanOrEqual(1);
        }
        await say(page, 100);
        await glided(page);
        expect((await metrics(page)).gap).toBeLessThanOrEqual(1);
      } finally {
        await answered("the page closing", page.close());
      }
    }, 20_000);
  }

  test("a message arriving moments after a press is still followed as an arrival", async () => {
    await anchored(async page => {
      await say(page, 100);
      await glided(page);
      await page.evaluate(() => document.querySelector("[data-row=\"1\"]")!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
      await say(page, 100);
      await glided(page);
      expect((await metrics(page)).gap).toBeLessThanOrEqual(1);
    });
  }, 20_000);

  test("the way down is never told while the follower's own glide carries the reader", async () => {
    await anchored(async page => {
      await say(page, 300);
      await glided(page);
      await say(page, 200);
      await glided(page);
      expect(await page.evaluate(() => {
        const scope: Window & { told?: boolean[] } = window;

        return scope.told ?? [];
      })).not.toContain(true);
      await page.locator("#viewport").evaluate(e => { e.scrollTop -= 200; });
      await frames(page);
      await frames(page);
      expect((await page.evaluate(() => {
        const scope: Window & { told?: boolean[] } = window;

        return scope.told!;
      })).at(-1)).toBe(true);
    });
  }, 20_000);
});
