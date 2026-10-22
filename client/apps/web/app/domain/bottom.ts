// scrollHeight/clientHeight are integers, but scrollTop may contain a fractional pixel.
const BOTTOM_EPSILON_PX = 1;

export interface BottomFollower {
  follow: () => void;
  // The visible part of the viewport changed without the viewport itself changing size — something
  // floating over its edges grew or shrank: a reader at the end is kept there, at once.
  keep: () => void;
  jump: () => void;
  catchUp: () => void;
  release: () => void;
  stop: () => void;
}

export interface FollowOptions {
  // While this holds, the end of what is shown is not the end of what there is, and reaching it
  // pins nothing.
  away?: () => boolean;
  // What new content is read from. Given the client y down to which the reader has already seen,
  // the list answers with the elements a new part begins at, earliest first; the first of them not
  // yet carried past the viewport's top — its scroll margin kept — is not carried past it now.
  // Nothing answered pins the end at once: what grew had been read. No such hook, and the end is
  // pinned the way a log is read, every growth new content.
  readFrom?: (seenBottom: number) => readonly Element[];
  // Told whenever the reader comes to stand at the end — opening, the way down, sending, their own
  // scroll down, a glide of the follower's arriving there: everything standing has been read, and
  // however it grows afterwards readFrom answers none of it.
  readThrough?: () => void;
  // Moves made for new content glide; a reader who asked for less movement is moved at once. A
  // function answers per move, for a feed whose first content is still sizing itself.
  smooth?: boolean | (() => boolean);
  // Told whenever the reader comes to stand away from the end or back at it: away is short of the end
  // and not on the way there by a glide of the follower's own, so a glide carrying the reader down
  // never reads as the reader standing back.
  onAway?: (away: boolean) => void;
  // Which part of the content a reader's press, or a picture arriving in view of a reader away from the
  // end, changes the height of — a message. Such a change is the reader's own and is read by scroll
  // anchoring rather than as new content: the part's top stays where it stands and what it gains opens
  // downwards, and where that passes the foot the view glides up only until the part's top reaches the
  // top. No such hook, and every change in height is read as new content.
  anchorOf?: (target: EventTarget | null) => Element | null;
}

// How long after a reader's press a change in the pressed part's height is still theirs, and how long
// each change the anchor reads holds it for the next — a list that opens and then fills in its lines.
const ANCHOR_HOLD_MS = 1500;

// What floats over the viewport's top and foot, as the viewport's own scroll padding says: a row is
// held under the top one, and only what stands clear of the foot one counts as seen.
function insets(viewport: HTMLElement): { top: number; bottom: number } {
  const style = getComputedStyle(viewport);

  return { top: Number.parseFloat(style.scrollPaddingTop) || 0, bottom: Number.parseFloat(style.scrollPaddingBottom) || 0 };
}

