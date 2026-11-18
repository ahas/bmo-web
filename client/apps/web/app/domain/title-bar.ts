import { computed, shallowRef } from "vue";

import type { ComputedRef, ShallowRef } from "vue";

// The one title bar every screen carries (docs/web.md, 「The title bar」): its buttons are one instance the layout
// holds, laid into the bar of whichever screen stands, so a page change moves them rather than standing them up again.
// The place they go is the standing screen's bar, which registers it as it is drawn; the place stays the last one
// registered until another screen's bar takes it, so the buttons are never let go between two screens.
const target = shallowRef<HTMLElement | null>(null);

export function useTitleBarTarget(): ShallowRef<HTMLElement | null> {
  return target;
}

/** The width under which a title bar is short and folds what it holds: 48rem, the container width the bar's own
 *  classes fold at (`@3xl/title-bar`), so what the script folds and what the styles fold agree. */
export const TITLE_BAR_SHORT_BELOW_PX = 768;

// The standing bar's own width; nought until a bar has been measured, which reads as a bar that is not short, as a
// server render knows no width.
const barWidth = shallowRef(0);

/** Whether the standing bar is short (docs/web.md, 「The title bar」): it folds by its own width, never the screen's. */
export function useTitleBarShort(): ComputedRef<boolean> {
  return computed(() => barWidth.value > 0 && barWidth.value < TITLE_BAR_SHORT_BELOW_PX);
}

/** Takes the bar's width as it changes, for as long as its place is the one the buttons go to; returns the stop. */
export function measureTitleBar(bar: HTMLElement, place: HTMLElement): () => void {
  const observer = new ResizeObserver(([entry]) => {
    if (entry !== undefined && target.value === place) barWidth.value = entry.contentRect.width;
  });

  observer.observe(bar);

  return () => observer.disconnect();
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
