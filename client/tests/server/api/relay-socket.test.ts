import { afterAll, describe, expect, test } from "bun:test";

import { globalsRestoredAfter } from "../../support/globals";
import { dirname } from "node:path";

import { consoleManifest } from "bmo-ui/shared/console-manifest";
import { createApp, createRouter, defineEventHandler, sealSession } from "h3";

import { signIn } from "../../../apps/web/server/utils/account-service";
import { attachBundles } from "../../../apps/web/server/utils/console-manifests";
import { standInAccountService } from "../../support/account-service";

import type { Server, WebSocketHandler } from "bun";

// A bundle's socket through the console (docs/boundary.md, 「Calls the console makes」): the console's routes
// stood as the server stands them — its middleware at the base path ahead of the routes, the routes under it —
// with the socket plugin applied, served by the socket adapter the server serves with, and a stand-in unit with a
// socket of its own. A frame goes each way as it came, and the close code each side gives reaches the other. The
// socket opens only on a login that stands, asked of a stand-in account service as a request's is (docs/web.md,
// 「Access」).

const BASE = "/console/";
const SESSION = { name: "nuxt-session", password: "relay-socket-test-password-0123456789" };
const TOKEN = "relayed-token";

const globals: Record<string, unknown> = globalThis;

globalsRestoredAfter(["defineNitroPlugin", "useRuntimeConfig"]);
globals.defineNitroPlugin = (plugin: unknown) => plugin;
globals.useRuntimeConfig = () => ({ app: { baseURL: BASE }, session: SESSION });

interface UnitSocket {
  path: string;
}

// What the unit was asked and what it heard: the path and query each socket opened at, the token it came with,
// the frames, and the code the console's side closed with.
const unitHeard = { opened: [] as { path: string; authorization: string | null; owner: string | null; role: string | null }[], frames: [] as string[], closed: [] as number[] };

const unit = Bun.serve<UnitSocket, never>({
  hostname: "127.0.0.1",
  port: 0,
  fetch(request, server) {
    const url = new URL(request.url);

    unitHeard.opened.push({ path: `${url.pathname}${url.search}`, authorization: request.headers.get("authorization"), owner: request.headers.get("owner-key"), role: request.headers.get("owner-role") });

    return server.upgrade(request, { data: { path: url.pathname } }) ? undefined : new Response("no upgrade", { status: 400 });
  },
  websocket: {
    open(socket) {
      socket.send(`hello ${socket.data.path}`);
    },
    message(socket, message) {
      const text = typeof message === "string" ? message : new TextDecoder().decode(message);

      unitHeard.frames.push(text);

      if (text === "close please") socket.close(4321, "unit done");
      else socket.send(`echo ${text}`);
    },
    close(_socket, code) {
      unitHeard.closed.push(code);
    }
  }
});

const accounts = standInAccountService({ users: [{ id: 7, name: "tester", password: "a password" }] });

process.env.WEB_SERVER_ADDRESS = accounts.address;
process.env.WEB_SERVER_TOKEN = accounts.token;
process.env.RELAYED_ADDRESS = `http://127.0.0.1:${unit.port}`;
process.env.RELAYED_TOKEN = TOKEN;
process.env.PLAIN_ADDRESS = `http://127.0.0.1:${unit.port}`;

// The manifests the units answered: a member's screen with a socket, one with none, and an administrator's.
function manifestOf(name: string, websocket: boolean, role: "member" | "administrator") {
  return consoleManifest({ name, title: `${name}.title`, icon: "i-material-symbols-circle", screenPath: `/${name}`, serviceName: name, bundle: "/bundle.js", words: "/words", role, websocket });
}

const standing = { address: `http://127.0.0.1:${unit.port}`, token: TOKEN };

attachBundles([
  { manifest: manifestOf("relayed", true, "member"), unit: standing, words: {} },
  { manifest: manifestOf("plain", false, "member"), unit: standing, words: {} },
  { manifest: manifestOf("guarded", true, "administrator"), unit: standing, words: {} }
]);

// The socket adapter the server is served with, as h3 carries it.
interface Adapter {
  handleUpgrade: (request: Request, server: Server<unknown>) => Promise<Response | undefined>;
  websocket: WebSocketHandler<unknown>;
}

const adapterOf = (await import(Bun.resolveSync("crossws/adapters/bun", dirname(Bun.resolveSync("h3", import.meta.dir))))).default as (options: unknown) => Adapter;

const route = (await import("../../../apps/web/server/api/[...path]")).default;
const { standSocketLookup } = await import("../../../apps/web/server/plugins/sockets");

const app = createApp();
const router = createRouter();

// A middleware at the base path, as the console's own stand ahead of every route.
app.use(BASE, defineEventHandler(() => undefined));
router.use("/api/**", route);
app.use(BASE, router.handler);
standSocketLookup({ h3App: app, router });

const adapter = adapterOf(app.websocket);
const console_ = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  websocket: adapter.websocket as WebSocketHandler<undefined>,
  async fetch(request, server) {
    return (await adapter.handleUpgrade(request, server)) ?? new Response(null);
  }
});

afterAll(() => {
  void console_.stop(true);
  void unit.stop(true);
  accounts.stop();
  delete process.env.WEB_SERVER_ADDRESS;
  delete process.env.WEB_SERVER_TOKEN;
  delete process.env.RELAYED_ADDRESS;
  delete process.env.RELAYED_TOKEN;
  delete process.env.PLAIN_ADDRESS;
});

