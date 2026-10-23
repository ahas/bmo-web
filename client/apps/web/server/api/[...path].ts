import { defineEventHandler } from "h3";

import type { H3Event } from "h3";

import { wording } from "#shared/wording";

import { CONTROL_SLOW, CONTROL_UNREACHABLE } from "#shared/config";

import { relayedSegment, socketRelay } from "../utils/bundle-relay";
import { OWNER_KEY_HEADER, ownerKeyOf } from "../utils/owner-key";
import { unitAt } from "../utils/units";

// One service's own paths, handed on whole (bmo-ui's `docs/console-bundles.md`, 「How a bundle mounts」;
// `docs/boundary.md`, 「Calls the console makes」): a console bundle's screens call their service at the
// relay base, the service's name and the path the service's own API writes, and the console relays the
// call to the address the service's setting names, with the service's token and the owner key of the person
// signed in, behind its own sign-in.
// The method, the query, the body, the headers that say what is asked and the answer — its status, its
// bytes and the headers a browser reads of them — go as they came, so a bundle reads its service's own
// shapes and refusals.
//
// A share link is the one road with no session behind it: a reader holding the token opens the bundle's
// share page, and the one read that page makes of the token — `shares/<token>` — is relayed without a
// session. Nothing else is: a service whose share page needs more than the token's own resource is a
// contract gap between that bundle and its console.
//
// A socket a bundle declares stands at the same path, and the route carries the relay's socket hooks for it
// (`utils/bundle-relay.ts`).

/** The headers a request is handed on with, and an answer's headers a browser reads. */
const ASKED_HEADERS = ["accept", "content-type", "range", "if-none-match", "if-modified-since", "last-event-id", "cache-control"];

const ANSWERED_HEADERS = [
  "content-type",
  "content-length",
  "content-disposition",
  "cache-control",
  "x-content-type-options",
  "etag",
  "last-modified",
  "accept-ranges",
  "content-range"
];

// How long a service has to begin answering; the bytes themselves, a file or a stream, may take longer.
const BEGIN_MS = 30_000;

// A road under a share token, which is the whole of the permission it carries.
const SHARE_READ = /^shares\/[^/]+(\/content)?$/;

function queryOf(event: Parameters<typeof getQuery>[0]): string {
  const asked = new URLSearchParams();

  for (const [name, value] of Object.entries(getQuery(event))) {
    for (const one of Array.isArray(value) ? value : [value]) {
      if (one !== undefined && one !== null) asked.append(name, String(one));
    }
  }

  const text = asked.toString();

  return text === "" ? "" : `?${text}`;
}

async function relayed(event: H3Event): Promise<Response> {
  // The path is split where the request wrote a slash and nowhere else: a slash a segment carries escaped is that
  // segment's own, and the segment is handed on still escaped, so the service reads the segment the bundle wrote.
  const path = (getRouterParam(event, "path") ?? "").split("/").filter((part) => part !== "");
  const service = path.shift() ?? "";
  const rest = path.map(relayedSegment).join("/");
  const declarations = (useAppConfig().consoleBundles ?? []) as { serviceName: string }[];
  const declared = declarations.find((bundle) => bundle.serviceName === service);
  const unit = unitAt(service.replaceAll("-", "_").toUpperCase());

  // A name neither a bundle declares nor a setting names is this console's own absence, not a unit's. A unit the
  // console calls directly — the agency, bmo-job, the receiver, the brain — stands beside the bundles, and its own
  // paths are handed on as they are.
  if (declared === undefined && unit === null) throw createError({ statusCode: 404, statusMessage: "Not Found" });

  const method = getMethod(event).toUpperCase();
  const reading = method === "GET" || method === "HEAD";
  const session = await getUserSession(event);

  if (session.user === undefined && !(reading && SHARE_READ.test(rest))) {
    throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
  }

  if (unit === null) throw fail(503, wording(CONTROL_UNREACHABLE));

  const headers: Record<string, string> = {};

  for (const name of ASKED_HEADERS) {
    const value = getRequestHeader(event, name);

    if (value !== undefined) headers[name] = value;
  }

  if (unit.token !== null) headers.authorization = `Bearer ${unit.token}`;

  // The owner the unit acts for is the person signed in, never what the browser says it is.
  const owner = session.user === undefined ? null : ownerKeyOf(await signedInUser(event));

  if (owner !== null) headers[OWNER_KEY_HEADER] = owner;

  // The body goes as the bytes it came as, so a bundle's file upload is not read as text on the way.
  const body = reading ? undefined : await readRawBody(event);
  const waiting = new AbortController();
  const timer = setTimeout(() => waiting.abort(new DOMException("the service did not begin its answer", "TimeoutError")), BEGIN_MS);
  let response: Response;

  try {
    response = await fetch(`${unit.address}/${rest}${queryOf(event)}`, { method, headers, body, signal: waiting.signal });
  } catch (error) {
    throw (error instanceof Error && error.name === "TimeoutError") || waiting.signal.aborted
      ? fail(504, wording(CONTROL_SLOW))
      : fail(503, wording(CONTROL_UNREACHABLE));
  } finally {
    clearTimeout(timer);
  }

  // A stream the browser lets go of is a call to the service let go of too, so a closed tab leaves no
  // stream open on the unit.
  event.node.res?.on("close", () => waiting.abort());

  const answered = new Headers();

  for (const header of ANSWERED_HEADERS) {
    const value = response.headers.get(header);

    if (value !== null) answered.set(header, value);
  }

  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: answered });
}

export default defineEventHandler({ handler: relayed, websocket: socketRelay });
