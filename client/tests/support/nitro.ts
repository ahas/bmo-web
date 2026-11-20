import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createError } from "h3";

import { chatAccountOf } from "../../apps/web/server/utils/accounts";
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
  rawBody?: string | Uint8Array;
  // A body arriving in pieces, as a browser's upload streams in, so the stream carries no length of its own.
  streamed?: Uint8Array[];
  // The parts of a multipart body, where a route reads a form.
  parts?: { name?: string; filename?: string; type?: string; data: Uint8Array }[];
  // What a route keeps of the request while it runs, such as the rooms it may read.
  context?: Record<string, unknown>;
}

const globals: Record<string, unknown> = globalThis;

// The console's data folder for this run of the tests, where a route writes the scratch files of a form it carries;
// never the machine's own, and taken away as the run ends.
const dataRoot = join(tmpdir(), `bmo-route-data-${process.pid}`);

process.env.WEB_DATA_DIR = dataRoot;
process.on("exit", () => rmSync(dataRoot, { recursive: true, force: true }));

// The parts of a multipart body framed as a browser sends them, once for each event, so the type a route reads and
// the stream it reads carry the same form. The type is read as the form is framed, since the runtime drops it from a
// framed form whose body was taken first.
const forms = new WeakMap<RouteEvent, { type: string; body: ReadableStream<Uint8Array> }>();

function formOf(event: RouteEvent): { type: string; body: ReadableStream<Uint8Array> } | undefined {
  if (event.parts === undefined) return undefined;

  const held = forms.get(event);

  if (held !== undefined) return held;

  const form = new FormData();

  for (const part of event.parts) {
    if (part.filename === undefined) form.append(part.name ?? "", new TextDecoder().decode(part.data));
    else form.append(part.name ?? "", new File([part.data as Uint8Array<ArrayBuffer>], part.filename, { type: part.type ?? "" }));
  }

  const response = new Response(form);
  const type = response.headers.get("content-type") ?? "";
  const framed = { type, body: response.body! };

  forms.set(event, framed);

  return framed;
}

globals.defineEventHandler = (handler: unknown) => handler;
globals.createError = createError;
globals.fail = fail;
globals.chatAccountOf = chatAccountOf;
globals.requireUserSession = async () => ({ user: { id: 1, name: "tester" } });
globals.requireAdministrator = async () => ({ id: 1, name: "tester", administrator: true });
globals.signedInUser = async () => ({ id: 1, name: "tester", administrator: true });
globals.readBody = async (event: RouteEvent) => event.body;
globals.readMultipartFormData = async (event: RouteEvent) => event.parts ?? null;
globals.getQuery = (event: RouteEvent) => event.query ?? {};
globals.getRouterParam = (event: RouteEvent, name: string) => event.params?.[name];
globals.getMethod = (event: RouteEvent) => event.method ?? "GET";
globals.getRequestHeader = (event: RouteEvent, name: string) =>
  name.toLowerCase() === "content-type" && event.parts !== undefined ? formOf(event)?.type : event.headers?.[name.toLowerCase()];
globals.setResponseStatus = () => {};
globals.readRawBody = async (event: RouteEvent) => event.rawBody;
globals.getRequestWebStream = (event: RouteEvent) => {
  const framed = formOf(event);

  if (framed !== undefined) return framed.body;

  const pieces = event.streamed;

  if (pieces !== undefined) {
    return new ReadableStream<Uint8Array>({
      start(controller) {
        pieces.forEach((piece) => controller.enqueue(piece));
        controller.close();
      }
    });
  }

  return event.rawBody === undefined ? undefined : new Response(event.rawBody as BodyInit).body;
};
// A route that answers with a web response hands it back as it is, which a test reads whole.
globals.sendWebResponse = (_event: RouteEvent, response: Response) => response;

for (const module of [
  await import("../../apps/web/server/utils/units"),
  await import("../../apps/web/server/utils/pocket"),
  await import("../../apps/web/server/utils/background-work"),
  await import("../../apps/web/server/utils/unit-answer"),
  await import("../../apps/web/server/utils/agency"),
  await import("../../apps/web/server/utils/claude-logins"),
  await import("../../apps/web/server/utils/account-service"),
  await import("../../apps/web/server/utils/profile"),
  await import("../../apps/web/server/utils/axes"),
  await import("../../apps/web/server/utils/supervisor-settings"),
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
  await import("../../apps/web/server/utils/drafting"),
  await import("../../apps/web/server/utils/room-links"),
  await import("../../apps/web/server/utils/room-reads"),
  await import("../../apps/web/server/utils/send-keys"),
  await import("../../apps/web/server/utils/documents"),
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
    return { status: 200, message: "", answer: await handler({ ...event, context: event.context ?? {} }), data: null };
  } catch (error) {
    const refused = error as { statusCode?: number; message?: string; data?: unknown };

    return { status: refused.statusCode ?? 500, message: refused.message ?? "", answer: null, data: refused.data ?? null };
  }
}
