import { afterAll, afterEach, beforeAll, describe, expect, test } from "bun:test";

import { globalsRestoredAfter } from "../../support/globals";

import { attachBundles, attachedService, readManifests } from "../../../apps/web/server/utils/console-manifests";
import { manifestFields, manifestOf } from "../../support/console-manifest";
import { routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { RouteEvent } from "../../support/nitro";

// The relay hands a service's own path on as the bundle wrote it: a segment carrying an escaped slash stays one
// segment, still escaped, and a space or a letter outside ASCII reaches the service escaped once, never twice.

const globals: Record<string, unknown> = globalThis;

// Who is signed in, which a test may take away: the support's signed-in administrator, user 1, by default.
let session: { user?: { id: number; name: string } } = { user: { id: 1, name: "tester" } };

globalsRestoredAfter(["getUserSession", "useRuntimeConfig"]);
globals.getUserSession = async () => session;
// The console served at the root unless a test says otherwise.
globals.useRuntimeConfig = () => ({ app: { baseURL: "/" } });
// No bundle stands but those a test attaches, whatever a file run before this one left attached.
attachBundles([]);

const unit = standIn("RELAYED", () => answer({ ok: true }));
const handler = await routeOf<Response>("../../apps/web/server/api/[...path]");

// What h3 hands the route as its path parameter: the request's path past the relay base, escapes untouched.
function asking(path: string): RouteEvent {
  return { params: { path: `relayed/${path}` }, node: {} } as RouteEvent;
}

describe("the relay's path", () => {
  test("reaches the service exactly as the bundle wrote it", async () => {
    const written = ["places", encodeURIComponent("volume:/srv/share"), "entries", encodeURIComponent("a file.txt"), encodeURIComponent("\u00e9t\u00e9")].join("/");

    const response = await handler(asking(written));

    expect(response.status).toBe(200);
    expect(unit.asked.at(-1)?.path).toBe(`/${written}`);
  });

  // A service that reads a body by its stated length, as a file's upload does, refuses one sent in chunks.
  let heard: Uint8Array | undefined;
  let framing: { length: string | null; chunked: string | null } | undefined;
  const binary = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      heard = new Uint8Array(await request.arrayBuffer());
      framing = { length: request.headers.get("content-length"), chunked: request.headers.get("transfer-encoding") };

      return answer({ ok: true });
    }
  });

  // The bundles a test attaches go once it ends, a test that ran out of time among them, so nothing it left reaches
  // the tests after it.
  afterEach(() => attachBundles([]));
  afterAll(() => void binary.stop(true));

  test("hands a body on byte for byte, whatever it holds, with the length the browser named", async () => {
    const bytes = new Uint8Array([0x00, 0xff, 0xfe, 0xc0, 0x80, 0xb0, 0xa1, 0x7f]);

    // A change goes to a service a manifest names; one the console calls directly is relayed for a read alone.
    attachBundles([{ manifest: manifestOf("binary", { apiPrefix: "/files" }), unit: { address: `http://127.0.0.1:${binary.port}`, token: null }, words: {} }]);
    await handler({ params: { path: "binary/files" }, method: "POST", headers: { "content-length": String(bytes.length) }, streamed: [bytes.slice(0, 3), bytes.slice(3)], node: {} } as RouteEvent);

    expect(heard).toEqual(bytes);
    expect(framing).toEqual({ length: String(bytes.length), chunked: null });
  });

  test("of a unit the console calls directly is a read alone: a change asked of it is absent, and reaches no unit", async () => {
    unit.asked.length = 0;

    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const status = await handler({ ...asking("rooms/-21/messages"), method } as RouteEvent).then(
        (response) => response.status,
        (error: { statusCode?: number }) => error.statusCode
      );

      expect({ method, status }).toEqual({ method, status: 404 });
    }

    expect(unit.asked).toEqual([]);
    expect((await handler(asking("rooms/-21/messages"))).status).toBe(200);
  });

  test("of a unit the console calls directly is refused to a bundle's page, which no manifest lets reach it", async () => {
    attachBundles([{ manifest: manifestOf("caller", { bundle: "/console/bundle/module-a.js", apiPrefix: "/console" }), unit: { address: unit.address, token: null }, words: {} }]);
    unit.asked.length = 0;

    const status = await handler({ ...asking("rooms"), headers: { referer: "https://console.example.test/caller" } } as RouteEvent).then(
      (response) => response.status,
      (error: { statusCode?: number }) => error.statusCode
    );

    expect(status).toBe(403);
    expect(unit.asked).toEqual([]);
  });

  test("escapes once what the request left bare", async () => {
    await handler(asking("places/volume:x/entries"));

    expect(unit.asked.at(-1)?.path).toBe("/places/volume%3Ax/entries");
  });

  test("hands on a segment whose escapes do not read as text as it came", async () => {
    await handler(asking("places/100%/entries"));

    expect(unit.asked.at(-1)?.path).toBe("/places/100%/entries");
  });

  test("refuses a segment that reads as `.` or `..`, bare or escaped, and asks no unit", async () => {
    const before = unit.asked.length;

    for (const path of ["places/../secrets", "places/%2e%2e/secrets", "places/%2E%2e/secrets", "places/.%2e/secrets", "places/./entries", "places/%2e/entries", "%2e%2e"]) {
      const refused = await handler(asking(path)).then(
        () => null,
        (error: { statusCode?: number }) => error.statusCode
      );

      expect(refused).toBe(400);
    }

    expect(unit.asked.length).toBe(before);
  });

  test("hands on a segment that only holds dots among other letters", async () => {
    await handler(asking("places/..hidden/a.b/..."));

    expect(unit.asked.at(-1)?.path).toBe("/places/..hidden/a.b/...");
  });

  test("lets the console's screens alone frame an answer whose unit set no policy", async () => {
    const response = await handler(asking("places"));

    expect(response.headers.get("content-security-policy")).toBe("frame-ancestors 'self'");
  });
});

