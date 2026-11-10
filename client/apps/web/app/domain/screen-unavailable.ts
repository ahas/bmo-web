import type { ConsoleScreen } from "#shared/console-bundles";
import type { Router } from "vue-router";

// The console's own page at a screen whose module could not be read (docs/web.md, 「Screens a unit brings」).

/** The name of that page's route for a screen, so a caller can ask whether it already stands. */
export function unavailableRoute(screen: Pick<ConsoleScreen, "name">): string {
  return `console-screen-unavailable:${screen.name}`;
}

/** Stands the console's own page at every address of a screen whose module could not be read, under the screen's
 *  title, so the address draws the reason and a key to read it again instead of nothing (docs/web.md, 「Screens a
 *  unit brings」). The screen's own routes, once its module loads, take its place. */
export function standUnavailable(router: Router, screen: ConsoleScreen): void {
  const name = unavailableRoute(screen);

  if (router.hasRoute(name)) return;

  router.addRoute({
    name,
    path: `${screen.screenPath}/:rest(.*)*`,
    component: () => import("~/components/BundleUnavailable.vue"),
    meta: { consoleTitleBar: true }
  });
}
