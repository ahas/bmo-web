import { existsSync } from "node:fs";


import { chromium, devices } from "playwright-core";


import { shot } from "./shot";

import type { Browser, BrowserContext, CDPSession, Page } from "playwright-core";

import type { Shot } from "./shot";

// A real finger on a real screen, which is the one thing this machine could not do until now.
//
// The browser the console is otherwise driven with emulates a phone well enough to lay a page out
// — the viewport, the coarse pointer, the touch points a script can read — but its own click still
// arrives as a mouse with no touchstart at all, so every path a finger takes was left to somebody
// with a handset. Chromium driven this way sends the touches through the browser's own input
// pipeline instead: the page sees pointerdown with pointerType touch, a touchstart beside it, and
// isTrusted true on both, which is what a page cannot be fooled about.
//
// What that buys is not only the events. The browser decides for itself what a gesture is, and it
// takes the pointer stream away — pointercancel, no pointerup — the moment it reads a drag as a
// scroll. That decision is the whole of what a touch-action rule is for, and it cannot be seen at
// all from a dispatched event or an emulated click.
//
// The browser build is the one already on this machine under ~/.cache/ms-playwright, and the
// version here is pinned to match it: playwright-core carries the revision it expects, and a
// version whose revision is not one of the cached builds would try to fetch one. Nothing here
// downloads anything, so it works with no network and it is not to be bumped without checking
// which builds the cache holds.

// How long opening or closing the browser is given. A whole suite runs files side by side, and a
// browser started while the other workers hold the cores takes several seconds to come up — far
// past the five a test hook is otherwise allowed — so a hook that opens one is given this instead.
export const BROWSER_HOOK_MS = 60_000;


// How long a held press stays down by default. What waits on it is the browser's own reading of a
// long press, which a component's menu sets its own delay against, so the default here is longer
// than any of those rather than exactly one of them.
const HOLD_MS = 800;

// How often a held finger is moved while it waits, and how far round its own point it walks in one
// of those moves.
const WOBBLE_STEP_MS = 100;
const WOBBLE_TURN = Math.PI / 3;

export interface TouchPoint {
  x: number;
  y: number;
}

// A finger on a page of a phone context: what it can do, sent through the browser's own input pipeline.
export interface Finger {
  // One tap, where a finger lands and lifts without travelling.
  tap: (at: TouchPoint) => Promise<void>;
  // A finger that lands and stays. What a hold is for is the menu a long press opens, and the
  // browser decides that for itself out of how long the finger was down, so the wait is real time
  // rather than an event of its own.
  press: (at: TouchPoint, options?: { holdMs?: number }) => Promise<void>;
  // A finger that lands, travels and lifts. The steps are what the browser reads a direction off,
  // so a swipe of one jump is not a swipe. `holdMs` keeps it down where it landed before it sets
  // off, which is how a gesture that begins with a long press is driven; `wobblePx` is how far it
  // slides while it waits, the way a real finger spreads and settles rather than standing on one
  // point. `via` is a point it passes through on the way and turns at, so a finger that goes one
  // way and comes back is one gesture; each leg takes the same number of steps. `restMs` keeps it
  // down where it arrived before it lifts, which is a scroll that stops with the finger still on it.
  swipe: (from: TouchPoint, to: TouchPoint, options?: { steps?: number; pauseMs?: number; holdMs?: number; wobblePx?: number; via?: TouchPoint; restMs?: number }) => Promise<void>;
}

export interface TouchSession extends Finger {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  // A picture of what the finger left on the screen, bounded the way every shot of ours is: the
  // session that takes one reads it back, and a full-resolution one costs a quarter of a million
  // characters to do that (`client/browser/shot.ts`).
  shot: (path: string, options?: { fullPage?: boolean; width?: number; quality?: number }) => Promise<Shot>;
  close: () => Promise<void>;
}

// Whether the browser this version pins is on the machine. Everything here is skipped where it is
// not, so a checkout without the cache runs its tests and says nothing about touch.
export function touchReady(): boolean {
  try {
    return existsSync(chromium.executablePath());
  } catch {
    return false;
  }
}

// The four phases a finger goes through, as the browser's own input protocol names them. They are
// written out rather than left as text, so a phase this driver cannot send is caught where it is
// written instead of at the far end of a call the browser refuses.
type TouchPhase = "touchStart" | "touchMove" | "touchEnd" | "touchCancel";

