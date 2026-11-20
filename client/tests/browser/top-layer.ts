// What opens over another stands over it (docs/web.md, 「Floating things」), as the browser tests read it: whether a
// floating thing is the one the browser draws at its own centre, and a move to another screen inside the app, which
// sets the screen's floating things up again after the console's own; and whether the focus went back where it was.

import type { Locator, Page } from "playwright-core";

/**
 * Whether the browser draws the given floating thing over everything else at the centre of the part of it on the
 * screen, once it has come in. Every press is let through while it is asked, since the component library holds
 * presses off whatever stands under its top layer and the browser would otherwise answer with what lies under that.
 */
export async function standsOnTop(floating: Locator): Promise<boolean> {
  return await floating.evaluate(async (element) => {
    await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => undefined)));

    const style = document.createElement("style");

    style.textContent = "* { pointer-events: auto !important; }";
    document.head.append(style);

    const rect = element.getBoundingClientRect();
    const left = Math.max(rect.left, 0);
    const top = Math.max(rect.top, 0);
    const right = Math.min(rect.right, innerWidth);
    const bottom = Math.min(rect.bottom, innerHeight);
    const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);

    style.remove();

    return hit !== null && element.contains(hit);
  });
}

/** Whether the given element holds the keyboard's focus, as a floating thing hands it back on closing. */
export async function holdsFocus(element: Locator): Promise<boolean> {
  return await element.evaluate((found) => found === document.activeElement);
}

/** Goes to a path of the console inside the app, by its router, as a link pressed in it does; the path is the app's own. */
export async function goInApp(page: Page, path: string): Promise<void> {
  await page.evaluate(async (to) => {
    const app = (document.querySelector("#__nuxt") as unknown as { __vue_app__: { config: { globalProperties: { $router: { push: (to: string) => Promise<unknown> } } } } }).__vue_app__;

    await app.config.globalProperties.$router.push(to);
  }, path);
}
