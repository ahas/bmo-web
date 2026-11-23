import { afterAll, describe, expect, test } from "bun:test";

import { globalsRestoredAfter } from "../support/globals";
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";

import { mayRead, mayWrite } from "../../apps/web/shared/sections";
import { openedRoute, openedRoutes } from "../../apps/web/server/utils/opened-routes";
import { carriesSession } from "../../apps/web/server/utils/session-cookie";
import { forgetSectionAccess } from "../../apps/web/server/utils/section-access";
import { standInAccountService } from "../support/account-service";
import { standInHandler } from "../support/route-handler";

import type { SectionAccessMap } from "../../apps/web/shared/sections";

// Every route of the console, as a user other than the platform administrator meets it (docs/web.md,
// 「Access」): a route not opened to them answers as if nothing stood there, an opened one passes on under its
// scope once the person's section permission opens it, and the administrator passes everywhere. The routes are
// read off the files Nitro serves them from, so a route added later is held to this too, beside the ones the
// session module serves itself.

interface Route {
  file: string;
  method: string;
  path: string;
}

const apiRoot = join(import.meta.dir, "..", "..", "apps", "web", "server", "api");

// The sections a member has today: their rooms, which they read, and their own account, which they keep.
const DEFAULT_ACCESS: SectionAccessMap = {
  rooms: { read: true, write: false },
  account: { read: true, write: true }
};

// The member the stand-in knows, and the service it answers from.
const service = standInAccountService({ users: [{ id: 2, name: "member" }, { id: 3, name: "agent-reader" }, { id: 4, name: "no-account" }, { id: 5, name: "room-writer" }] });

process.env.WEB_SERVER_ADDRESS = service.address;
process.env.WEB_SERVER_TOKEN = service.token;

afterAll(() => {
  service.stop();
  delete process.env.WEB_SERVER_ADDRESS;
  delete process.env.WEB_SERVER_TOKEN;
});

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

globalsRestoredAfter(["carriesSession", "createError", "defineEventHandler", "getCookie", "getUserSession", "useRuntimeConfig"]);
globals.defineEventHandler = (handler: unknown) => handler;
globals.getCookie = () => "sealed";
globals.useRuntimeConfig = () => ({ session: { name: "nuxt-session" }, app: { baseURL: "/bmo/" } });
globals.getUserSession = async () => session;
globals.createError = (error: { statusCode: number; statusMessage: string }) => Object.assign(new Error(error.statusMessage), error);
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

// Whether the member's sections open a route, read as the middleware reads them.
function opens(route: Route): boolean {
  const opened = openedRoute(route.method, route.path);

  if (opened === null || opened.administrator === true) return false;
  if (opened.sections === undefined || opened.sections.length === 0) return true;

  const asked = opened.access ?? "read";

  return opened.sections.some((section) => (asked === "write" ? mayWrite(DEFAULT_ACCESS, section) : mayRead(DEFAULT_ACCESS, section)));
}

