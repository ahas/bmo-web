import type { Ref } from "vue";

// Where the briefing's player stands and how it is moved there (docs/web.md, 「Messages」, the briefing's
// player). It is dragged like a picture-in-picture window: it follows the pointer inside
// the page's panel, settles on the nearer side when let go, and the side and height it was left at
// are kept in this browser.

export type BriefingSide = "left" | "right";

// `top` is the height it was left at, in pixels from the top of the page's panel. Nought is as high
// as the panel lets it stand, just under the title row, which is where it stands before any drag.
export interface BriefingPosition {
  side: BriefingSide;
  top: number;
}

export const BRIEFING_POSITION_DEFAULT: BriefingPosition = { side: "left", top: 0 };

// How far a pointer travels before a press becomes a drag. A finger settling on glass wanders
// further than a mouse held still, so a touch is given more room.
const MOUSE_SLOP_PX = 4;
const SLOP_PX: Record<string, number> = { pen: 6, touch: 10 };

// How far ahead a throw is carried when choosing the side it settles on, in seconds of its speed.
const THROW_S = 0.15;

const POSITION_KEY = "bmo-web.briefing-player";
const POSITION_STATE = "bmo-briefing-position";

// The four edges the player's top-left corner may reach inside the panel.
export interface BriefingBounds {
  minLeft: number;
  maxLeft: number;
  minTop: number;
  maxTop: number;
}

export function slopOf(pointerType: string): number {
  return SLOP_PX[pointerType] ?? MOUSE_SLOP_PX;
}

export function isDrag(dx: number, dy: number, pointerType: string): boolean {
  return Math.hypot(dx, dy) > slopOf(pointerType);
}

export function clampTo(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

// The side a player let go at `left`, moving sideways at `speed` pixels a second, settles on: the
// one its centre is nearer to once the throw is carried on a little.
export function settledSide(left: number, width: number, bounds: BriefingBounds, speed: number): BriefingSide {
  const centre = left + width / 2 + speed * THROW_S;
  const middle = (bounds.minLeft + bounds.maxLeft + width) / 2;

  return centre < middle ? "left" : "right";
}

export function positionOf(raw: string | null): BriefingPosition {
  try {
    const parsed: unknown = raw === null ? null : JSON.parse(raw);

    if (parsed === null || typeof parsed !== "object") {
      return BRIEFING_POSITION_DEFAULT;
    }

    const held = parsed as { side?: unknown; top?: unknown };

    return {
      side: held.side === "right" ? "right" : "left",
      top: typeof held.top === "number" && Number.isFinite(held.top) ? Math.max(0, Math.round(held.top)) : 0
    };
  } catch {
    return BRIEFING_POSITION_DEFAULT;
  }
}

// The position kept in this browser, read once the player or the account screen is on the page, and
// written each time a drag settles or the account screen sets it. The two share one state, so the
// player standing moves the moment the account screen changes it.
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