// The owner a unit acts for and the role they act in: the console's to say, from the person signed in, whatever the
// browser sent.
describe("the relay's owner key and role", () => {
  const heard: (string | null)[] = [];
  const roles: (string | null)[] = [];
  const globals: Record<string, unknown> = globalThis;
  const keyed = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      heard.push(request.headers.get("owner-key"));
      roles.push(request.headers.get("owner-role"));

      return Response.json({ ok: true });
    }
  });

  process.env.KEYED_ADDRESS = `http://127.0.0.1:${keyed.port}`;
  afterAll(() => {
    void keyed.stop(true);
    delete process.env.KEYED_ADDRESS;
  });

  test("is the signed-in login's user id and role, in place of the ones the browser sent", async () => {
    const response = await handler({ params: { path: "keyed/accounts" }, headers: { "owner-key": "browser-chosen", "owner-role": "administrator" }, node: {} } as RouteEvent);

    expect(response.status).toBe(200);
    expect(heard.at(-1)).toBe("1");
    expect(roles.at(-1)).toBe("administrator");
  });

  test("names a member a member, whatever the browser says", async () => {
    const administrator = globals.signedInUser;

    globals.signedInUser = async () => ({ id: 2, name: "member-a", administrator: false });

    try {
      await handler({ params: { path: "keyed/accounts" }, headers: { "owner-role": "administrator" }, node: {} } as RouteEvent);
    } finally {
      globals.signedInUser = administrator;
    }

    expect(heard.at(-1)).toBe("2");
    expect(roles.at(-1)).toBe("member");
  });
});

