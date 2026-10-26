import { defineEventHandler } from "h3";

import type { H3Event } from "h3";

import { wording } from "#shared/wording";

import { CONTROL_SLOW, CONTROL_UNREACHABLE } from "#shared/config";

import { relayedSegment, socketRelay } from "../utils/bundle-relay";
import { attachedService, bundleFile, bundleOfPage, pageReaches, readerMay, readerOf, relayedCall, shareReadCall } from "../utils/console-manifests";
import { ownerHeaders } from "../utils/owner-key";
import { unitAt } from "../utils/units";

// One service's own paths, handed on whole (bmo-ui's `docs/console-bundles.md`, 「How a bundle mounts」;
// `docs/boundary.md`, 「Calls the console makes」): a console bundle's screens call their service at the
// relay base, the service's name and the path the service's own API writes, and the console relays the
// call to the address the service's setting names, with the service's token and the owner key and role of the
// person signed in, behind its own sign-in.
// The method, the query, the body, the headers that say what is asked and the answer — its status, its
// bytes and the headers a browser reads of them — go as they came, so a bundle reads its service's own
// shapes and refusals.
//
// A service a manifest names is relayed at the address of the unit that answered it, and only for the paths under
// its API prefix, the routes it names under `relays`, its module and its stylesheet, to a reader its manifest's role
// and owner key allow (docs/web.md, 「Screens a unit brings」). A unit the console calls directly, which answers no
// manifest, is relayed at the address its setting names.
//
// A bundle's page reaches another service a manifest names only where its own manifest names that service under
// `calls`, on that service's own terms; the page is the address the browser sends as the call's referrer. Any other
// bundle's page is refused, but for a read of that service's own files, which a screen opened from it loads.
//
// A share link is the one road with no session behind it: a reader holding the token opens the bundle's
// share page, and every read that page makes is a share read its manifest names, each carrying the token, which
// is relayed without a session and, whoever is signed in, with no owner key and no role, so every holder of the
// token reads the same (bmo-ui's `docs/console-bundles.md`, 「Share pages」). The bundle's module and stylesheet
// the page is drawn by are relayed without a session as well. Nothing else is.
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
  "content-range",
  "retry-after"
];

// How long a service has to begin answering; the bytes themselves, a file or a stream, may take longer.
const BEGIN_MS = 30_000;

// How long the translator's route has to begin answering where the console's setting names no other wait.
const TRANSLATOR_BEGIN_MS = 90_000;

// How long a call has to begin its answer: the console's own wait for the translator's route, which queues its work
// before it answers, and `BEGIN_MS` for every other (docs/web.md, 「Screens a unit brings」).
function beginMs(service: string, path: string): number {
  const config = useRuntimeConfig() as { translatorBeginMs?: unknown; public?: { bmoUi?: { translator?: { service?: unknown; path?: unknown } } } };
  const translator = config.public?.bmoUi?.translator;

  if (translator?.service !== service || translator.path !== path) return BEGIN_MS;

  const named = Number(config.translatorBeginMs);

  return Number.isInteger(named) && named > 0 ? named : TRANSLATOR_BEGIN_MS;
}

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
  const attached = attachedService(service);
  const unit = attached?.unit ?? unitAt(service.replaceAll("-", "_").toUpperCase());
  const method = getMethod(event).toUpperCase();

  // A name neither a manifest nor a setting names is this console's own absence, not a unit's. A unit the console
  // calls directly — the agency, bmo-job, the receiver, the brain — stands beside the bundles, and its own paths are
  // handed on as they are. A path of a bundle's service outside what its manifest lets through is absent as well.
  if (unit === null) throw createError({ statusCode: 404, statusMessage: "Not Found" });
  if (attached !== null && !relayedCall(attached.manifest, method, `/${rest}`)) throw createError({ statusCode: 404, statusMessage: "Not Found" });

  const reading = method === "GET" || method === "HEAD";
  const session = await getUserSession(event);
  const shared = reading && attached !== null && shareReadCall(attached.manifest, method, `/${rest}`);
  const unsigned = shared || (reading && attached !== null && bundleFile(attached.manifest, `/${rest}`));

  if (session.user === undefined && !unsigned) {
    throw createError({ statusCode: 401, statusMessage: "Unauthorized" });
  }

  // A screen a reader may not open is one that does not stand for them, and so is its service.
  if (session.user !== undefined && attached !== null && !shared && !readerMay(readerOf(await signedInUser(event)), attached.manifest)) {
    throw createError({ statusCode: 404, statusMessage: "Not Found" });
  }

  // A bundle's page calling a service its manifest does not name is refused, whatever the reader may open.
  if (attached !== null && !pageReaches(bundleOfPage(useRuntimeConfig().app.baseURL, getRequestHeader(event, "referer")), attached, method, `/${rest}`)) {
    throw createError({ statusCode: 403, statusMessage: "Forbidden" });
  }

  const headers: Record<string, string> = {};

  for (const name of ASKED_HEADERS) {
    const value = getRequestHeader(event, name);

    if (value !== undefined) headers[name] = value;
  }

  if (unit.token !== null) headers.authorization = `Bearer ${unit.token}`;

  // The owner the unit acts for, and the role they act in, are the person signed in, never what the browser says.
  // A share read carries neither: the token is the whole of what it is held to.
  if (session.user !== undefined && !shared) Object.assign(headers, ownerHeaders(await signedInUser(event)));

  // The body goes as the bytes it came as, so a bundle's file upload is not read as text on the way.
  const body = reading ? undefined : await readRawBody(event);
  const waiting = new AbortController();
  const timer = setTimeout(() => waiting.abort(new DOMException("the service did not begin its answer", "TimeoutError")), beginMs(service, `/${rest}`));
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
