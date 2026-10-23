// Where a socket's hooks are found (docs/boundary.md, 「Calls the console makes」): the route its path names under the
// base path, as a request is routed. The console's middleware stands at the base path ahead of every route, and the
// server's own lookup takes the first layer whose path the socket's starts with, which is that middleware, never a
// route; so the lookup is made on the routes alone, and a socket whose path names none, or a route that takes no
// socket, is answered by no hooks.

interface Resolved {
  handler?: { __websocket__?: object };
}

interface Routes {
  handler: { __resolve__?: (path: string) => Promise<Resolved | undefined> };
}

export default defineNitroPlugin((nitro) => {
  const base = useRuntimeConfig().app.baseURL.replace(/\/+$/, "");
  const routes = nitro.router as unknown as Routes;

  Object.defineProperty(nitro.h3App, "websocket", {
    configurable: true,
    enumerable: true,
    value: {
      async resolve(info: { url?: string; request?: { url: string } }) {
        const { pathname } = new URL(info.request?.url ?? info.url ?? "/", "http://console.invalid");

        if (pathname !== base && !pathname.startsWith(`${base}/`)) return {};

        const resolved = await routes.handler.__resolve__?.(pathname.slice(base.length) || "/");

        return resolved?.handler?.__websocket__ ?? {};
      }
    }
  });
});
