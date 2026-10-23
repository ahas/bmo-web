// What a user other than the platform administrator may reach on the console (docs/web.md, 「Access」):
// each route opened to them with the scope it reads under. Every route not here answers them as if
// nothing stood there; the administrator reaches every route. The list is the boundary itself, so it is
// read in one place, and the absence test holds every route file to it. A screen's group puts its own
// routes here as it brings them.

/** The scope a route reads under: the signed-in user's own rows, or the rooms they may read. */
export type RouteScope = "user" | "room";

export interface OpenedRoute {
  method: string;
  path: RegExp;
  scope: RouteScope;
}

export const openedRoutes: readonly OpenedRoute[] = [
  { method: "POST", path: /^\/api\/auth\/(login|logout)$/, scope: "user" },
  { method: "GET", path: /^\/api\/auth\/me$/, scope: "user" },
  // The session module's own route, which the screens read their own session from and clear it by.
  { method: "GET", path: /^\/api\/_auth\/session$/, scope: "user" },
  { method: "DELETE", path: /^\/api\/_auth\/session$/, scope: "user" },
  // The icon module's own route, which every screen draws its icons from; it reads nothing of anyone.
  { method: "GET", path: /^\/api\/_nuxt_icon\/[^/]+\.json$/, scope: "user" },
  { method: "POST", path: /^\/api\/account$/, scope: "user" },
  { method: "GET", path: /^\/api\/account\/palette$/, scope: "user" },
  { method: "PUT", path: /^\/api\/account\/palette$/, scope: "user" },
  { method: "GET", path: /^\/api\/account\/theme$/, scope: "user" },
  { method: "PUT", path: /^\/api\/account\/theme$/, scope: "user" },
  // The screens units bring that the reader may open, read by the role they hold.
  { method: "GET", path: /^\/api\/console-bundles$/, scope: "user" },

  { method: "GET", path: /^\/api\/tab-states\/[^/]+$/, scope: "user" },
  { method: "PUT", path: /^\/api\/tab-states\/[^/]+$/, scope: "user" },
  { method: "GET", path: /^\/api\/rooms$/, scope: "room" },
  { method: "GET", path: /^\/api\/rooms\/-?\d+\/messages$/, scope: "room" },
  // How far the user has read a room, kept for them alone.
  { method: "POST", path: /^\/api\/rooms\/-?\d+\/read$/, scope: "room" },
  // What a room's messages carry and how its reader walks it: its photos and files, the previews of its links, its
  // pictures and where a day of it begins.
  { method: "GET", path: /^\/api\/images\/-?\d+\/-?\d+$/, scope: "room" },
  { method: "GET", path: /^\/api\/media\/[^/]+\/-?\d+\/-?\d+$/, scope: "room" },
  { method: "GET", path: /^\/api\/rooms\/-?\d+\/links\/-?\d+(\/\d+\/image)?$/, scope: "room" },
  { method: "GET", path: /^\/api\/rooms\/-?\d+\/(pictures|day)$/, scope: "room" },
  // The receiver's stream, cut to the news of the rooms the user reads.
  { method: "GET", path: /^\/api\/events$/, scope: "room" },
];

/** The opened route a request asks, or null where it asks one the administrator alone reaches. */
export function openedRoute(method: string, path: string): OpenedRoute | null {
  const bare = path.split("?")[0] ?? path;

  return openedRoutes.find((route) => route.method === method.toUpperCase() && route.path.test(bare)) ?? null;
}
