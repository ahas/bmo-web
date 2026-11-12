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

/** The key a screen a unit brings reads the console's title bar by (docs/web.md, 「The title bar」): where it is
 * provided, the console draws the bar of a bundle route whose meta asks for it, and the screen draws none of its own. */
export const CONSOLE_TITLE_BAR = "bmo-console-title-bar";

/** What the console tells a screen of its bar: that it draws one, and nothing more. The bar holds no place for the
 *  screen, which stands its way back and its actions in its own row under the bar. */
export type ConsoleTitleBarOffer = Record<string, never>;

/** Offers the console's bar to every screen under the layout. */
export function provideConsoleTitleBar(): void {
  provide<ConsoleTitleBarOffer>(CONSOLE_TITLE_BAR, {});
}
