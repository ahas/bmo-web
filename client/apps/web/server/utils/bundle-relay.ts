import { defineWebSocket, unsealSession } from "h3";

import { unitAt, unitHeaders } from "./units";

import type { ConsoleBundleView } from "#shared/console-bundles";

// The relay of a unit's own paths (bmo-ui's `docs/console-bundles.md`, 「How a bundle mounts」; `docs/boundary.md`,
// 「Calls the console makes」): a call under the relay base, the service's name and the path the service's own API
// writes is handed on to the address the service's setting names, with the service's token, behind the console's
// sign-in. A call goes through the catch-all route under the relay base; a socket a bundle declares stands at the
// same path and is relayed here, frame by frame, so the bundle's protocol is the service's own.

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

interface Held {
  upstream?: WebSocket;
  // What the browser sent before the service's socket stood open, handed on in order once it does.
  waiting?: Frame[];
}

// bun adds a `headers` option to the WebSocket constructor; the DOM type does not name it.
interface SocketOptions {
  headers?: Record<string, string>;
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

// Whether the upgrade carries a live session. The upgrade never reaches the console's own middleware, so the seal is
// read here through the same module the routes read it with.
async function signedIn(request: { headers: Headers }): Promise<boolean> {
  const config = useRuntimeConfig();
  const name = config.session?.name ?? "nuxt-session";
  const cookies = new Map(
    (request.headers.get("cookie") ?? "")
      .split(";")
      .map((part) => part.trim().split("="))
      .filter((pair) => pair.length === 2)
      .map(([key, value]) => [key!, value!] as const)
  );
  const sealed = cookies.get(name);

  if (sealed === undefined || sealed === "") return false;

  try {
    const unsealed = await unsealSession(undefined as never, config.session as never, decodeURIComponent(sealed));
    const data = unsealed.data ?? {};

    return typeof data.user === "object" && data.user !== null;
  } catch {
    return false;
  }
}

// The bundle a socket's path names under the relay base, with the rest of the path and the query, or null where no
// bundle declares a socket for that service.
function socketOf(url: string): { bundle: ConsoleBundleView; rest: string; search: string } | null {
  const config = useRuntimeConfig();
  const asked = new URL(url, "http://console.invalid");
  const base = `${config.app.baseURL.replace(/\/+$/, "")}/api/`;

  if (!asked.pathname.startsWith(base)) return null;

  const parts = asked.pathname.slice(base.length).split("/").filter((part) => part !== "");
  const service = parts.shift() ?? "";
  const bundles = (config.consoleBundles ?? []) as ConsoleBundleView[];
  const bundle = bundles.find((one) => one.serviceName === service);

  return bundle === undefined || !bundle.websocket ? null : { bundle, rest: parts.map(relayedSegment).join("/"), search: asked.search };
}

/** The socket hooks of the relay: the service's socket opened at the path the browser's names, and every frame and
 * the close handed on either way. */
export const socketRelay = defineWebSocket({
  async open(peer) {
    const held = peer.context as unknown as Held;
    const asked = socketOf(peer.request.url);

    if (asked === null) {
      peer.close(1008, "no such relay");

      return;
    }

    if (!(await signedIn(peer.request))) {
      peer.close(1008, "unauthorized");

      return;
    }

    const unit = unitAt(asked.bundle.serviceName.replaceAll("-", "_").toUpperCase());

    if (unit === null) {
      peer.close(1011, "the service is not reachable");

      return;
    }

    const target = new URL(`${unit.address}/${asked.rest}${asked.search}`);
    target.protocol = target.protocol === "https:" ? "wss:" : "ws:";

    const Socket = WebSocket as unknown as new (url: URL, options: SocketOptions) => WebSocket;
    const socket = new Socket(target, { headers: unitHeaders(unit) });
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
    const held = peer.context as unknown as Held;
    const frame = message.rawData as Frame;

    if (held.upstream?.readyState === OPEN) held.upstream.send(frame);
    else (held.waiting ??= []).push(frame);
  },

  close(peer, details) {
    const socket = (peer.context as unknown as Held).upstream;
    const code = browserClose(details.code);

    if (socket === undefined || socket.readyState > OPEN) return;

    if (code === undefined) socket.close();
    else socket.close(code, details.reason);
  }
});