// A service a manifest names: relayed at the unit that answered it, only under its API prefix and for its module, its
// stylesheet and the files of its module's folder, the module and the stylesheet of which a share page reads with no
// session, and to a reader the manifest's role allows.
describe("the relay of a service a manifest names", () => {
  const heard: string[] = [];
  const served = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      heard.push(new URL(request.url).pathname);

      return Response.json({ ok: true });
    }
  });
  const named = (name: string, role: "member" | "administrator") => ({
    manifest: manifestOf(name, { stylesheet: "/console/bundle.css", apiPrefix: "/screen", role }),
    unit: { address: `http://127.0.0.1:${served.port}`, token: null },
    words: {}
  });

  beforeAll(() => attachBundles([named("screened", "member"), named("guarded", "administrator")]));
  afterAll(() => {
    attachBundles([]);
    void served.stop(true);
  });

  const call = (path: string) => handler({ params: { path }, node: {} } as RouteEvent).then((response) => response.status, (error: { statusCode?: number }) => error.statusCode);

  test("hands on a path under the API prefix to the unit that answered the manifest", async () => {
    expect(await call("screened/screen/items")).toBe(200);
    expect(heard.at(-1)).toBe("/screen/items");
  });

  test("hands on the module, the stylesheet and a chunk in the module's folder outside the prefix, and nothing else", async () => {
    expect(await call("screened/console/bundle.js")).toBe(200);
    expect(await call("screened/console/bundle.css")).toBe(200);
    expect(await call("screened/console/chunks/chunk-a.js")).toBe(200);
    expect(heard.at(-1)).toBe("/console/chunks/chunk-a.js");
    expect(await call("screened/elsewhere")).toBe(404);
  });

  test("hands the module on with no session, and nothing else of the service", async () => {
    session = {};

    try {
      expect(await call("screened/console/bundle.js")).toBe(200);
      expect(await call("screened/screen/items")).toBe(401);
    } finally {
      session = { user: { id: 1, name: "tester" } };
    }
  });

  test("is absent to a reader the manifest's role does not open it to", async () => {
    const administrator = globals.signedInUser;

    globals.signedInUser = async () => ({ id: 2, name: "member-a", administrator: false });

    try {
      expect(await call("guarded/screen/items")).toBe(404);
      expect(await call("screened/screen/items")).toBe(200);
    } finally {
      globals.signedInUser = administrator;
    }
  });
});

// A bundle's page reaches another service a manifest names only where its own manifest names it under `calls`, on that
// service's own terms; the page is the referrer the browser sends (docs/web.md, 「Screens a unit brings」).
describe("the relay of a call from a bundle's page", () => {
  const heard: string[] = [];
  const served = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      heard.push(new URL(request.url).pathname);

      return Response.json({ ok: true });
    }
  });
  const named = (name: string, role: "member" | "administrator", calls: string[] = []) => ({
    manifest: manifestOf(name, { bundle: "/console/bundle/module-a.js", stylesheet: "/console/bundle/style-a.css", apiPrefix: "/console", role, calls }),
    unit: { address: `http://127.0.0.1:${served.port}`, token: null },
    words: {}
  });
  const runtime = globals.useRuntimeConfig;

  beforeAll(() => {
    globals.useRuntimeConfig = () => ({ app: { baseURL: "/web/" } });
    attachBundles([named("caller", "administrator", ["callee"]), named("stranger", "administrator"), named("callee", "administrator")]);
  });
  afterAll(() => {
    attachBundles([]);
    globals.useRuntimeConfig = runtime;
    void served.stop(true);
  });

  const call = (path: string, referer?: string, method = "POST") =>
    handler({ params: { path }, method, headers: referer === undefined ? {} : { referer }, node: {} } as RouteEvent).then(
      (response) => response.status,
      (error: { statusCode?: number }) => error.statusCode
    );

  test("is relayed from a page whose manifest names the service, under that service's own prefix", async () => {
    expect(await call("callee/console/translations", "https://console.example.test/web/caller/books?tab=2")).toBe(200);
    expect(heard.at(-1)).toBe("/console/translations");
    expect(await call("callee/translations", "https://console.example.test/web/caller")).toBe(404);
  });

  test("is refused from a bundle's page whose manifest does not name the service", async () => {
    expect(await call("callee/console/translations", "https://console.example.test/web/stranger")).toBe(403);
    expect(await call("caller/console/items", "https://console.example.test/web/callee/one")).toBe(403);
  });

  test("is relayed from the service's own page, from a page that is no bundle's and with no referrer", async () => {
    expect(await call("callee/console/translations", "https://console.example.test/web/callee")).toBe(200);
    expect(await call("callee/console/translations", "https://console.example.test/web/rooms/4")).toBe(200);
    expect(await call("callee/console/translations", "https://console.example.test/stranger")).toBe(200);
    expect(await call("callee/console/translations")).toBe(200);
  });

  test("lets another bundle's page read the service's module, stylesheet and the files in its module's folder and below", async () => {
    const page = "https://console.example.test/web/stranger";

    expect(await call("callee/console/bundle/module-a.js", page, "GET")).toBe(200);
    expect(await call("callee/console/bundle/style-a.css", page, "GET")).toBe(200);
    expect(await call("callee/console/bundle/chunk-b.js", page, "GET")).toBe(200);
    expect(await call("callee/console/bundle/chunks/chunk-c.js", page, "GET")).toBe(200);
    expect(await call("callee/console/bundle/chunk-b.js", page, "POST")).toBe(403);
    expect(await call("callee/console/items", page, "GET")).toBe(403);
  });

  test("leaves a reader the called service's own role refuses absent, whatever the page names", async () => {
    const administrator = globals.signedInUser;

    globals.signedInUser = async () => ({ id: 2, name: "member-a", administrator: false });

    try {
      expect(await call("callee/console/translations", "https://console.example.test/web/caller")).toBe(404);
    } finally {
      globals.signedInUser = administrator;
    }
  });
});

