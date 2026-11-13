import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { createError } from "h3";

import { globalsRestoredAfter } from "../../support/globals";

import { attachBundles } from "../../../apps/web/server/utils/console-manifests";
import { manifestOf } from "../../support/console-manifest";
import { routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { RouteEvent } from "../../support/nitro";

// The members of the reader's company, the service the console answers itself under the name `people`
// (docs/web.md, 「Screens a unit brings」): read for the reader signed in, refused with no session, and reached from
// a bundle's page only where its manifest names `people` under `calls`.

const globals: Record<string, unknown> = globalThis;

// Who is signed in, which a test may take away: a member with an account by default.
let signed: { id: number | null; name: string; administrator: boolean } | null = { id: 7, name: "tester", administrator: false };

globalsRestoredAfter(["signedInUser", "useRuntimeConfig"]);
globals.signedInUser = async () => {
  if (signed === null) throw createError({ statusCode: 401, statusMessage: "Unauthorized" });

  return signed;
};
globals.useRuntimeConfig = () => ({ app: { baseURL: "/web/" } });

const server = standIn("WEB_SERVER", () => answer({ members: [{ user: "7", name: "member-a" }, { user: "8", name: "member-b" }] }), { headers: true });
const handler = await routeOf<{ members: { user: string; name: string }[] }>("../../apps/web/server/api/people/members.get");

const named = (name: string, calls: string[] = []) => ({
  manifest: manifestOf(name, { bundle: "/console/bundle/module-a.js", apiPrefix: "/console", calls }),
  unit: { address: "http://127.0.0.1:1", token: null },
  words: {}
});

beforeAll(() => attachBundles([named("sharer", ["people"]), named("stranger")]));
afterAll(() => attachBundles([]));

const asked = (referer?: string) => handler({ headers: referer === undefined ? {} : { referer }, node: {} } as RouteEvent);
const refusal = (referer?: string) =>
  asked(referer).then(
    () => null,
    (error: { statusCode?: number }) => error.statusCode
  );

describe("the members of the reader's company", () => {
  test("are answered to a reader signed in, each by key and name, asked as that reader", async () => {
    const said = await asked();

    expect(said).toEqual({ members: [{ user: "7", name: "member-a" }, { user: "8", name: "member-b" }] });
    expect(server.asked.at(-1)?.path).toBe("/users/members");
    expect(server.asked.at(-1)?.headers?.["owner-key"]).toBe("7");
    expect(server.asked.at(-1)?.headers?.["owner-role"]).toBe("member");
  });

  test("are refused to a request with no session, and the account service is not asked", async () => {
    const before = server.asked.length;

    signed = null;
    try {
      expect(await refusal()).toBe(401);
    } finally {
      signed = { id: 7, name: "tester", administrator: false };
    }

    expect(server.asked.length).toBe(before);
  });

  test("reach a bundle's page whose manifest names `people` under `calls`", async () => {
    expect((await asked("https://console.example.test/web/sharer/files?tab=2")).members).toHaveLength(2);
  });

  test("are refused to a bundle's page whose manifest does not name `people`, and the account service is not asked", async () => {
    const before = server.asked.length;

    expect(await refusal("https://console.example.test/web/stranger/one")).toBe(403);
    expect(server.asked.length).toBe(before);
  });

  test("are nobody for a login with no account", async () => {
    const before = server.asked.length;

    signed = { id: null, name: "console", administrator: true };
    try {
      expect(await asked()).toEqual({ members: [] });
    } finally {
      signed = { id: 7, name: "tester", administrator: false };
    }

    expect(server.asked.length).toBe(before);
  });
});
