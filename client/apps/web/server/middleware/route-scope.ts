import { withoutBase } from "ufo";

import { attachedService, readerMay, readerOf } from "../utils/console-manifests";

// A user other than the platform administrator reaches only the routes opened to them, each read
// under its scope (docs/web.md, 「Access」); every other route answers them as if
// nothing stood there. The administrator, a console login and a request nobody signed pass on to
// the route itself, which refuses the last as it always has. A route is named by its path under the
// console's base, as its file names it. The relay of a service a manifest names opens to every reader the
// manifest's role and owner key allow, since the service guards each of its own routes by the role it is handed
// (docs/web.md, 「Screens a unit brings」).
export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  const path = withoutBase(event.path.split("?")[0] ?? "", config.app.baseURL);

  if (!path.startsWith("/api/") || !carriesSession(event)) {
    return;
  }

  const session = await getUserSession(event);

  if (session.sid === undefined || session.administrator === true) {
    return;
  }

  const service = /^\/api\/([^/]+)\//.exec(path)?.[1];
  const attached = service === undefined ? null : attachedService(service);

  if (attached !== null && readerMay(readerOf(await signedInUser(event)), attached.manifest)) {
    event.context.routeScope = "user";

    return;
  }

  const opened = openedRoute(event.method, path);

  if (opened === null) {
    throw createError({ statusCode: 404, statusMessage: "Not Found" });
  }

  event.context.routeScope = opened.scope;
});