// A route a manifest names under `relays` stands outside its API prefix and is relayed by its method and path alone,
// for its own screens and for a page whose manifest names the service under `calls`; every call waits for the
// service's answer however long it takes to begin (docs/web.md, 「Screens a unit brings」).
describe("the relay of a route a manifest relays", () => {
  const heard: string[] = [];
  const served = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const path = new URL(request.url).pathname;

      heard.push(`${request.method} ${path}`);
      if (path === "/slow" || path === "/readings") await Bun.sleep(150);
      if (path === "/busy") return Response.json({ code: "busy" }, { status: 503, headers: { "retry-after": "5" } });

      return Response.json({ ok: true });
    }
  });
  const named = (name: string, calls: string[] = [], relays: { method: string; path: string }[] = []) => ({
    manifest: manifestOf(name, { bundle: "/console/bundle/module-a.js", apiPrefix: "/console", role: "administrator", calls, relays }),
    unit: { address: `http://127.0.0.1:${served.port}`, token: null },
    words: {}
  });
  const runtime = globals.useRuntimeConfig;
  let translator: { service: string; path: string } = { service: "", path: "" };

  beforeAll(() => {
    globals.useRuntimeConfig = () => ({ app: { baseURL: "/" }, public: { bmoUi: { translator } } });
    attachBundles([
      named("caller", ["reader"]),
      named("stranger"),
      named("reader", [], [
        { method: "POST", path: "/readings" },
        { method: "POST", path: "/slow" },
        { method: "POST", path: "/busy" }
      ])
    ]);
  });
  afterAll(() => {
    attachBundles([]);
    globals.useRuntimeConfig = runtime;
    void served.stop(true);
  });

  const call = (path: string, method = "POST", referer?: string) =>
    handler({ params: { path }, method, headers: referer === undefined ? {} : { referer }, node: {} } as RouteEvent).then(
      (response) => response.status,
      (error: { statusCode?: number }) => error.statusCode
    );

  test("hands on the route by its method and path, and no other method or path beside it", async () => {
    expect(await call("reader/readings")).toBe(200);
    expect(heard.at(-1)).toBe("POST /readings");
    expect(await call("reader/readings", "GET")).toBe(404);
    expect(await call("reader/readings/kept")).toBe(404);
  });

  test("hands it on from a page whose manifest names the service, and refuses another bundle's page", async () => {
    expect(await call("reader/readings", "POST", "https://console.example.test/caller")).toBe(200);
    expect(await call("reader/readings", "POST", "https://console.example.test/stranger")).toBe(403);
  });

  test("hands a busy answer on with the wait the service names", async () => {
    const response = (await handler({ params: { path: "reader/busy" }, method: "POST", headers: {}, node: {} } as RouteEvent)) as Response;

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("5");
  });

  test("waits for a slow service's answer, the translator's route as much as any other", async () => {
    translator = { service: "reader", path: "/readings" };

    try {
      expect(await call("reader/readings")).toBe(200);
      expect(await call("reader/slow")).toBe(200);
    } finally {
      translator = { service: "", path: "" };
    }
  });
});

