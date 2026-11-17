// A bubble is as wide as the longest line it actually stands on (docs/web.md, 「A bubble is as wide as
// its widest line」). The browser sizes a box that fits its contents to the room those contents could
// take, so words that wrap, or a meta line that drops under them, leave the bubble as wide as the
// whole room with a blank at its trailing side: no CSS width shrinks a box to the lines it wrapped
// into. So the lines are read off the page as they were laid, and the bubble is held to the widest.
// Each line still fits at that width, so every line wraps where it did and only the blank goes.

// Holds each bubble to its widest line, or lets it take its own width where what it holds is not
// lines alone. Every bubble is let go first and every one read before any is held, so the page is
// laid out once for all of them rather than once for each.
export function fitBubbles(bubbles: readonly HTMLElement[]): void {
  for (const bubble of bubbles) {
    bubble.style.width = "";
  }

  const widths = bubbles.map((bubble) => {
    const widest = widestLine(bubble);

    return widest === null || Math.ceil(widest) >= bubble.getBoundingClientRect().width ? null : Math.ceil(widest);
  });

  bubbles.forEach((bubble, at) => {
    const width = widths[at];

    if (width !== null && width !== undefined) {
      bubble.style.width = `${width}px`;
    }
  });
}

// The bubbles waiting to be fitted, each with what it does once fitted. A room opening puts in all of
// its rows in one update, so they are fitted together in the microtask after it: still before the
// page is painted, and before a flight that waited for that update reads the bubble it flies into.
const waiting = new Map<HTMLElement, { fitted: boolean; done: () => void }>();

function fitWaiting(): void {
  const all = [...waiting];

  waiting.clear();

  for (const [bubble, { fitted }] of all) {
    if (!fitted) {
      bubble.style.width = "";
    }
  }

  fitBubbles(all.flatMap(([bubble, { fitted }]) => (fitted ? [bubble] : [])));

  for (const [, { done }] of all) {
    done();
  }
}

// Keeps a bubble fitted while it stands: `fit` fits it with the others put in by the same update, and
// the row it stands in changing size — the room around it widening or narrowing, or what the bubble
// holds growing or shrinking — fits it again a frame later. Fitting changes the bubble's width alone,
// never its row's size, so a fit never asks for another one.
export function keepFitted(bubble: HTMLElement, fitted: () => boolean): { fit: () => void; stop: () => void } {
  const row = bubble.closest<HTMLElement>("[data-row]") ?? bubble;
  let laid = "";
  let frame = 0;

  const sizeOf = (): string => `${row.offsetWidth}x${row.offsetHeight}`;

  function fit(): void {
    if (waiting.size === 0) {
      queueMicrotask(fitWaiting);
    }

    waiting.set(bubble, { fitted: fitted(), done: () => (laid = sizeOf()) });
  }

  if (typeof ResizeObserver === "undefined") {
    return { fit, stop: () => waiting.delete(bubble) };
  }

  const observer = new ResizeObserver(() => {
    if (sizeOf() === laid) {
      return;
    }

    // A width set inside the observer's own delivery would be a size change it cannot deliver until
    // the next frame, which the browser reports as an error; so the fit waits for that frame.
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(fit);
  });

  observer.observe(row);

  return {
    fit,
    stop: () => {
      waiting.delete(bubble);
      cancelAnimationFrame(frame);
      observer.disconnect();
    },
  };
}

// The border-box width the bubble's widest line asks for, or null where the bubble holds something
// other than its head, its words and its meta line — a chip's spread standing open among them. A sticker
// over the words is part of the head.
function widestLine(bubble: HTMLElement): number | null {
  const words = bubble.querySelector<HTMLElement>("[data-words]:not([data-name])");
  const body = words?.parentElement ?? null;

  if (words === null || body === null || bubble.querySelector("[data-spread]") !== null) {
    return null;
  }

  const frame = body.getBoundingClientRect();
  const look = getComputedStyle(body);
  const start = frame.left + Number.parseFloat(look.paddingLeft);
  const sides = Number.parseFloat(look.paddingLeft) + Number.parseFloat(look.paddingRight) + bubble.getBoundingClientRect().width - frame.width;

  const lines = wordBoxes(words);
  let widest = Math.max(0, ...lines.map((line) => line.right - start));

  const meta = body.querySelector<HTMLElement>("[data-meta]");

  if (meta !== null && meta.hasAttribute("data-meta-inline")) {
    widest = Math.max(widest, inlineMetaReach(words, meta, lines, start));
  } else if (meta !== null) {
    widest = Math.max(widest, ...lineWidths(meta));
  }

  for (const part of bubble.querySelectorAll<HTMLElement>("[data-name], [data-quote]")) {
    widest = Math.max(widest, headReach(part, start));
  }

  return widest + sides;
}

