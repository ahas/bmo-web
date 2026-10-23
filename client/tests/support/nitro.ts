import { createError } from "h3";

import { fail } from "../../apps/web/server/utils/fail";

// What Nitro imports into a server route by itself, put in place before the route is loaded, so the route runs
// under a bare test runner as it does in the server: h3's own helpers, the session stood in as a signed-in
// administrator, and the console's server utilities as they are, which reach the units a test stands in.

export interface RouteEvent {
  body?: unknown;
  query?: Record<string, unknown>;
  params?: Record<string, string>;
  // The request's method, its headers by lower-case name and its body as it was sent, where a route reads them.
  method?: string;
  headers?: Record<string, string>;
  rawBody?: string;
}

const globals = globalThis as unknown as Record<string, unknown>;

globals.defineEventHandler = (handler: unknown) => handler;
globals.createError = createError;
globals.fail = fail;
globals.requireUserSession = async () => ({ user: { id: 1, name: "tester" } });
globals.requireAdministrator = async () => ({ id: 1, name: "tester", administrator: true });
globals.signedInUser = async () => ({ id: 1, name: "tester", administrator: true });
globals.readBody = async (event: RouteEvent) => event.body;
globals.getQuery = (event: RouteEvent) => event.query ?? {};
globals.getRouterParam = (event: RouteEvent, name: string) => event.params?.[name];
globals.getMethod = (event: RouteEvent) => event.method ?? "GET";
globals.getRequestHeader = (event: RouteEvent, name: string) => event.headers?.[name.toLowerCase()];
globals.readRawBody = async (event: RouteEvent) => event.rawBody;
// A route that answers with a web response hands it back as it is, which a test reads whole.
globals.sendWebResponse = (_event: RouteEvent, response: Response) => response;

for (const module of [
  await import("../../apps/web/server/utils/units"),
  await import("../../apps/web/server/utils/unit-answer"),
  await import("../../apps/web/server/utils/agency"),
  await import("../../apps/web/server/utils/keepalive"),
  await import("../../apps/web/server/utils/research"),
  await import("../../apps/web/server/utils/companions"),
  await import("../../apps/web/server/utils/agentlog"),
  await import("../../apps/web/server/utils/request"),
  await import("../../apps/web/server/utils/job"),
  await import("../../apps/web/server/utils/job-runs"),
  await import("../../apps/web/server/utils/todos"),
  await import("../../apps/web/server/utils/work-order-view"),
  await import("../../apps/web/server/utils/receiver"),
  await import("../../apps/web/server/utils/media"),
  await import("../../apps/web/server/utils/owner"),
  await import("../../apps/web/server/utils/archive"),
  await import("../../apps/web/server/utils/openings"),
  await import("../../apps/web/server/utils/room-links"),
  await import("../../apps/web/server/utils/room-reads"),
  await import("../../apps/web/server/utils/send-keys"),
  await import("../../apps/web/server/utils/brain"),
  await import("../../apps/web/server/utils/memories"),
  await import("../../apps/web/server/utils/documents"),
  await import("../../apps/web/server/utils/document-fragments"),
  await import("../../apps/web/server/utils/document-request"),
  await import("../../apps/web/server/utils/document-translation"),
  await import("../../apps/web/server/utils/document-talk"),
  await import("../../apps/web/server/utils/hardware"),
  await import("../../apps/web/server/utils/cards")
]) {
  Object.assign(globals, module);
}

/** A route's handler, loaded once its imports stand. */
export async function routeOf<T>(path: string): Promise<(event: RouteEvent) => Promise<T>> {
  return (await import(path)).default as (event: RouteEvent) => Promise<T>;
}

/** What a route answered, or the status and the sentence it refused with. */
export async function asked<T>(handler: (event: RouteEvent) => Promise<T>, event: RouteEvent): Promise<{ status: number; message: string; answer: T | null; data: unknown }> {
  try {
    return { status: 200, message: "", answer: await handler(event), data: null };
  } catch (error) {
    const refused = error as { statusCode?: number; message?: string; data?: unknown };

    return { status: refused.statusCode ?? 500, message: refused.message ?? "", answer: null, data: refused.data ?? null };
  }
}
