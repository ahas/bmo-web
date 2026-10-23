import { describe, expect, test } from "bun:test";

import { routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { RouteEvent } from "../../support/nitro";

// The relay hands a service's own path on as the bundle wrote it: a segment carrying an escaped slash stays one
// segment, still escaped, and a space or a letter outside ASCII reaches the service escaped once, never twice.

const globals = globalThis as unknown as Record<string, unknown>;

globals.useAppConfig = () => ({ consoleBundles: [{ serviceName: "relayed" }] });
globals.getUserSession = async () => ({ user: { id: 1, name: "tester" } });

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
