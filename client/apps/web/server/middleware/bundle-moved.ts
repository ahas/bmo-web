import { withoutBase } from "ufo";

import { movedPage } from "../utils/console-manifests";

// An address under a bundle's former screen path is answered as moved (docs/web.md, 「Screens a unit brings」): a 308
// to the same address under the bundle's screen path, its query kept, to a reader signed in and to one who is not
// alike, before any page is drawn and before any sign-in is asked for. The path is read from the console's base path,
// as the server hands a request on below it.
export default defineEventHandler((event) => {
  const baseURL = useRuntimeConfig(event).app.baseURL;
  const moved = movedPage(baseURL, withoutBase(event.path, baseURL));

  if (moved !== null) return sendRedirect(event, moved, 308);
});
