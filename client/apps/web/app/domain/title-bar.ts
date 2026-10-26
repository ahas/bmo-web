import { shallowRef } from "vue";

import type { ShallowRef } from "vue";

// The one title bar every screen carries (docs/web.md, 「The title bar」): its buttons are one instance the layout
// holds, laid into the bar of whichever screen stands, so a page change moves them rather than standing them up again.
// The place they go is the standing screen's bar, which registers it as it is drawn; the place stays the last one
// registered until another screen's bar takes it, so the buttons are never let go between two screens.
const target = shallowRef<HTMLElement | null>(null);

export function useTitleBarTarget(): ShallowRef<HTMLElement | null> {
  return target;
}
