import { SCREEN_HEIGHT_PROPERTY, SCREEN_TOP_PROPERTY, visibleFrame } from "bmo-ui/app/domain/screen";

import type { VisibleFrame } from "bmo-ui/app/domain/screen";
import type { Ref } from "vue";

// What is visible of the window, read against the height the shell takes on its own rather than the
// window's height alone (docs/web.md, 「Layout fundamentals」). The shell stands at the stylesheet's
// `100dvh` while nothing is written over it, and a phone's browser can report its window and the visible
// part of it as one height while that dynamic viewport runs on under a bar laid over the page's foot; read
// against the window alone, nothing would overlay and the shell's foot would stand under the bar.

// The dynamic viewport as the browser lays it out, measured off a box of that height kept out of sight:
// a script reads no viewport unit as a number. The box is pinned like the shell, so it moves nothing.
let probe: HTMLElement | null = null;

function shellOwnHeight(): number {
  if (probe === null || !probe.isConnected) {
    probe = document.createElement("div");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText = "position:fixed;top:0;left:0;width:0;height:100dvh;visibility:hidden;pointer-events:none";
    document.body.appendChild(probe);
  }

  return probe.getBoundingClientRect().height;
}

// Where the shell stands while something covers the window's foot, or nothing when the whole of what the
// shell would take on its own is visible. The taller of the shell's own height and the window's is the
// one read against, so a browser whose dynamic viewport comes up short of its window still has a
// keyboard read as one.
function readVisibleFrame(): VisibleFrame | null {
  const visual = window.visualViewport;

  if (visual === null) {
    return null;
  }

  const frame = visibleFrame({
    windowHeight: Math.max(window.innerHeight, shellOwnHeight()),
    height: visual.height,
    offsetTop: visual.offsetTop,
    scale: visual.scale
  });

  // A foot held in view standing below what is visible, though nothing read says anything covers the window, has
  // the shell stand at the visible part all the same, and says what was read the first time it does.
  if (frame === null && visual.scale <= 1) {
    const bottom = visual.offsetTop + visual.height;
    const covered = [...feet].find((foot) => {
      const box = foot.getBoundingClientRect();

      return box.height > 0 && box.bottom > bottom + FOOT_SLACK_PX;
    });

    if (covered !== undefined) {
      reportCovered(covered, visual);

      return { top: Math.round(visual.offsetTop), height: Math.round(visual.height) };
    }
  }

  return frame;
}

// The bars at the foot of a screen that must stand inside what is visible, a room's input bar among them.
const feet = new Set<HTMLElement>();

// How far below what is visible a foot may reach before it is taken for covered: the rounding of a fractional
// viewport, and no more.
const FOOT_SLACK_PX = 2;

let reported = false;

// The numbers a covered foot was read with, sent to the console's log once a page.
function reportCovered(foot: HTMLElement, visual: VisualViewport): void {
  if (reported) return;

  reported = true;

  const box = foot.getBoundingClientRect();

  void $fetch("/api/client-reports", {
    method: "POST",
    body: {
      kind: "foot-covered",
      windowHeight: window.innerHeight,
      visualHeight: visual.height,
      visualTop: visual.offsetTop,
      visualScale: visual.scale,
      dynamicHeight: shellOwnHeight(),
      footTop: box.top,
      footBottom: box.bottom,
      scrollY: window.scrollY
    }
  }).catch(() => undefined);
}

/** Holds a bar at the foot of a screen inside what is visible for as long as it stands. */
export function useFootInView(foot: Readonly<Ref<HTMLElement | null>>): void {
  if (!import.meta.client) return;

  watch(
    foot,
    (element, previous) => {
      if (previous) feet.delete(previous);
      if (element) feet.add(element);
    },
    { immediate: true }
  );

  onScopeDispose(() => {
    if (foot.value) feet.delete(foot.value);
  });
}

// Reads the visible part as the screen is first drawn, on the frame after and a few times more while a reload's
// bars settle, and again whenever the visual viewport changes size or moves, the window changes size or scrolls,
// the page is shown again from the browser's history, the screen turns or the tab comes back into view (docs/web.md,
// 「Layout fundamentals」).
const SETTLING_MS: readonly number[] = [250, 1_000, 2_500];

export function onVisibleChange(read: () => void): void {
  let frame = 0;
  const timers: ReturnType<typeof setTimeout>[] = [];
  const shown = (): void => {
    if (document.visibilityState === "visible") read();
  };

  onMounted(() => {
    read();
    frame = requestAnimationFrame(read);
    for (const ms of SETTLING_MS) timers.push(setTimeout(read, ms));
    window.visualViewport?.addEventListener("resize", read);
    window.visualViewport?.addEventListener("scroll", read);
    window.addEventListener("resize", read);
    window.addEventListener("scroll", read, { passive: true });
    window.addEventListener("pageshow", read);
    window.addEventListener("orientationchange", read);
    document.addEventListener("visibilitychange", shown);
  });

  onScopeDispose(() => {
    cancelAnimationFrame(frame);
    for (const timer of timers) clearTimeout(timer);
    window.visualViewport?.removeEventListener("resize", read);
    window.visualViewport?.removeEventListener("scroll", read);
    window.removeEventListener("resize", read);
    window.removeEventListener("scroll", read);
    window.removeEventListener("pageshow", read);
    window.removeEventListener("orientationchange", read);
    document.removeEventListener("visibilitychange", shown);
  });
}

// Keeps the two properties the shell is laid out from saying what is visible, for as long as the page is
// open. Unset is the stylesheet's own whole window, and removing them hands the shell back to it.
export function useVisibleShell(): void {
  if (!import.meta.client) {
    return;
  }

  onVisibleChange(() => {
    const frame = readVisibleFrame();
    const style = document.documentElement.style;

    if (frame === null) {
      style.removeProperty(SCREEN_HEIGHT_PROPERTY);
      style.removeProperty(SCREEN_TOP_PROPERTY);

      return;
    }

    style.setProperty(SCREEN_HEIGHT_PROPERTY, `${frame.height}px`);
    style.setProperty(SCREEN_TOP_PROPERTY, `${frame.top}px`);
  });
}

// Whether something overlays the foot of the window — a phone's keyboard, or a bar the browser lays over
// the page — by the same reading the shell stands by. A pinched screen is a magnified one and overlays
// nothing. A server render knows no viewport and answers false; the browser reads it once it has the page.
export function useOverlaid(): Readonly<Ref<boolean>> {
  const overlaid = ref(false);

  if (!import.meta.client) {
    return overlaid;
  }

  onVisibleChange(() => {
    overlaid.value = readVisibleFrame() !== null;
  });

  return overlaid;
}