// The share reads a manifest names (bmo-ui's `docs/console-bundles.md`, 「Share pages」): relayed with no session and,
// whoever is signed in, with no owner key and no role; a manifest naming none has none.
describe("the relay of a share read", () => {
  const heard: { path: string; key: string | null; role: string | null }[] = [];
  const served = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const path = new URL(request.url).pathname;

      heard.push({ path, key: request.headers.get("owner-key"), role: request.headers.get("owner-role") });

      if (path === "/links/Ab3_x/files/5") {
        return new Response("bytes", {
          status: 206,
          headers: { "content-range": "bytes 0-4/40", "accept-ranges": "bytes", "access-control-allow-origin": "*", "set-cookie": "kept=no" }
        });
      }

      if (path === "/links/Ab3_x/page") {
        return new Response("<p>page</p>", {
          headers: { "content-type": "text/html", "content-security-policy": "default-src 'none'", "referrer-policy": "no-referrer", "x-powered-by": "unit" }
        });
      }

      return Response.json({ ok: true });
    }
  });
  const named = (name: string, role: "member" | "administrator", shareReads?: string[]) => ({
    manifest: manifestOf(name, { role, ...(shareReads === undefined ? {} : { shareReads }) }),
    unit: { address: `http://127.0.0.1:${served.port}`, token: null },
    words: {}
  });

  beforeAll(() => attachBundles([named("linked", "administrator", ["/links/{token}", "/links/{token}/files/{fileId}", "/links/{token}/page"]), named("plain", "member")]));
  afterAll(() => {
    attachBundles([]);
    void served.stop(true);
  });

  const call = (path: string, method = "GET") =>
    handler({ params: { path }, method, node: {} } as RouteEvent).then((response) => response.status, (error: { statusCode?: number }) => error.statusCode);
  const signedOut = async (asked: () => Promise<unknown>) => {
    session = {};

    try {
      await asked();
    } finally {
      session = { user: { id: 1, name: "tester" } };
    }
  };

  test("is relayed with no session for every pattern the manifest names, and nothing else of the service is", async () => {
    await signedOut(async () => {
      expect(await call("linked/links/Ab3_x")).toBe(200);
      expect(heard.at(-1)).toEqual({ path: "/links/Ab3_x", key: null, role: null });
      expect(await call("linked/links/Ab3_x/files/4")).toBe(200);
      expect(await call("linked/links/Ab3_x/other")).toBe(401);
      expect(await call("linked/links")).toBe(401);
      expect(await call("linked/shares/Ab3_x")).toBe(401);
    });
  });

  test("carries no owner key and no role for a reader signed in, even one the manifest's role refuses", async () => {
    const administrator = globals.signedInUser;

    globals.signedInUser = async () => ({ id: 2, name: "member-a", administrator: false });

    try {
      expect(await call("linked/links/Ab3_x")).toBe(200);
      expect(heard.at(-1)).toEqual({ path: "/links/Ab3_x", key: null, role: null });
      expect(await call("linked/elsewhere")).toBe(404);
    } finally {
      globals.signedInUser = administrator;
    }

    expect(await call("plain/items")).toBe(200);
    expect(heard.at(-1)).toEqual({ path: "/items", key: "1", role: "administrator" });
  });

  test("hands on a ranged read's ranges and the origins it lets read it, and a hosted page's policy, and no other header", async () => {
    await signedOut(async () => {
      const ranged = (await handler({ params: { path: "linked/links/Ab3_x/files/5" }, method: "GET", node: {} } as RouteEvent)) as Response;

      expect(ranged.status).toBe(206);
      expect(ranged.headers.get("content-range")).toBe("bytes 0-4/40");
      expect(ranged.headers.get("accept-ranges")).toBe("bytes");
      expect(ranged.headers.get("access-control-allow-origin")).toBe("*");
      expect(ranged.headers.get("set-cookie")).toBeNull();

      const page = (await handler({ params: { path: "linked/links/Ab3_x/page" }, method: "GET", node: {} } as RouteEvent)) as Response;

      expect(page.headers.get("content-security-policy")).toBe("default-src 'none'");
      expect(ranged.headers.get("content-security-policy")).toBe("frame-ancestors 'self'");
      expect(page.headers.get("referrer-policy")).toBe("no-referrer");
      expect(page.headers.get("x-powered-by")).toBeNull();
    });
  });

  test("is none of a manifest that names none", async () => {
    await signedOut(async () => {
      expect(await call("plain/shares/Ab3_x")).toBe(401);
      expect(await call("plain/shares/Ab3_x/content")).toBe(401);
    });
  });
});

