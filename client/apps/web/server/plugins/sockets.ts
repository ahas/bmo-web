import type { App, Router } from "h3";

// Where a socket's hooks are found (docs/boundary.md, 「Calls the console makes」): the route its path names under the
// base path, as a request is routed. The console's middleware stands at the base path ahead of every route, and the
// server's own lookup takes the first layer whose path the socket's starts with, which is that middleware, never a
// route; so the lookup is made on the routes alone, and a socket whose path names none, or a route that takes no
// socket, is answered by no hooks.

/** Stands the lookup on the server's app, which reads the socket's path against the server's router. */
export function standSocketLookup(nitro: { h3App: App; router: Router }): void {
  const base = useRuntimeConfig().app.baseURL.replace(/\/+$/, "");

  Object.defineProperty(nitro.h3App, "websocket", {
    configurable: true,
    enumerable: true,
    value: {
      async resolve(info: { url?: string; request?: { url: string } }) {
        const { pathname } = new URL(info.request?.url ?? info.url ?? "/", "http://console.invalid");

        if (pathname !== base && !pathname.startsWith(`${base}/`)) return {};

        const resolved = await nitro.router.handler.__resolve__?.(pathname.slice(base.length) || "/");

        return resolved?.handler?.__websocket__ ?? {};
      }
    }
  });
}

export default defineNitroPlugin(standSocketLookup);
