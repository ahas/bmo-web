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

  return visibleFrame({
    windowHeight: Math.max(window.innerHeight, shellOwnHeight()),
    height: visual.height,
    offsetTop: visual.offsetTop,
    scale: visual.scale
  });
}

// Reads the visible part as the screen is first drawn and on the frame after, while the browser may still
// be settling its bars, and again whenever the visual viewport changes size or moves or the window changes
// size: a keyboard opening resizes the visible part, a browser pushing its page up to reveal the focused
// box moves it, and a bar coming or going resizes the window.
function onVisibleChange(read: () => void): void {
  let frame = 0;

  onMounted(() => {
    read();
    frame = requestAnimationFrame(read);
    window.visualViewport?.addEventListener("resize", read);
    window.visualViewport?.addEventListener("scroll", read);
    window.addEventListener("resize", read);
  });

  onScopeDispose(() => {
    cancelAnimationFrame(frame);
    window.visualViewport?.removeEventListener("resize", read);
    window.visualViewport?.removeEventListener("scroll", read);
    window.removeEventListener("resize", read);
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
