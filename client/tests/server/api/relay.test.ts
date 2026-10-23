import { afterAll, describe, expect, test } from "bun:test";

import { routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { RouteEvent } from "../../support/nitro";

// The relay hands a service's own path on as the bundle wrote it: a segment carrying an escaped slash stays one
// segment, still escaped, and a space or a letter outside ASCII reaches the service escaped once, never twice.

const globals = globalThis as unknown as Record<string, unknown>;

globals.useAppConfig = () => ({ consoleBundles: [{ serviceName: "relayed" }, { serviceName: "keyed" }] });

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

// The owner a unit acts for: the console's to say, from the person signed in, whatever the browser sent.
describe("the relay's owner key", () => {
  const heard: (string | null)[] = [];
  const keyed = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      heard.push(request.headers.get("owner-key"));

      return Response.json({ ok: true });
    }
  });

  process.env.KEYED_ADDRESS = `http://127.0.0.1:${keyed.port}`;
  afterAll(() => {
    void keyed.stop(true);
    delete process.env.KEYED_ADDRESS;
  });

  test("is the signed-in login's user id, in place of the one the browser sent", async () => {
    const response = await handler({ params: { path: "keyed/accounts" }, headers: { "owner-key": "browser-chosen" }, node: {} } as RouteEvent);

    expect(response.status).toBe(200);
    expect(heard.at(-1)).toBe("1");
  });

  test("is absent from a share read made with no session", async () => {
    session = {};

    try {
      await handler({ params: { path: "keyed/shares/token-a" }, headers: { "owner-key": "browser-chosen" }, node: {} } as RouteEvent);
    } finally {
      session = { user: { id: 1, name: "tester" } };
    }

    expect(heard.at(-1)).toBeNull();
  });
});
