import { BUNDLE_AREA, loadBundle } from "./bundle-loader";

import type { ConsoleScreen } from "#shared/console-bundles";
import type { RouteLocationNormalizedLoaded, Router } from "vue-router";

// The screens units bring that the reader may open (docs/web.md, 「Screens a unit brings」): read once per page from
// the console's own list, their words merged into the pack, and each bundle's module loaded the first time its
// screen path is opened, its routes then standing under the console's frame in place of a console page at the
// same address. A screen that does not load has the list read again, and is loaded once more where the list now
// names it at other files.

/** The screens the reader may open, as the page read them. */
export function useConsoleScreens() {
  return useState<ConsoleScreen[]>("console-screens", () => []);
}

/** Reads the list of screens the reader may open, at the address a page stands at. */
export type ScreensReader = (path: string) => Promise<ConsoleScreen[] | null>;

/** What reads the list again: the list it reads stands as the page's and its words are merged into the pack; a list
 * that cannot be read leaves the page's as it was and reads as null. With no session the list is asked for the
 * address the page stands at, since only a share page's own bundle is answered then, and only there. */
export function useScreensReader(): ScreensReader {
  const screens = useConsoleScreens();
  const fetching = useRequestFetch();
  const { loggedIn } = useUserSession();
  const i18n = useNuxtApp().$i18n as { mergeLocaleMessage: (locale: string, words: Record<string, unknown>) => void };

  return async (path) => {
    const query = loggedIn.value ? {} : { path };
    const read = await fetching<ConsoleScreen[]>("/api/console-bundles", { query }).catch(() => null);

    if (read !== null) {
      screens.value = read;
      mergeWords((locale, words) => i18n.mergeLocaleMessage(locale, words), read);
    }

    return read;
  };
}

/** The attributes the page area carries while the path open is a bundle's screen: the mark that holds the bundle's
 * variant rules to it, and the containment that makes it the box the screen's fixed positions are laid out in, so a
 * screen fixed to the window fills the page area alone (docs/web.md, 「Screens a unit brings」). */
export function useBundleArea() {
  const route = useRoute();
  const screens = useConsoleScreens();

  return computed(() => (screenAt(screens.value, route.path) === null ? {} : { [BUNDLE_AREA]: "", style: { contain: "layout" } }));
}

/** The bar the console draws over a bundle's screen: the manifest's title and icon, where the route the screen
 * stands at asks for the console's bar in its meta (docs/web.md, 「The title bar」); none where it draws its own. The
 * bar follows the route being gone to from the moment the router takes the navigation, so it stands before that
 * screen mounts, and it stays while the screen being left still stands. */
export function useBundleBar() {
  const shown = useRoute();
  const going = useRouter().currentRoute;
  const screens = useConsoleScreens();
  const barOf = (route: RouteLocationNormalizedLoaded) => {
    const screen = screenAt(screens.value, route.path);

    return screen === null || route.meta.consoleTitleBar !== true ? null : { title: screen.title, icon: screen.icon };
  };

  return computed(() => barOf(going.value) ?? barOf(shown));
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

/** A reader's own screen whose PC did not answer as the list was read, which is not loaded, since it could read none
 * of its data (docs/web.md, 「A reader's own screens」). */
export function pcOff(screen: ConsoleScreen): boolean {
  return screen.personal?.reached === false;
}

// Loads a screen's bundle and stands its routes, in place of any console page at or below its screen path.
function standScreen(router: Router, screen: ConsoleScreen): Promise<void> {
  if (pcOff(screen)) return Promise.reject(new Error(`${screen.name}: its PC is off`));

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

/**
 * Loads a screen's bundle and stands its routes, in place of any console page at or below its screen path. Where it
 * does not load, the list is read again with `reread`, and where it now names the screen at another module or
 * stylesheet the screen is loaded once more from those: a unit released since the list was read serves its files
 * under new names, which the console has read by the time the old ones failed (docs/web.md, 「Screens a unit
 * brings」). Rejects where the screen still does not load.
 */
export async function openScreen(router: Router, screen: ConsoleScreen, reread: () => Promise<ConsoleScreen[] | null>): Promise<void> {
  try {
    await standScreen(router, screen);
  } catch (error) {
    const named = (await reread())?.find((one) => one.name === screen.name);

    if (named === undefined || (named.module === screen.module && named.stylesheet === screen.stylesheet && pcOff(named) === pcOff(screen))) throw error;

    await standScreen(router, named);
  }
}

/** Merges every screen's words into the console's pack, under each bundle's own namespace. */
export function mergeWords(merge: (locale: string, words: Record<string, unknown>) => void, screens: readonly ConsoleScreen[]): void {
  for (const screen of screens) {
    for (const [locale, words] of Object.entries(screen.words)) merge(locale, words);
  }
}