describe("a console route as another user meets it", () => {
  test("every route the member's sections open passes, and every other answers as absent", async () => {
    session = { user: { name: "member", id: 2 }, sid: "bmo.sid=member", administrator: false };

    expect(routes.length).toBeGreaterThan(10);

    for (const route of routes) {
      expect({ route: route.file, status: await answer(route) }).toEqual({ route: route.file, status: opens(route) ? 200 : 404 });
    }
  });

  // docs/accounts.md, 「A person's BMO profile」: the account service decides who may change a BMO profile, so the
  // console's scope lets every member with the account section reach their own and every member reach a company's.
  test("a member reaches their own BMO profile and asks of a company's, the account service deciding", async () => {
    session = { user: { name: "member", id: 2 }, sid: "bmo.sid=member", administrator: false };

    for (const route of [
      { file: "account/agent.get", method: "GET", path: "/api/account/agent" },
      { file: "account/agent.put", method: "PUT", path: "/api/account/agent" },
      { file: "account/agent.delete", method: "DELETE", path: "/api/account/agent" },
      { file: "account/agent/picture.put", method: "PUT", path: "/api/account/agent/picture" },
      { file: "organization/companies/[company]/agent.put", method: "PUT", path: "/api/organization/companies/1/agent" },
      { file: "organization/companies/[company]/agent/picture.delete", method: "DELETE", path: "/api/organization/companies/1/agent/picture" },
      { file: "organization/units/[unit]/agent-permissions.get", method: "GET", path: "/api/organization/units/1/agent-permissions" },
      { file: "organization/users/[user]/agent-permission.put", method: "PUT", path: "/api/organization/users/2/agent-permission" }
    ]) {
      expect({ route: route.file, status: await answer(route) }).toEqual({ route: route.file, status: 200 });
    }
  });

  // docs/accounts.md, 「Who changes a link」: the account service decides who writes which link of the delegation chain,
  // so the console's scope lets every member ask for a unit's apps and their own, whatever sections they hold.
  test("a member asks for a unit's apps and their own, the account service deciding", async () => {
    service.sections.set(4, new Map());
    session = { user: { name: "no-account", id: 4 }, sid: "bmo.sid=no-account", administrator: false };

    for (const route of [
      { file: "organization/units/[unit]/apps.get", method: "GET", path: "/api/organization/units/1/apps" },
      { file: "organization/units/[unit]/apps/[app].put", method: "PUT", path: "/api/organization/units/1/apps/app-a" },
      { file: "account/apps.get", method: "GET", path: "/api/account/apps" },
      { file: "account/apps/[app].put", method: "PUT", path: "/api/account/apps/app-a" }
    ]) {
      expect({ route: route.file, status: await answer(route) }).toEqual({ route: route.file, status: 200 });
    }
  });

  // docs/accounts.md, 「A person who leaves」: the account service decides who may mark a person left, the administrator
  // or the person's heads, so the console's scope lets every member ask.
  test("a member asks to mark a person left, the account service deciding", async () => {
    session = { user: { name: "member", id: 2 }, sid: "bmo.sid=member", administrator: false };

    expect(await answer({ file: "organization/users/[user]/leave.post", method: "POST", path: "/api/organization/users/3/leave" })).toBe(200);
  });

  // docs/accounts.md, 「Concurrent posts」, 「Acting」 and 「Roles and unit kinds」: the account service decides who gives
  // a post, names an acting head and keeps a company's roles and unit kinds, so the console's scope lets every member
  // ask, whatever sections they hold.
  test("a member asks for a head's writes and a company's lists, the account service deciding", async () => {
    service.sections.set(4, new Map());
    session = { user: { name: "no-account", id: 4 }, sid: "bmo.sid=no-account", administrator: false };

    for (const route of [
      { file: "organization/units/[unit]/posts/[user].put", method: "PUT", path: "/api/organization/units/1/posts/3" },
      { file: "organization/units/[unit]/posts/[user].delete", method: "DELETE", path: "/api/organization/units/1/posts/3" },
      { file: "organization/units/[unit]/acting.put", method: "PUT", path: "/api/organization/units/1/acting" },
      { file: "organization/units/[unit]/acting.delete", method: "DELETE", path: "/api/organization/units/1/acting" },
      { file: "organization/companies/[company]/roles.get", method: "GET", path: "/api/organization/companies/1/roles" },
      { file: "organization/companies/[company]/roles.put", method: "PUT", path: "/api/organization/companies/1/roles" },
      { file: "organization/companies/[company]/unit-kinds.get", method: "GET", path: "/api/organization/companies/1/unit-kinds" },
      { file: "organization/companies/[company]/unit-kinds.put", method: "PUT", path: "/api/organization/companies/1/unit-kinds" }
    ]) {
      expect({ route: route.file, status: await answer(route) }).toEqual({ route: route.file, status: 200 });
    }
  });

  test("a grant of one agent-management part opens that part's reads alone", async () => {
    service.sections.set(3, new Map([["supervisors", { read: true, write: false }]]));
    session = { user: { name: "agent-reader", id: 3 }, sid: "bmo.sid=agent-reader", administrator: false };

    expect(await answer({ file: "supervisors.get", method: "GET", path: "/api/supervisors" })).toBe(200);
    expect(await answer({ file: "agents.get", method: "GET", path: "/api/agents" })).toBe(200);
    // The permitted read does not open a change, and the other parts stay closed.
    expect(await answer({ file: "supervisors/[name].patch", method: "PATCH", path: "/api/supervisors/agent-a" })).toBe(404);
    expect(await answer({ file: "roles.get", method: "GET", path: "/api/roles" })).toBe(404);
    expect(await answer({ file: "models.post", method: "POST", path: "/api/models" })).toBe(404);
    expect(await answer({ file: "model-catalogue.get", method: "GET", path: "/api/model-catalogue" })).toBe(404);
    expect(await answer({ file: "rooms.get", method: "GET", path: "/api/rooms" })).toBe(404);
  });

  test("a write opens its part's reads and changes alone", async () => {
    forgetSectionAccess("3");
    service.sections.set(3, new Map([["roles", { read: true, write: true }]]));
    session = { user: { name: "agent-reader", id: 3 }, sid: "bmo.sid=agent-reader", administrator: false };

    expect(await answer({ file: "roles.get", method: "GET", path: "/api/roles" })).toBe(200);
    expect(await answer({ file: "roles.post", method: "POST", path: "/api/roles" })).toBe(200);
    expect(await answer({ file: "roles/[name].delete", method: "DELETE", path: "/api/roles/a-role" })).toBe(200);
    // The write does not open another part, and the supervisors' read is not the roles'.
    expect(await answer({ file: "supervisors.get", method: "GET", path: "/api/supervisors" })).toBe(404);
    expect(await answer({ file: "repositories.get", method: "GET", path: "/api/repositories" })).toBe(404);
  });

  test("a reader whose account section is closed reaches neither the people search, the members list nor a person's page", async () => {
    service.sections.set(4, new Map());
    session = { user: { name: "no-account", id: 4 }, sid: "bmo.sid=no-account", administrator: false };

    expect(await answer({ file: "people/search.get", method: "GET", path: "/api/people/search" })).toBe(404);
    expect(await answer({ file: "people/[user].get", method: "GET", path: "/api/people/1" })).toBe(404);
    expect(await answer({ file: "people/members.get", method: "GET", path: "/api/people/members" })).toBe(404);
  });

  // docs/web.md, 「Presence and typing」: a tab's report is its account's presence, whatever the account may read.
  test("a reader with no section still says what its tab shows", async () => {
    service.sections.set(4, new Map());
    session = { user: { name: "no-account", id: 4 }, sid: "bmo.sid=no-account", administrator: false };

    expect(await answer({ file: "push/watching.post", method: "POST", path: "/api/push/watching" })).toBe(200);
  });

  // docs/web.md, 「Settings」, the machine section: every signed-in person reads their own machine and takes it away,
  // whatever they may read.
  test("a reader with no section still reads their own machine and takes it away", async () => {
    service.sections.set(4, new Map());
    session = { user: { name: "no-account", id: 4 }, sid: "bmo.sid=no-account", administrator: false };

    expect(await answer({ file: "me/machine/index.get", method: "GET", path: "/api/me/machine" })).toBe(200);
    expect(await answer({ file: "me/machine/index.delete", method: "DELETE", path: "/api/me/machine" })).toBe(200);
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

      expect({ route: route.file, scoped: /\b(requireReadableRoom|requireWritableRoom|readableRooms|listedRooms|messageToActOn)\(/.test(source) }).toEqual({ route: route.file, scoped: true });
    }
  });

  test("a member whose rooms section writes opens a room, lets people in and out, leaves, speaks and reads their rooms", async () => {
    service.sections.set(5, new Map([["rooms", { read: true, write: true }]]));
    session = { user: { name: "room-writer", id: 5 }, sid: "bmo.sid=room-writer", administrator: false };

    const opened: Route[] = [
      { file: "rooms.post", method: "POST", path: "/api/rooms" },
      { file: "rooms.get", method: "GET", path: "/api/rooms" },
      { file: "rooms/[chatId]/accounts/[user].put", method: "PUT", path: "/api/rooms/-7/accounts/6" },
      { file: "rooms/[chatId]/accounts/[user].delete", method: "DELETE", path: "/api/rooms/-7/accounts/6" },
      { file: "rooms/[chatId]/accounts/[user].delete", method: "DELETE", path: "/api/rooms/-7/accounts/5" },
      { file: "rooms/[chatId]/members.get", method: "GET", path: "/api/rooms/-7/members" },
      { file: "rooms/[chatId]/overlay.get", method: "GET", path: "/api/rooms/-7/overlay" },
      { file: "rooms/[chatId]/say.post", method: "POST", path: "/api/rooms/-7/say" },
      { file: "rooms/[chatId]/attach.post", method: "POST", path: "/api/rooms/-7/attach" },
      { file: "rooms/[chatId]/voice.post", method: "POST", path: "/api/rooms/-7/voice" },
      { file: "push/watching.post", method: "POST", path: "/api/push/watching" }
    ];

    for (const route of opened) expect({ route: route.file, status: await answer(route) }).toEqual({ route: route.file, status: 200 });

    // What stays the administrator's beside them.
    for (const route of [
      { file: "rooms/[chatId]/pin.post", method: "POST", path: "/api/rooms/-7/pin" },
      { file: "rooms/[chatId]/messages/[messageId]/forward.post", method: "POST", path: "/api/rooms/-7/messages/21/forward" },
      { file: "rooms/[chatId]/providers.put", method: "PUT", path: "/api/rooms/-7/providers" }
    ]) {
      expect({ route: route.file, status: await answer(route) }).toEqual({ route: route.file, status: 404 });
    }
  });

  test("no opened route is shadowed whole by one before it", () => {
    // The first route of the list a request matches is the one it is read under, so a route every one of whose
    // requests an earlier route takes is never read at all.
    for (const [index, opened] of openedRoutes.entries()) {
      const answered = routes.filter((route) => route.method === opened.method && opened.path.test(route.path));
      const reached = answered.some((route) => openedRoutes.findIndex((one) => one.method === route.method && one.path.test(route.path)) === index);

      expect({ opened: `${opened.method} ${opened.path.source}`, reached }).toEqual({ opened: `${opened.method} ${opened.path.source}`, reached: true });
    }
  });

  test("every opened route names a route that stands", () => {
    for (const opened of openedRoutes) {
      expect({ opened: opened.path.source, stands: routes.some((route) => route.method === opened.method && opened.path.test(route.path)) })
        .toEqual({ opened: opened.path.source, stands: true });
    }
  });
});
