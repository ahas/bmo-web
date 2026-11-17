import { useNarrow } from "bmo-ui/app/domain/screen";

import type { StickerFrames } from "#shared/sticker-frames";
import type { ComputedRef } from "vue";

/** How the stickers of the screen play: over and over, or still on their first frame where the reader asked for less movement (docs/web.md, the room screen's wordless messages). */
export function useStickerFrames(): ComputedRef<StickerFrames> {
  const still = useNarrow("(prefers-reduced-motion: reduce)");

  return computed<StickerFrames>(() => (still.value ? "still" : "loop"));
}