// A seal as the login writes it, holding what `data` adds to a login made now.
async function sealOf(data: Record<string, unknown>): Promise<string> {
  const session = { id: crypto.randomUUID(), createdAt: Date.now(), data: { administrator: false, user: { id: 7, name: "tester" }, remember: false, loggedInAt: Date.now(), ...data } };

  return await sealSession({ context: { sessions: { [SESSION.name]: session } } } as never, SESSION);
}

const signedIn = await sealOf({ sid: await signIn("tester", "a password", "127.0.0.1") });

const cookieOf = (sealed: string): string => `${SESSION.name}=${encodeURIComponent(sealed)}`;

// A browser's socket on the console at `path`, with what it heard and how it closed.
// The browser's own `Owner-Key` is one it cannot choose, so every socket here sends one the console must replace.
function opened(path: string, cookie: string | null = cookieOf(signedIn)) {
  // bun's WebSocket takes a `headers` option, but the checker reads the web platform's constructor, which takes protocols.
  const SocketWith = WebSocket as new (url: string, options: string | string[] | Bun.WebSocketOptions) => WebSocket;
  const headers: Record<string, string> = { "owner-key": "browser-chosen", "owner-role": "administrator", ...(cookie === null ? {} : { cookie }) };
  const socket = new SocketWith(`ws://127.0.0.1:${console_.port}${BASE}api/${path}`, { headers });
  const heard: string[] = [];
  const closed = new Promise<{ code: number; reason: string }>((resolve) => socket.addEventListener("close", (close) => resolve({ code: close.code, reason: close.reason })));

  socket.addEventListener("message", (message) => heard.push(String(message.data)));

  return { socket, heard, closed };
}

async function until(holds: () => boolean): Promise<void> {
  for (let tries = 0; tries < 200 && !holds(); tries++) await Bun.sleep(10);

  expect(holds()).toBe(true);
}

describe("a bundle's socket through the console", () => {
  test("reaches the unit's socket at the bundle's path with the unit's token and the login's owner key, and a frame goes each way", async () => {
    const { socket, heard } = opened("relayed/terminals/term%20a/socket?cols=80");

    socket.addEventListener("open", () => socket.send("ping"));

    await until(() => heard.includes("echo ping"));

    expect(unitHeard.opened.at(-1)).toEqual({ path: "/terminals/term%20a/socket?cols=80", authorization: `Bearer ${TOKEN}`, owner: "7", role: "member" });
    expect(heard[0]).toBe("hello /terminals/term%20a/socket");
    expect(unitHeard.frames).toContain("ping");

    socket.close();
  });

  test("hands the unit's close code to the browser", async () => {
    const { socket, closed } = opened("relayed/sessions/one");

    socket.addEventListener("open", () => socket.send("close please"));

    expect(await closed).toEqual({ code: 4321, reason: "unit done" });
  });

  test("hands the browser's close code to the unit", async () => {
    const { socket, heard } = opened("relayed/sessions/two");

    await until(() => heard.length > 0);

    const before = unitHeard.closed.length;

    socket.close(4000, "browser done");

    await until(() => unitHeard.closed.length > before);

    expect(unitHeard.closed.at(-1)).toBe(4000);
  });

  test("reads the first of two session cookies, as the session layer does", async () => {
    const { socket, heard } = opened("relayed/sessions/six", `${SESSION.name}=${encodeURIComponent(signedIn)}; other=a=b; ${SESSION.name}=`);

    await until(() => heard.length > 0);

    expect(heard[0]).toBe("hello /sessions/six");

    socket.close();
  });

  test("closes a socket with no session behind it", async () => {
    const { closed } = opened("relayed/sessions/three", null);

    expect(await closed).toEqual({ code: 1008, reason: "unauthorized" });
  });

  test("closes a socket whose sumida session is gone before the unit hears of it", async () => {
    const before = unitHeard.opened.length;
    const { closed } = opened("relayed/sessions/seven", cookieOf(await sealOf({ sid: "bmo.sid=signed-out" })));

    expect(await closed).toEqual({ code: 1008, reason: "unauthorized" });
    expect(unitHeard.opened.length).toBe(before);
  });

  test("closes a socket whose seal holds no sumida session once the model is in force", async () => {
    const { closed } = opened("relayed/sessions/eight", cookieOf(await sealOf({})));

    expect(await closed).toEqual({ code: 1008, reason: "unauthorized" });
  });

  test("closes a socket whose seal is past its span", async () => {
    const sid = await signIn("tester", "a password", "127.0.0.1");
    const { closed } = opened("relayed/sessions/nine", cookieOf(await sealOf({ sid, loggedInAt: Date.now() - 13 * 60 * 60 * 1000 })));

    expect(await closed).toEqual({ code: 1008, reason: "unauthorized" });
  });

  test("closes a socket to be tried again where the account service does not answer", async () => {
    const sid = await signIn("tester", "a password", "127.0.0.1");

    process.env.WEB_SERVER_ADDRESS = "";

    try {
      const { closed } = opened("relayed/sessions/ten", cookieOf(await sealOf({ sid })));

      expect(await closed).toEqual({ code: 1013, reason: "the accounts do not answer" });
    } finally {
      process.env.WEB_SERVER_ADDRESS = accounts.address;
    }
  });

  test("closes a socket on a screen the reader's role does not open", async () => {
    const { closed } = opened("guarded/sessions/five");

    expect(await closed).toEqual({ code: 1008, reason: "unauthorized" });
  });

  test("closes a socket on a service no manifest asks one for", async () => {
    const { closed } = opened("plain/sessions/four");

    expect(await closed).toEqual({ code: 1008, reason: "no such relay" });
  });
});