// The boxes the words stand in: every line of their letters and every inline box among them, and the
// whole box of anything laid out as a box rather than as lines — a code block, a table, a picture —
// which keeps its own width.
function wordBoxes(words: HTMLElement): DOMRect[] {
  const blocks = [...words.querySelectorAll<HTMLElement>("*")].filter((element) => {
    const look = getComputedStyle(element);

    return !look.display.startsWith("inline") && (look.overflowX !== "visible" || element.matches("table, img, svg, video, canvas, iframe, hr"));
  });

  return [...letterBoxes(words), ...blocks.map((element) => element.getBoundingClientRect())];
}

// Every line of a part's letters, laid out whole even where only their start is shown, and every
// inline box among them: inline code keeps room round its letters, and a picture inline is a box of
// its own.
function letterBoxes(part: HTMLElement): DOMRect[] {
  const boxes: DOMRect[] = [];
  const range = part.ownerDocument.createRange();
  const walker = part.ownerDocument.createTreeWalker(part, NodeFilter.SHOW_TEXT);

  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    range.selectNodeContents(node);
    boxes.push(...[...range.getClientRects()].filter((box) => box.width > 0));
  }

  for (const element of part.querySelectorAll<HTMLElement>("*")) {
    if (getComputedStyle(element).display.startsWith("inline")) {
      boxes.push(...element.getClientRects());
    }
  }

  return boxes;
}

// How far the words' last line reaches with the meta line standing at its end: the blank the words
// keep for it there, after their last letter where it stands on that line, or the line alone where it
// stands on a line of its own.
function inlineMetaReach(words: HTMLElement, meta: HTMLElement, lines: readonly DOMRect[], start: number): number {
  const blank = blankWidth(words);
  const foot = Math.max(...lines.map((line) => line.bottom));
  const last = lines.filter((line) => line.bottom > foot - 1);
  const onLastLine = last.length > 0 && meta.getBoundingClientRect().top < foot - 1;

  return onLastLine ? Math.max(...last.map((line) => line.right)) - start + blank : meta.getBoundingClientRect().width;
}

// The blank the room's own rules keep at the end of the words' last line of text, read off the page
// rather than worked out again from those rules.
function blankWidth(words: HTMLElement): number {
  const last = words.lastElementChild;
  const host = last?.classList.contains("markdown") ? last.lastElementChild : last;

  if (host === null || host === undefined) {
    return 0;
  }

  const after = getComputedStyle(host, "::after");

  return after.float === "none" ? 0 : Number.parseFloat(after.width) || 0;
}

// The width of each line a row of parts stands on — the meta line, or its chips where they wrap: the
// parts laid on it side by side at the row's own step, wherever the free room on that line put them.
function lineWidths(row: Element): number[] {
  const step = Number.parseFloat(getComputedStyle(row).columnGap) || 0;
  const lines = new Map<number, number[]>();

  for (const part of row.children) {
    const width = partWidth(part);

    if (width > 0) {
      const foot = Math.round(part.getBoundingClientRect().bottom);
      lines.set(foot, [...(lines.get(foot) ?? []), width]);
    }
  }

  return [...lines.values()].map((widths) => widths.reduce((sum, width) => sum + width, 0) + step * (widths.length - 1));
}

// How wide a part of such a row asks to be: a row that wraps its own parts, as wide as its widest
// line of them rather than the room the row it stands in left it; any other part, as wide as it stands.
function partWidth(part: Element): number {
  if (getComputedStyle(part).flexWrap === "wrap") {
    return Math.max(0, ...lineWidths(part));
  }

  return part.getBoundingClientRect().width;
}

// How far a part of the head would reach on one line of its own, where it may be cut short to the
// bubble — the name, and the line of the message answered: its letters and pictures, and the room the
// part keeps after them.
function headReach(part: HTMLElement, start: number): number {
  const look = getComputedStyle(part);
  const after = Number.parseFloat(look.paddingRight) + Number.parseFloat(look.borderRightWidth);
  const boxes = [...letterBoxes(part), ...[...part.querySelectorAll("img, video")].map((element) => element.getBoundingClientRect())];

  return Math.max(0, ...boxes.map((box) => box.right - start)) + after;
}