// One finger, as that protocol takes it: where it is, how broad it is and how hard it presses.
interface ProtocolTouchPoint {
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  force: number;
  id: number;
}

function touchPoint(at: TouchPoint): ProtocolTouchPoint {
  return { x: Math.round(at.x), y: Math.round(at.y), radiusX: 6, radiusY: 6, force: 1, id: 1 };
}

async function send(cdp: CDPSession, type: TouchPhase, points: TouchPoint[]): Promise<void> {
  await cdp.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: points.map(touchPoint),
  });
}

// A finger on a page already open, which is how a file that drives the console with its own browser puts a
// finger on a phone context of that browser instead of bringing up a second one.
export async function fingerOn(page: Page): Promise<Finger> {
  const cdp = await page.context().newCDPSession(page);

  return {
    tap: async (at) => {
      await send(cdp, "touchStart", [at]);
      await send(cdp, "touchEnd", []);
    },
    press: async (at, pressOptions = {}) => {
      await send(cdp, "touchStart", [at]);
      await page.waitForTimeout(pressOptions.holdMs ?? HOLD_MS);
      await send(cdp, "touchEnd", []);
    },
    swipe: async (from, to, swipeOptions = {}) => {
      const steps = swipeOptions.steps ?? 8;
      const pauseMs = swipeOptions.pauseMs ?? 16;
      const holdMs = swipeOptions.holdMs ?? 0;
      const wobblePx = swipeOptions.wobblePx ?? 0;

      await send(cdp, "touchStart", [from]);

      // The wait before it travels, spent where it landed. A finger settling is not still, so the
      // wait is walked round a small circle rather than slept through, and the page sees the moves
      // a hand makes while it holds.
      for (let waited = 0; waited < holdMs; waited += WOBBLE_STEP_MS) {
        await page.waitForTimeout(Math.min(WOBBLE_STEP_MS, holdMs - waited));

        if (wobblePx > 0) {
          const angle = (waited / WOBBLE_STEP_MS) * WOBBLE_TURN;

          await send(cdp, "touchMove", [{ x: from.x + Math.cos(angle) * wobblePx, y: from.y + Math.sin(angle) * wobblePx }]);
        }
      }

      const legs = swipeOptions.via === undefined ? [[from, to]] : [[from, swipeOptions.via], [swipeOptions.via, to]];

      for (const [start, end] of legs as [TouchPoint, TouchPoint][]) {
        for (let step = 1; step <= steps; step += 1) {
          await send(cdp, "touchMove", [
            {
              x: start.x + ((end.x - start.x) * step) / steps,
              y: start.y + ((end.y - start.y) * step) / steps,
            },
          ]);
          await page.waitForTimeout(pauseMs);
        }
      }

      await page.waitForTimeout(swipeOptions.restMs ?? 0);
      await send(cdp, "touchEnd", []);
    },
  };
}

// A phone with a finger on it. The size and the user agent are one of the browser's own device
// descriptions, so what is under test is the console rather than a viewport nobody has.
export async function openTouch(options: {
  device?: string;
  reducedMotion?: "reduce" | "no-preference";
  storageStatePath?: string;
} = {}): Promise<TouchSession> {
  // One finger at a time: the console's tests run their files one after another in one process, so no two
  // touch browsers ever come up side by side, which would wedge the second before it draws a page.
  const browser: Browser = await chromium.launch();

  const context = await browser.newContext({
    ...devices[options.device ?? "Pixel 5"],
    ...(options.reducedMotion === undefined ? {} : { reducedMotion: options.reducedMotion }),
    ...(options.storageStatePath === undefined ? {} : { storageState: options.storageStatePath }),
  });
  const page = await context.newPage();

  return {
    browser,
    context,
    page,
    ...(await fingerOn(page)),
    shot: (path, options) => shot(page, path, options),
    close: async () => {
      await browser.close();
    },
  };
}

// Where an element is on the screen, which is what a finger is aimed at.
export async function centreOf(page: Page, selector: string): Promise<TouchPoint> {
  const box = await page.locator(selector).first().boundingBox();

  if (box === null) {
    throw new Error(`${selector} is not on the screen`);
  }

  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
