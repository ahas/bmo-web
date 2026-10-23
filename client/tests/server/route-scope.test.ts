import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";

import { openedRoute, openedRoutes } from "../../apps/web/server/utils/opened-routes";
import { carriesSession } from "../../apps/web/server/utils/session-cookie";
import { standInHandler } from "../support/route-handler";

// Every route of the console, as a user other than the platform administrator meets it
// (docs/web.md, 「Access」): a route not opened to them answers as if nothing stood
// there, an opened one passes on under its scope, and the administrator passes everywhere. The
// routes are read off the files Nitro serves them from, so a route added later is held to this too,
// beside the ones the session module serves itself.

interface Route {
  file: string;
  method: string;
  path: string;
}

const apiRoot = join(import.meta.dir, "..", "..", "apps", "web", "server", "api");

// A route file's method and a path it answers, by Nitro's naming: `name.<method>.ts`, `index` for its
// directory, a bracketed segment for a parameter and a spread one for the rest of the path.
function routeOf(file: string): Route {
  const parts = relative(apiRoot, file).replace(/\.ts$/, "").split("/");
  const last = parts.pop()!.split(".");
  const method = ["get", "post", "put", "patch", "delete", "head"].includes(last.at(-1)!) ? last.pop()!.toUpperCase() : "GET";
  const name = last.join(".");
  const segments = [...parts, ...(name === "index" ? [] : [name])].map((segment) => segment.startsWith("[...") ? "a/b" : segment.startsWith("[") ? "1" : segment);

  return { file: relative(apiRoot, file), method, path: `/api/${segments.join("/")}` };
}

function routeFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);

    if (entry.isDirectory()) return routeFiles(path);

    return entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") ? [path] : [];
  });
}

// What nuxt-auth-utils and the icon module serve of their own, which no route file of the console names.
const moduleRoutes: Route[] = [
  ...["GET", "DELETE"].map((method) => ({ file: "nuxt-auth-utils session", method, path: "/api/_auth/session" })),
  { file: "nuxt icon collection", method: "GET", path: "/api/_nuxt_icon/material-symbols.json" }
];

const routes = [...routeFiles(apiRoot).map(routeOf), ...moduleRoutes];

const globals: Record<string, unknown> = globalThis;
let session: Record<string, unknown> = {};

globals.defineEventHandler = (handler: unknown) => handler;
globals.getCookie = () => "sealed";
globals.useRuntimeConfig = () => ({ session: { name: "nuxt-session" }, app: { baseURL: "/bmo/" } });
globals.getUserSession = async () => session;
globals.createError = (error: { statusCode: number; statusMessage: string }) => Object.assign(new Error(error.statusMessage), error);
globals.openedRoute = openedRoute;
globals.carriesSession = carriesSession;

const scope = standInHandler((await import("../../apps/web/server/middleware/route-scope")).default);

async function answer(route: Route): Promise<number> {
  try {
    // Asked under the console's base, as the server hands a middleware its path.
    await scope({ path: `/bmo${route.path}?asked=1`, method: route.method, context: {} });

    return 200;
  } catch (error) {
    return (error as { statusCode?: number }).statusCode ?? 500;
  }
}

describe("a console route as another user meets it", () => {
  test("every route not opened to them answers as absent, and every opened one passes under its scope", async () => {
    session = { user: { name: "member", id: 2 }, sid: "bmo.sid=member", administrator: false };

    expect(routes.length).toBeGreaterThan(10);

    for (const route of routes) {
      const opened = openedRoute(route.method, route.path);

      expect({ route: route.file, status: await answer(route) }).toEqual({ route: route.file, status: opened === null ? 404 : 200 });
    }
  });

  test("the administrator and a console login reach every route", async () => {
    for (const standing of [{ user: { name: "boss", id: 1 }, sid: "bmo.sid=boss", administrator: true }, { user: { name: "boss" } }]) {
      session = standing;

      for (const route of routes) expect({ route: route.file, status: await answer(route) }).toEqual({ route: route.file, status: 200 });
    }
  });

  test("every route opened under the room scope reads through the rooms the user may read", async () => {
    for (const route of routes.filter((one) => openedRoute(one.method, one.path)?.scope === "room")) {
      const source = await Bun.file(join(apiRoot, route.file)).text();

      expect({ route: route.file, scoped: /\b(requireReadableRoom|readableRooms)\(/.test(source) }).toEqual({ route: route.file, scoped: true });
    }
  });

  test("every opened route names a route that stands", () => {
    for (const opened of openedRoutes) {
      expect({ opened: opened.path.source, stands: routes.some((route) => route.method === opened.method && opened.path.test(route.path)) })
        .toEqual({ opened: opened.path.source, stands: true });
    }
  });
});
