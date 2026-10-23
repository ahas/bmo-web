import { defineWebSocket, unsealSession } from "h3";

import { signedInOf } from "./accounts";
import { attachedService, readerMay, readerOf, relayedPath } from "./console-manifests";
import { ownerHeaders } from "./owner-key";
import { unitHeaders } from "./units";

import type { SignedIn } from "./accounts";
import type { AttachedBundle } from "./console-manifests";

// The relay of a unit's own paths (bmo-ui's `docs/console-bundles.md`, 「How a bundle mounts」; `docs/boundary.md`,
// 「Calls the console makes」): a call under the relay base, the service's name and the path the service's own API
// writes is handed on to the address the service's setting names, with the service's token and the owner key and
// role of the person signed in, behind the console's sign-in. A call goes through the catch-all route under the relay base; a
// socket a bundle declares stands at the same path and is relayed here, frame by frame, so the bundle's protocol is
// the service's own.

/** One segment as it came, escaped once: what the request escaped stays escaped and what it left bare is escaped
 * now, and a segment whose escapes do not read as text goes as it came. */
export function relayedSegment(raw: string): string {
  try {
    return encodeURIComponent(decodeURIComponent(raw));
  } catch {
    return raw;
  }
}

type Frame = string | ArrayBuffer | Uint8Array;

// What the relay holds for a browser's socket, kept in the socket's context under its own key.
class Held {
  upstream?: WebSocket;
  // What the browser sent before the service's socket stood open, handed on in order once it does.
  waiting?: Frame[];
}

const HELD = "relay";

function heldOf(peer: { context: Record<string, unknown> }): Held {
  const held = peer.context[HELD];

  if (held instanceof Held) return held;

  const made = new Held();

  peer.context[HELD] = made;

  return made;
}

const OPEN = 1;

// The codes a close frame never carries, which each side reports for a close that carried none (1005) or a socket
// that broke (1006, 1015); handed on, they read as the plain close and as the service failing.
const NO_STATUS = 1005;
const BROKEN = [1006, 1015];

// A browser's socket closes with 1000 or a code of the application's own; any other it gave is the plain close.
function browserClose(code: number | undefined): number | undefined {
  return code === 1000 || (code !== undefined && code >= 3000 && code <= 4999) ? code : undefined;
}

// Who the upgrade's session says is signed in, or null where it carries no live session. The upgrade never reaches
// the console's own middleware, so the seal is read here through the same module the routes read it with.
async function signedIn(request: { headers: Headers }): Promise<SignedIn | null> {
  const config = useRuntimeConfig();
  const name = config.session?.name ?? "nuxt-session";
  // The cookie is read as the session layer reads it on every other request: split at its first equals sign, and
  // the first of two by the same name — the one of the longer path, as the browser sends them — taken.
  const cookies = new Map<string, string>();

  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const at = part.indexOf("=");
    const key = part.slice(0, at).trim();

    if (at > 0 && !cookies.has(key)) cookies.set(key, part.slice(at + 1).trim());
  }

  const sealed = cookies.get(name);

  if (sealed === undefined || sealed === "") return null;

  try {
    const unsealed = await unsealSession(undefined as never, config.session as never, decodeURIComponent(sealed));
    const data = (unsealed.data ?? {}) as { user?: unknown };

    return typeof data.user === "object" && data.user !== null ? await signedInOf(data as Parameters<typeof signedInOf>[0]) : null;
  } catch {
    return null;
  }
}

// The bundle a socket's path names under the relay base, with the rest of the path and the query, or null where no
// manifest asks for a socket to that service, or the path stands outside its API prefix.
function socketOf(url: string): { bundle: AttachedBundle; rest: string; search: string } | null {
  const config = useRuntimeConfig();
  const asked = new URL(url, "http://console.invalid");
  const base = `${config.app.baseURL.replace(/\/+$/, "")}/api/`;

  if (!asked.pathname.startsWith(base)) return null;

  const parts = asked.pathname.slice(base.length).split("/").filter((part) => part !== "");
  const service = parts.shift() ?? "";
  const bundle = attachedService(service);
  const rest = parts.map(relayedSegment).join("/");

  return bundle === null || !bundle.manifest.websocket || !relayedPath(bundle.manifest, `/${rest}`) ? null : { bundle, rest, search: asked.search };
}

/** The socket hooks of the relay: the service's socket opened at the path the browser's names, and every frame and
 * the close handed on either way. */
export const socketRelay = defineWebSocket({
  async open(peer) {
    const held = heldOf(peer);
    const asked = socketOf(peer.request.url);

    if (asked === null) {
      peer.close(1008, "no such relay");

      return;
    }

    const signed = await signedIn(peer.request);

    if (signed === null || !readerMay(readerOf(signed), asked.bundle.manifest)) {
      peer.close(1008, "unauthorized");

      return;
    }

    const unit = asked.bundle.unit;

    const target = new URL(`${unit.address}/${asked.rest}${asked.search}`);
    target.protocol = target.protocol === "https:" ? "wss:" : "ws:";

    // bun's WebSocket takes a `headers` option, but the checker reads the web platform's constructor, which takes protocols.
    const Socket = WebSocket as new (url: URL, options: string | string[] | Bun.WebSocketOptions) => WebSocket;
    const socket = new Socket(target, { headers: { ...unitHeaders(unit), ...ownerHeaders(signed) } });
    socket.binaryType = "arraybuffer";
    held.upstream = socket;

    socket.addEventListener("open", () => {
      for (const frame of held.waiting?.splice(0) ?? []) socket.send(frame);
    });
    socket.addEventListener("message", (message) => {
      if (peer.websocket.readyState === OPEN) peer.send(message.data as string | ArrayBuffer);
    });
    socket.addEventListener("close", (close) => {
      if (close.code === NO_STATUS) peer.close(1000, close.reason);
      else if (BROKEN.includes(close.code)) peer.close(1011, "the service failed");
      else peer.close(close.code, close.reason);
    });
  },

  message(peer, message) {
    const held = heldOf(peer);
    const frame = message.rawData as Frame;

    if (held.upstream?.readyState === OPEN) held.upstream.send(frame);
    else (held.waiting ??= []).push(frame);
  },

  close(peer, details) {
    const socket = heldOf(peer).upstream;
    const code = browserClose(details.code);

    if (socket === undefined || socket.readyState > OPEN) return;

    if (code === undefined) socket.close();
    else socket.close(code, details.reason);
  }
});
