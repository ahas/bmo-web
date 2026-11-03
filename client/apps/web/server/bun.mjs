import "#nitro-internal-pollyfills";
import { useNitroApp } from "nitropack/runtime";
import { startScheduleRunner } from "nitropack/runtime/internal";
import wsAdapter from "crossws/adapters/bun";

// The production server's entry: Nitro's own Bun entry with the idle limit off (docs/web.md, 「Running as a
// service」). Bun cuts a connection that has sent nothing for its idle limit, and Nitro's entry reads that limit only
// as a number of seconds, which can neither be nought nor pass 255. The console keeps no clock on a connection, so a
// request waits until its unit answers and a relayed stream or socket stands until its unit or the browser ends it.
// Everything else is Nitro's entry as it stands, written as Nitro's own is, in JavaScript, since the runtime modules
// it imports carry no declarations the console's typecheck can find.

const nitroApp = useNitroApp();
const ws = import.meta._websocket ? wsAdapter(nitroApp.h3App.websocket) : undefined;

const server = Bun.serve({
  port: process.env.NITRO_PORT || process.env.PORT || 3000,
  host: process.env.NITRO_HOST || process.env.HOST,
  idleTimeout: 0,
  // A bundle files a video through the relay as a stream, so this server sets no ceiling of its own on a body.
  maxRequestBodySize: Number.MAX_SAFE_INTEGER,
  websocket: import.meta._websocket ? ws.websocket : undefined,
  async fetch(request, served) {
    if (import.meta._websocket && request.headers.get("upgrade") === "websocket") {
      return ws.handleUpgrade(request, served);
    }

    const url = new URL(request.url);
    const body = request.body ? await request.arrayBuffer() : undefined;

    return nitroApp.localFetch(url.pathname + url.search, {
      host: url.hostname,
      protocol: url.protocol,
      headers: request.headers,
      method: request.method,
      redirect: request.redirect,
      body
    });
  }
});

console.log(`Listening on ${server.url}...`);

if (import.meta._tasks) {
  startScheduleRunner();
}