// Remember the reader's position before growth. A scroll event queued by our previous move
// can arrive after the next render: its new distance from the bottom is not a reader scrolling
// away. Only a move upward releases a reader who was following the end.
export function followBottom(viewport: HTMLElement, content: HTMLElement, options: FollowOptions = {}): BottomFollower {
  const away = options.away ?? (() => false);
  let pinned = true;
  let lastTop = viewport.scrollTop;
  // How far down the content, in its own offsets, the following reader has had in view.
  let seen = viewport.scrollTop + viewport.clientHeight - insets(viewport).bottom;
  // Where a glide of the follower's own is taking the reader, while one is under way.
  let gliding: number | null = null;
  let stoodAway: boolean | null = null;
  let confirming: number | null = null;
  // The part the reader is changing the height of, where it stood on screen and how tall it was.
  let anchored: { element: Element; top: number; height: number; until: number } | null = null;
  // A reader who changed a part themselves has let go of the end: nothing pins it again but their
  // own move down to it, or a move to the end they asked for.
  let letGo = false;

  function standingAway(): boolean {
    return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight > BOTTOM_EPSILON_PX && gliding === null;
  }

  // Coming back to the end is told at once. Standing away is told only once it still holds a frame
  // later: within one frame the content can grow before the follower has moved for it, and a reader
  // told away for that instant would see the way down blink.
  function report(atBottom: boolean): void {
    const standing = !atBottom && gliding === null;

    if (!standing) {
      if (confirming !== null) {
        cancelAnimationFrame(confirming);
        confirming = null;
      }

      if (stoodAway !== false) {
        stoodAway = false;
        options.onAway?.(false);
      }

      return;
    }

    if (stoodAway === true || confirming !== null) {
      return;
    }

    confirming = requestAnimationFrame(() => {
      confirming = null;

      if (standingAway() && stoodAway !== true) {
        stoodAway = true;
        options.onAway?.(true);
      }
    });
  }

  // Something of the content standing in view, and where it stood on screen at the last reading. The
  // browser's own scroll anchoring moves the scroll so that what is in view stays where it stood while
  // content above it changes height; the reader's move takes what is in view along with the scroll.
  let mark: { element: Element; at: number } | null = null;

  // The largest part holding what stands at that point that is still shorter than the window: a whole
  // message rather than a line of its words, which the message may lay out anew in the same frame. A
  // gap between parts hits what holds them all, whose top moves with the scroll either way; and what
  // holds to an edge of the view — a sticky date, a photo held over the foot — stands still while the
  // reader scrolls, so nothing in or around it is taken.
  function partAt(x: number, y: number): Element | null {
    const hit = document.elementFromPoint(x, y);

    if (hit === null || hit === content || !content.contains(hit) || hit.getBoundingClientRect().height >= viewport.clientHeight) {
      return null;
    }

    let part = hit;

    while (part.parentElement !== null && part.parentElement !== content && part.parentElement.getBoundingClientRect().height < viewport.clientHeight) {
      part = part.parentElement;
    }

    for (let at: Element | null = hit; at !== null && at !== content; at = at.parentElement) {
      const place = getComputedStyle(at).position;

      if (place === "sticky" || place === "fixed") {
        return null;
      }
    }

    return part;
  }

  function markView(): void {
    const port = viewport.getBoundingClientRect();

    mark = null;

    for (const share of [0.5, 0.35, 0.65, 0.2, 0.8]) {
      const part = partAt(port.left + port.width / 2, port.top + port.height * share);

      if (part !== null) {
        mark = { element: part, at: part.getBoundingClientRect().top };

        return;
      }
    }
  }

  // Whether the scroll moved by this much while what was in view stood still: the browser keeping it in
  // place, which is no move of the reader's.
  function heldInView(by: number): boolean {
    if (mark === null || !mark.element.isConnected) {
      return false;
    }

    return Math.abs(mark.element.getBoundingClientRect().top - mark.at) < by / 2;
  }

  function readPosition(): void {
    const top = viewport.scrollTop;
    const atBottom = viewport.scrollHeight - top - viewport.clientHeight <= BOTTOM_EPSILON_PX;
    const held = Math.abs(top - lastTop) > BOTTOM_EPSILON_PX && heldInView(Math.abs(top - lastTop));
    // The reader's own move, rather than one of the follower's or the browser's: no glide of its own
    // under way, and the scroll standing somewhere the follower did not just set it, with what is in
    // view moved along.
    const theirs = gliding === null && Math.abs(top - lastTop) > BOTTOM_EPSILON_PX && !held;

    // A glide is over where it arrives, and wherever the reader takes the scroll against it. Most
    // glides go down; the one that follows a part folding at the end goes up.
    const glidingUp = gliding !== null && gliding < lastTop;

    if (gliding !== null && (Math.abs(top - gliding) <= BOTTOM_EPSILON_PX || (!held && (glidingUp ? top > lastTop : top < lastTop)))) {
      gliding = null;
      settleSpacer();
    }

    // What was seen moved with the content that changed height above it.
    if (held) {
      seen += top - lastTop;
    }

    if (atBottom && !away() && (!letGo || theirs)) {
      letGo = false;
      pinned = true;
      seen = viewport.scrollHeight;
      options.readThrough?.();
    } else if (top < lastTop && !glidingUp && !held) {
      pinned = false;
    } else if (pinned) {
      seen = Math.max(seen, top + viewport.clientHeight - insets(viewport).bottom);
    }

    lastTop = top;
    markView();
    report(atBottom);
  }

  function jump(): void {
    letGo = false;
    viewport.scrollTop = viewport.scrollHeight;
    lastTop = viewport.scrollTop;
    gliding = null;
    pinned = true;
    seen = viewport.scrollHeight;
    options.readThrough?.();
    markView();
    report(true);
  }

  // Where the reader is carried to, and whether for something new: the end, unless a new part's first
  // line would pass the top. Never back up, which only the reader does. What had been read growing is
  // nothing new, and the end is kept at once, before the frame is drawn, so the view never stands off it.
  function target(): { top: number; fresh: boolean } {
    const end = viewport.scrollHeight - viewport.clientHeight;

    if (options.readFrom === undefined) {
      return { top: end, fresh: true };
    }

    const origin = viewport.getBoundingClientRect().top + viewport.clientTop - viewport.scrollTop;
    const starts = options.readFrom(origin + seen);

    if (starts.length === 0) {
      return { top: end, fresh: false };
    }

    const held = starts
      .map((start) => start.getBoundingClientRect().top - origin - insets(viewport).top - (Number.parseFloat(getComputedStyle(start).scrollMarginTop) || 0))
      .filter((at) => at >= viewport.scrollTop - BOTTOM_EPSILON_PX);

    return { top: held.length === 0 ? viewport.scrollTop : Math.max(viewport.scrollTop, Math.min(end, ...held)), fresh: true };
  }

  function move(top: number, glide: boolean): void {
    // Standing still is no move: setting the offset would cut short a glide already under way.
    if (Math.abs(top - viewport.scrollTop) <= BOTTOM_EPSILON_PX) {
      return;
    }

    const smooth = typeof options.smooth === "function" ? options.smooth() : options.smooth;

    if (glide && smooth === true && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // The glide's own scroll events only ever move the way it goes, so they never read as the reader
      // leaving (readPosition).
      gliding = Math.min(top, viewport.scrollHeight - viewport.clientHeight);
      viewport.scrollTo({ top, behavior: "smooth" });
      report(false);

      return;
    }

    viewport.scrollTop = top;
    lastTop = viewport.scrollTop;
    gliding = null;
    markView();
    report(viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= BOTTOM_EPSILON_PX);
  }

  // Recheck even when the user's scroll event has not been delivered yet. There is no await
  // between this decision and the move: a deferred unconditional move can reclaim the view.
  function follow(glide: boolean): void {
    readPosition();

    if (pinned) {
      const { top, fresh } = target();

      move(top, glide && fresh);
    }
  }

  function anchor(element: Element): void {
    const box = element.getBoundingClientRect();

    anchored = { element, top: box.top, height: box.height, until: performance.now() + ANCHOR_HOLD_MS };
  }

  // Scroll anchoring: the anchored part keeps its top where it stood, and what it gained opens
  // downwards; where that passes the foot, the view glides up only until the part's top reaches the
  // top, the way a new part's first line is held. Where a glide is already under way, the part is
  // held where the glide will leave it. The change is the reader's own, so a reader who stood at the
  // end lets go of it here and is never carried to the end for it.
  function hold(held: NonNullable<typeof anchored>, box: DOMRect): void {
    pinned = false;
    letGo = true;

    const port = viewport.getBoundingClientRect();
    const edge = insets(viewport);
    const margin = Number.parseFloat(getComputedStyle(held.element).scrollMarginTop) || 0;
    const going = gliding === null ? 0 : gliding - viewport.scrollTop;
    // Where the scroll stands with the part's top back where it stood.
    const steady = viewport.scrollTop + going + (box.top - going - held.top);
    const end = viewport.scrollHeight - viewport.clientHeight - spacer;

    // A part folding at the end leaves less below it than the window holds, and the browser has
    // already pulled the scroll back by that much. For this frame the shortfall is made up under the
    // content, so the part stands where it stood, and the view then glides down to the new end.
    if (steady > end + BOTTOM_EPSILON_PX) {
      spacer += steady - Math.max(end, viewport.scrollTop);
      spacerBlock.style.height = `${spacer}px`;

      if (!spacerBlock.isConnected) {
        viewport.append(spacerBlock);
      }

      viewport.scrollTop = steady;
      lastTop = viewport.scrollTop;
      // Where the part will stand once the glide to the new end is over.
      held.top += steady - end;
      held.height = box.height;
      held.until = performance.now() + ANCHOR_HOLD_MS;
      move(end, true);
      settleSpacer();

      return;
    }

    const past = held.top + box.height - (port.bottom - edge.bottom);
    const room = held.top - (port.top + viewport.clientTop + edge.top + margin);
    const shift = Math.max(0, Math.min(past, room, end - steady));

    held.top -= shift;
    held.height = box.height;
    held.until = performance.now() + ANCHOR_HOLD_MS;
    // What the part shows once there has been seen, so nothing of it is read as new afterwards.
    seen = Math.max(seen, steady + shift + held.top + box.height - (port.top + viewport.clientTop));
    move(steady + shift, shift > 0);
  }

  // Room made up after the content while a folded part's view glides down to the new end; it goes once
  // the glide is over, when the scroll no longer stands in it. It is a block of its own at the
  // viewport's foot, so neither the viewport's box nor the content's changes with it.
  let spacer = 0;
  const spacerBlock = document.createElement("div");

  spacerBlock.setAttribute("aria-hidden", "true");
  spacerBlock.style.flex = "none";

  function settleSpacer(): void {
    if (spacer === 0 || gliding !== null) {
      return;
    }

    spacer = 0;
    spacerBlock.remove();
  }

  // The window alone changing size brings nothing new in: a reader at the end stays at the end, at
  // once, and only the content growing is read from its first line — unless what grew is the part
  // the reader is changing themselves.
  const grew = new ResizeObserver((entries) => {
    const held = anchored;

    if (held !== null && held.element.isConnected && performance.now() < held.until) {
      const box = held.element.getBoundingClientRect();

      if (Math.abs(box.height - held.height) > BOTTOM_EPSILON_PX) {
        hold(held, box);

        return;
      }
    }

    follow(entries.some((entry) => entry.target === content));
  });
  // Padding is part of the distance to the last message too.
  grew.observe(content, { box: "border-box" });
  grew.observe(viewport, { box: "border-box" });
  // A press inside a part anchors it. A picture arriving inside a part a reader away from the end can
  // see anchors that part too, as their own change, and so does one in a part a press still holds.
  // Anywhere else a picture arriving is content growing like any other, read as new only where readFrom
  // says so: a reader following the end keeps it.
  const pressed = (event: Event): void => {
    const part = options.anchorOf?.(event.target);

    if (part !== null && part !== undefined) {
      anchor(part);
    }
  };
  const loaded = (event: Event): void => {
    const part = options.anchorOf?.(event.target);
    const port = viewport.getBoundingClientRect();
    const box = part?.getBoundingClientRect();

    if (part !== null && part !== undefined && box !== undefined && box.bottom > port.top && box.top < port.bottom) {
      readPosition();

      const pressedHere = anchored !== null && anchored.element === part && performance.now() < anchored.until;

      if (pressedHere || (!pinned && gliding === null)) {
        anchor(part);

        return;
      }
    }

    follow(true);
  };
  // Where the browser says scrolling has ended, a glide has, if it arrived or has stopped short. A
  // move made at once just before a glide began says so too, and is no end of the glide: so a glide
  // short of where it was going is believed over only once the scroll has stood still a moment.
  const STILL_MS = 150;
  let stillCheck: ReturnType<typeof setTimeout> | null = null;

  function over(): void {
    gliding = null;
    settleSpacer();
    readPosition();
  }

  const ended = (): void => {
    if (gliding === null || Math.abs(viewport.scrollTop - gliding) <= BOTTOM_EPSILON_PX) {
      over();

      return;
    }

    const at = viewport.scrollTop;

    if (stillCheck !== null) {
      clearTimeout(stillCheck);
    }

    stillCheck = setTimeout(() => {
      stillCheck = null;

      if (gliding !== null && Math.abs(viewport.scrollTop - at) <= BOTTOM_EPSILON_PX) {
        over();
      }
    }, STILL_MS);
  };
  viewport.addEventListener("scroll", readPosition, { passive: true });
  viewport.addEventListener("scrollend", ended, { passive: true });
  viewport.addEventListener("load", loaded, true);
  content.addEventListener("click", pressed, true);
  readPosition();

  return {
    follow: () => follow(true),
    keep: () => follow(false),
    jump,
    // The reader's own move to the end — sending, say: what stands counts as read, and whatever is
    // added next is read from its first line.
    catchUp() {
      letGo = false;
      readPosition();

      if (!pinned) {
        jump();
      }

      pinned = true;
      seen = viewport.scrollHeight;
      options.readThrough?.();
    },
    release() {
      pinned = false;
      lastTop = viewport.scrollTop;
    },
    stop() {
      if (confirming !== null) {
        cancelAnimationFrame(confirming);
      }

      if (stillCheck !== null) {
        clearTimeout(stillCheck);
      }

      grew.disconnect();
      spacerBlock.remove();
      viewport.removeEventListener("scroll", readPosition);
      viewport.removeEventListener("scrollend", ended);
      viewport.removeEventListener("load", loaded, true);
      content.removeEventListener("click", pressed, true);
    },
  };
}
