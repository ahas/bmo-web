import { BUNDLE_AREA, loadBundle } from "./bundle-loader";

import type { ConsoleScreen } from "#shared/console-bundles";
import type { Router } from "vue-router";

// The screens units bring that the reader may open (docs/web.md, 「Screens a unit brings」): read once per page from
// the console's own list, their words merged into the pack, and each bundle's module loaded the first time its
// screen path is opened, its routes then standing under the console's frame in place of a console page at the
// same address.

/** The screens the reader may open, as the page read them. */
export function useConsoleScreens() {
  return useState<ConsoleScreen[]>("console-screens", () => []);
}

/** The attributes the page area carries while the path open is a bundle's screen: the mark that holds the bundle's
 * variant rules to it, and the containment that makes it the box the screen's fixed positions are laid out in, so a
 * screen fixed to the window fills the page area alone (docs/web.md, 「Screens a unit brings」). */
export function useBundleArea() {
  const route = useRoute();
  const screens = useConsoleScreens();

  return computed(() => (screenAt(screens.value, route.path) === null ? {} : { [BUNDLE_AREA]: "", style: { contain: "layout" } }));
}

/** Whether a path stands at or below a screen path. */
export function under(path: string, screenPath: string): boolean {
  return path === screenPath || path.startsWith(`${screenPath}/`);
}

/** The screen a path stands under, the deepest where screen paths nest, or null. */
export function screenAt(screens: readonly ConsoleScreen[], path: string): ConsoleScreen | null {
  let found: ConsoleScreen | null = null;

  for (const screen of screens) {
    if (under(path, screen.screenPath) && (found === null || screen.screenPath.length > found.screenPath.length)) found = screen;
  }

  return found;
}

/** Whether a path is a bundle's share page, the one road that opens with no session. */
export function sharePath(screens: readonly ConsoleScreen[], path: string): boolean {
  return screens.some((screen) => path.startsWith(`${screen.screenPath}/share/`));
}

// Each bundle's loading, by its module's address, so a module is loaded once for the life of the tab.
const opening = new Map<string, Promise<void>>();
const opened = new Set<string>();

/** Whether a screen's routes already stand. */
export function screenOpened(screen: ConsoleScreen): boolean {
  return opened.has(screen.module);
}

/** Loads a screen's bundle and stands its routes, in place of any console page at or below its screen path. */
export function openScreen(router: Router, screen: ConsoleScreen): Promise<void> {
  let held = opening.get(screen.module);

  if (held === undefined) {
    held = loadBundle(screen).then(({ routes }) => {
      for (const route of router.getRoutes()) {
        if (route.name !== undefined && under(route.path, screen.screenPath)) router.removeRoute(route.name);
      }

      for (const route of routes) router.addRoute(route);

      opened.add(screen.module);
    });
    opening.set(screen.module, held);
    held.catch((error: unknown) => {
      opening.delete(screen.module);
      console.error(`console bundles: ${screen.name} did not load:`, error);
    });
  }

  return held;
}

/** Merges every screen's words into the console's pack, under each bundle's own namespace. */
export function mergeWords(merge: (locale: string, words: Record<string, unknown>) => void, screens: readonly ConsoleScreen[]): void {
  for (const screen of screens) {
    for (const [locale, words] of Object.entries(screen.words)) merge(locale, words);
  }
}
