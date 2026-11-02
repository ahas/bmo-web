import { describe, expect, test } from "bun:test";

import { CONTROL_UNREACHABLE } from "../../../apps/web/shared/config";
import { wording } from "../../../apps/web/shared/wording";
import { carries, reasonOf, unitAt, unitFetch } from "../../../apps/web/server/utils/units";
import { fail } from "../../../apps/web/server/utils/fail";

// What Nitro would import into the module by itself.
const globals = globalThis as Record<string, unknown>;

globals.createError = (options: { statusCode: number; message: string }) => Object.assign(new Error(options.message), options);
globals.fail = fail;

// What a refused call reads as on the screen. Most of a unit's refusals are notes to whoever wrote the
// caller; a few are written for a person to read, and those have to arrive whole.

function refusal(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("where a unit is reached", () => {
  test("a unit is its address without a trailing slash and its token, by its name", () => {
    expect(unitAt("AGENCY", { AGENCY_ADDRESS: "http://127.0.0.1:1/ ", AGENCY_TOKEN: "a token" })).toEqual({
      address: "http://127.0.0.1:1",
      token: "a token"
    });
    expect(unitAt("CACHE_SIREN", { CACHE_SIREN_ADDRESS: "http://127.0.0.1:2" })).toEqual({ address: "http://127.0.0.1:2", token: null });
  });

  test("a unit whose address is not set is none", () => {
    expect(unitAt("AGENCY", { AGENCY_TOKEN: "a token" })).toBeNull();
    expect(unitAt("AGENCY", { AGENCY_ADDRESS: " " })).toBeNull();
  });
});

describe("what the screen is told when a unit refused", () => {
  test("a refusal written for a person reaches them in the unit's own words", async () => {
    expect(await reasonOf(refusal(400, { error: "That directory is not a git repository.", code: "not-a-checkout" }), true)).toBe(
      "That directory is not a git repository."
    );
  });

  test("every other refusal reads as this app's own sentence, since the unit's is not for a person", async () => {
    expect(await reasonOf(refusal(400, { error: "model (string) is required" }), false)).toBe(
      wording("control.error.status", { status: 400 })
    );
    expect(await reasonOf(refusal(409, { error: "a job is already running" }), false)).toBe(
      wording("control.error.status", { status: 409 })
    );
  });

  test("a call may pass on the unit's words for the refusals it names and no others", () => {
    expect(carries({ carryReason: [409] }, 409)).toBe(true);
    expect(carries({ carryReason: [409] }, 404)).toBe(false);
    expect(carries({ carryReason: true }, 404)).toBe(true);
    expect(carries({}, 409)).toBe(false);
  });

  test("a body with nothing in it falls back rather than showing an empty line", async () => {
    expect(await reasonOf(refusal(400, {}), true)).toBe(wording("control.error.status", { status: 400 }));
    expect(await reasonOf(refusal(400, { error: "" }), true)).toBe(wording("control.error.status", { status: 400 }));
    expect(await reasonOf(new Response("not json", { status: 500 }), true)).toBe(wording("control.error.status", { status: 500 }));
  });
});

describe("a unit that did not answer", () => {
  // Whatever answers at the unit's address for one call, the setting put back as it was afterwards.
  async function against<T>(address: string | null, call: () => Promise<T>): Promise<T> {
    const before = process.env.TEST_UNIT_ADDRESS;

    if (address === null) delete process.env.TEST_UNIT_ADDRESS;
    else process.env.TEST_UNIT_ADDRESS = address;

    try {
      return await call();
    } finally {
      if (before === undefined) delete process.env.TEST_UNIT_ADDRESS;
      else process.env.TEST_UNIT_ADDRESS = before;
    }
  }

  async function failure(call: () => Promise<unknown>): Promise<Error & { statusCode?: number }> {
    try {
      await call();
    } catch (error) {
      return error as Error & { statusCode?: number };
    }

    throw new Error("the call answered");
  }

  test("a port that took the call is waited on until it answers or its connection ends", async () => {
    // A listener that accepts and says nothing: a unit too busy to answer yet.
    const held = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
    const before = process.env.TEST_UNIT_ADDRESS;

    process.env.TEST_UNIT_ADDRESS = `http://127.0.0.1:${held.port}`;

    try {
      const asked = unitFetch("TEST_UNIT", "/health").then(
        () => "answered",
        (error: unknown) => error as Error & { statusCode?: number }
      );
      const early = await Promise.race([asked, Bun.sleep(300).then(() => "still asking")]);

      expect(early).toBe("still asking");

      held.stop(true);

      const error = (await asked) as Error & { statusCode?: number };

      expect(error.statusCode).toBe(503);
      expect(error.message).toBe(wording(CONTROL_UNREACHABLE));
    } finally {
      held.stop(true);

      if (before === undefined) delete process.env.TEST_UNIT_ADDRESS;
      else process.env.TEST_UNIT_ADDRESS = before;
    }
  });

  test("a port nothing listens on is the unit gone", async () => {
    const gone = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
    const port = gone.port;

    gone.stop(true);

    const error = await failure(() => against(`http://127.0.0.1:${port}`, () => unitFetch("TEST_UNIT", "/health")));

    expect(error.statusCode).toBe(503);
    expect(error.message).toBe(wording(CONTROL_UNREACHABLE));
  });

  test("a unit whose address is not set is gone, and nothing is asked", async () => {
    const error = await failure(() => against(null, () => unitFetch("TEST_UNIT", "/health")));

    expect(error.statusCode).toBe(503);
    expect(error.message).toBe(wording(CONTROL_UNREACHABLE));
  });

  test("a unit is asked with its own token as the bearer", async () => {
    let heard = null as string | null;
    const unit = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: (request) => {
        heard = request.headers.get("authorization");

        return Response.json({ ok: true });
      }
    });
    const before = process.env.TEST_UNIT_TOKEN;

    process.env.TEST_UNIT_TOKEN = "the unit's token";

    try {
      expect(await against(`http://127.0.0.1:${unit.port}`, () => unitFetch<{ ok: boolean }>("TEST_UNIT", "/health"))).toEqual({ ok: true });
      expect(heard).toBe("Bearer the unit's token");
    } finally {
      if (before === undefined) delete process.env.TEST_UNIT_TOKEN;
      else process.env.TEST_UNIT_TOKEN = before;
      await unit.stop(true);
    }
  });
});