// A unit released between two reads of its manifest: its bundle's files carry their content in their names, and the
// new release no longer serves the old ones. The read of an old file the unit answers 404 has the console ask that
// unit for its manifest again before the 404 goes back, so the list read next names the new release without waiting
// for the next minute's reading (docs/web.md, 「Screens a unit brings」).
describe("a bundle's file its unit no longer serves", () => {
  let release = 1;
  const asked: string[] = [];
  const files = (at: number) => ({ module: `/console/module-${at}.js`, stylesheet: `/console/style-${at}.css` });
  const released = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const path = new URL(request.url).pathname;
      const { module, stylesheet } = files(release);

      asked.push(path);

      if (path === "/console-manifest") return Response.json(manifestFields("released", { bundle: module, stylesheet }));
      if (path === "/console/words") return Response.json({ ko: { released: { title: "released" } } });
      if (path === module || path === stylesheet) return new Response("export default { routes: [] };", { headers: { "content-type": "text/javascript" } });

      return Response.json({ code: "not-found" }, { status: 404 });
    }
  });
  const settings = { RELEASED_ADDRESS: `http://127.0.0.1:${released.port}` };
  const manifestAsks = () => asked.filter((path) => path === "/console-manifest").length;
  const read = (path: string) => handler({ params: { path: `released${path}` }, node: {} } as RouteEvent).then((response) => response.status);

  beforeAll(async () => {
    await readManifests(settings);
  });
  afterAll(async () => {
    await readManifests({});
    attachBundles([]);
    await released.stop(true);
  });

  test("has the unit's manifest read again at once, the module and stylesheet asked at once sharing one ask", async () => {
    expect(attachedService("released")?.manifest.bundle).toBe(files(1).module);

    release = 2;

    expect(await Promise.all([read(files(1).module), read(files(1).stylesheet)])).toEqual([404, 404]);
    expect(manifestAsks()).toBe(2);
    expect(attachedService("released")?.manifest.bundle).toBe(files(2).module);
    expect(await read(files(2).module)).toBe(200);
  });

  test("asks nothing again for a path of the service's API that is no file of its bundle", async () => {
    const before = manifestAsks();

    expect(await read("/items/7")).toBe(404);
    expect(manifestAsks()).toBe(before);
  });
});

// A bundle's screen translates through the translator the console names, and that translator may be a unit the
// console calls directly, which answers no manifest (docs/web.md, 「Screens a unit brings」).
describe("the translator's ask of a unit the console calls directly", () => {
  const ask = new TextEncoder().encode(JSON.stringify({ language: "ko", originals: ["Likes tea"] }));
  const translating = (page: string, path = "translations"): Promise<number | undefined> =>
    handler({
      ...asking(path),
      method: "POST",
      headers: { referer: `https://console.example.test/${page}`, "content-type": "application/json", "content-length": String(ask.length) },
      streamed: [ask]
    } as RouteEvent).then(
      (response) => response.status,
      (error: { statusCode?: number }) => error.statusCode
    );

  beforeAll(() => {
    globals.useRuntimeConfig = () => ({ app: { baseURL: "/" }, public: { bmoUi: { translator: { service: "relayed", path: "/translations" } } } });
    attachBundles([
      { manifest: manifestOf("reader", { apiPrefix: "/console", calls: ["relayed"] }), unit: { address: unit.address, token: null }, words: {} },
      { manifest: manifestOf("other", { apiPrefix: "/console" }), unit: { address: unit.address, token: null }, words: {} }
    ]);
  });
  afterAll(() => {
    globals.useRuntimeConfig = () => ({ app: { baseURL: "/" } });
    attachBundles([]);
  });

  test("reaches the unit from a bundle's page that names it under `calls`", async () => {
    unit.asked.length = 0;

    expect(await translating("reader")).toBe(200);
    expect(unit.asked).toEqual([{ method: "POST", path: "/translations", body: { language: "ko", originals: ["Likes tea"] } }]);
  });

  test("is refused from a bundle's page that does not name the unit, and from a page that is no bundle's", async () => {
    unit.asked.length = 0;

    expect(await translating("other")).toBe(403);
    expect(await translating("settings")).toBe(403);
    expect(unit.asked).toEqual([]);
  });

  test("lets no other change of the unit through, whatever page asks it", async () => {
    unit.asked.length = 0;

    expect(await translating("reader", "translations/kept")).toBe(404);
    expect(unit.asked).toEqual([]);
  });
});
