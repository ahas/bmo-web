import { afterAll, describe, expect, test } from "bun:test";

import { consoleManifest } from "bmo-ui/shared/console-manifest";

import { attachBundles } from "../../../apps/web/server/utils/console-manifests";
import { routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { RouteEvent } from "../../support/nitro";

// The relay hands a service's own path on as the bundle wrote it: a segment carrying an escaped slash stays one
// segment, still escaped, and a space or a letter outside ASCII reaches the service escaped once, never twice.

const globals = globalThis as unknown as Record<string, unknown>;

// Who is signed in, which a test may take away: the support's signed-in administrator, user 1, by default.
let session: { user?: { id: number; name: string } } = { user: { id: 1, name: "tester" } };

globals.getUserSession = async () => session;

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

  test("escapes once what the request left bare", async () => {
    await handler(asking("places/volume:x/entries"));

    expect(unit.asked.at(-1)?.path).toBe("/places/volume%3Ax/entries");
  });

  test("hands on a segment whose escapes do not read as text as it came", async () => {
    await handler(asking("places/100%/entries"));

    expect(unit.asked.at(-1)?.path).toBe("/places/100%/entries");
  });
});

// The owner a unit acts for and the role they act in: the console's to say, from the person signed in, whatever the
// browser sent.
describe("the relay's owner key and role", () => {
  const heard: (string | null)[] = [];
  const roles: (string | null)[] = [];
  const globals = globalThis as unknown as Record<string, unknown>;
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

  test("is absent from a share read made with no session", async () => {
    session = {};

    try {
      await handler({ params: { path: "keyed/shares/token-a" }, headers: { "owner-key": "browser-chosen" }, node: {} } as RouteEvent);
    } finally {
      session = { user: { id: 1, name: "tester" } };
    }

    expect(heard.at(-1)).toBeNull();
    expect(roles.at(-1)).toBeNull();
  });
});

// A service a manifest names: relayed at the unit that answered it, only under its API prefix and for its module and
// stylesheet, the two of which a share page reads with no session, and to a reader the manifest's role allows.
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
    manifest: consoleManifest({ name, title: `${name}.title`, icon: "i-material-symbols-circle", screenPath: `/${name}`, serviceName: name, bundle: "/console/bundle.js", stylesheet: "/console/bundle.css", words: "/console/words", apiPrefix: "/screen", role }),
    unit: { address: `http://127.0.0.1:${served.port}`, token: null },
    words: {}
  });

  attachBundles([named("screened", "member"), named("guarded", "administrator")]);
  afterAll(() => {
    attachBundles([]);
    void served.stop(true);
  });

  const call = (path: string) => handler({ params: { path }, node: {} } as RouteEvent).then((response) => response.status, (error: { statusCode?: number }) => error.statusCode);

  test("hands on a path under the API prefix to the unit that answered the manifest", async () => {
    expect(await call("screened/screen/items")).toBe(200);
    expect(heard.at(-1)).toBe("/screen/items");
  });

  test("hands on the module and the stylesheet outside the prefix, and nothing else", async () => {
    expect(await call("screened/console/bundle.js")).toBe(200);
    expect(await call("screened/console/bundle.css")).toBe(200);
    expect(await call("screened/console/words")).toBe(404);
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
