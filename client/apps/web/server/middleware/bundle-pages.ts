import { withoutBase } from "ufo";

import { attachedBundles } from "../utils/console-manifests";

// A page under a bundle's screen path is drawn in the browser alone (docs/web.md, 「Screens a unit brings」): the
// server holds no bundle's module, so it answers the app's shell and the browser draws the page once the module
// is in.
export default defineEventHandler((event) => {
  const path = withoutBase(event.path.split("?")[0] ?? "", useRuntimeConfig(event).app.baseURL);

  if (path.startsWith("/api/") || path.startsWith("/_")) return;

  const underBundle = attachedBundles().some(({ manifest }) => path === manifest.screenPath || path.startsWith(`${manifest.screenPath}/`));

  if (!underBundle) return;

  const context = event.context as { nuxt?: Record<string, unknown> };

  context.nuxt = { ...context.nuxt, noSSR: true };
});
