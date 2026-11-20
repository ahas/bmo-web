import type { DragSide } from "bmo-ui/app/domain/floating-drag";
import type { Ref } from "vue";

// Where the briefing's player stands (docs/web.md, 「Messages」, the briefing's player). It is dragged like a
// picture-in-picture window through the shared layer's floating-drag module: it follows the pointer inside the page
// area, settles on the nearer side when let go, and the side and height it was left at are kept in this browser.

export type BriefingSide = DragSide;

// `top` is the height it was left at, in pixels from the top of the page area; null is where it first stands, as
// low as the page area lets it, above whatever bar stands at the screen's foot.
export interface BriefingPosition {
  side: BriefingSide;
  top: number | null;
}

export const BRIEFING_POSITION_DEFAULT: BriefingPosition = { side: "right", top: null };

// What marks a bar at a screen's foot, which the player stands above.
export const SCREEN_FOOT = "[data-screen-foot]";

const POSITION_KEY = "bmo-web.briefing-player";
const POSITION_STATE = "bmo-briefing-position";

/** How far up from the page area's foot the player keeps: the height of the tallest bar standing at that foot. */
export function footClearance(area: DOMRect, feet: readonly DOMRect[]): number {
  return feet.reduce((most, foot) => (foot.height > 0 && foot.top < area.bottom && foot.bottom > area.top ? Math.max(most, area.bottom - foot.top) : most), 0);
}

export function positionOf(raw: string | null): BriefingPosition {
  try {
    const parsed: unknown = raw === null ? null : JSON.parse(raw);

    if (parsed === null || typeof parsed !== "object") {
      return BRIEFING_POSITION_DEFAULT;
    }

    const held = parsed as { side?: unknown; top?: unknown };

    return {
      side: held.side === "left" ? "left" : "right",
      top: typeof held.top === "number" && Number.isFinite(held.top) ? Math.max(0, Math.round(held.top)) : null
    };
  } catch {
    return BRIEFING_POSITION_DEFAULT;
  }
}

// The position kept in this browser, read once the player is on the page and written each time a drag settles.
export function useBriefingPosition(): { position: Ref<BriefingPosition>; keep: (next: BriefingPosition) => void } {
  const position = useState<BriefingPosition>(POSITION_STATE, () => BRIEFING_POSITION_DEFAULT);

  onMounted(() => {
    try {
      position.value = positionOf(window.localStorage.getItem(POSITION_KEY));
    } catch {
      // A browser that keeps nothing shows the player where it first stands.
    }
  });

  function keep(next: BriefingPosition): void {
    position.value = next;

    try {
      window.localStorage.setItem(POSITION_KEY, JSON.stringify(next));
    } catch {
      // A browser that refuses storage still keeps the player where it was left for this visit.
    }
  }

  return { position, keep };
}
