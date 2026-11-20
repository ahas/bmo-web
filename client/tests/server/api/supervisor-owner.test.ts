import { afterAll, describe, expect, test } from "bun:test";

import { asked, routeOf } from "../../support/nitro";
import { globalsRestoredAfter } from "../../support/globals";
import { standInAccountService } from "../../support/account-service";
import { standInHandler } from "../../support/route-handler";
import { answer, standIn } from "../../support/units";

import type { RouteEvent } from "../../support/nitro";

// A supervisor changed or removed (docs/web.md, 「Access」): a member whose supervisors section writes passes the route
// scope, and then changes or removes their own account's BMO alone — one the agency files under them, or their own
// `u<user>` standing under no owner — every other answering them as if it did not stand, nothing of it asked. The
// administrator changes and removes any.

const MEMBER = 7;

const service = standInAccountService({ users: [{ id: MEMBER, name: "member" }] });

process.env.WEB_SERVER_ADDRESS = service.address;
process.env.WEB_SERVER_TOKEN = service.token;

afterAll(() => {
  service.stop();
  delete process.env.WEB_SERVER_ADDRESS;
  delete process.env.WEB_SERVER_TOKEN;
});

// The member's own BMO stands under no owner, as one given before the receiver passed the account on does; another
// account's is filed under it.
const agency = standIn("AGENCY", (one) => {
  const path = one.path.split("?")[0] ?? "";

  if (path === "/supervisors") return answer({ items: [{ name: `u${MEMBER}`, ownerAccount: null }, { name: "u5", ownerAccount: 5 }, { name: "agent-a", ownerAccount: null }], more: false });

  return answer({ code: "failed", error: "Not served here." }, 500);
});
const receiver = standIn("RECEIVER", () => new Response(null, { status: 204 }));

const globals: Record<string, unknown> = globalThis;
let session: Record<string, unknown> = {};

globalsRestoredAfter(["carriesSession", "getCookie", "getUserSession", "requireUserSession", "signedInUser", "useRuntimeConfig"]);
globals.getCookie = () => "sealed";
globals.useRuntimeConfig = () => ({ session: { name: "nuxt-session" }, app: { baseURL: "/" } });
globals.getUserSession = async () => session;
globals.requireUserSession = async () => session;
globals.carriesSession = (await import("../../../apps/web/server/utils/session-cookie")).carriesSession;
globals.signedInUser = (await import("../../../apps/web/server/utils/accounts")).signedInUser;

const scope = standInHandler((await import("../../../apps/web/server/middleware/route-scope")).default);

// Each change of a supervisor, with the request that makes it.
const CHANGES: { name: string; method: string; path: (agent: string) => string; handler: (event: RouteEvent) => Promise<unknown>; body?: unknown }[] = [
  { name: "change", method: "PATCH", path: (agent) => `/api/supervisors/${agent}`, handler: await routeOf("../../apps/web/server/api/supervisors/[name].patch"), body: { label: "A label" } },
  { name: "remove", method: "DELETE", path: (agent) => `/api/supervisors/${agent}`, handler: await routeOf("../../apps/web/server/api/supervisors/[name].delete") },
  { name: "settings", method: "PATCH", path: (agent) => `/api/supervisors/${agent}/settings`, handler: await routeOf("../../apps/web/server/api/supervisors/[name]/settings.patch"), body: {} },
  { name: "instruction stages", method: "PATCH", path: (agent) => `/api/supervisors/${agent}/instruction-stages`, handler: await routeOf("../../apps/web/server/api/supervisors/[name]/instruction-stages.patch"), body: {} }
];

// What the route scope and then the route answer a request: the scope's refusal, or the route's own status.
async function answered(change: (typeof CHANGES)[number], agent: string): Promise<number> {
  try {
    await scope({ path: change.path(agent), method: change.method, context: {} });
  } catch (error) {
    return (error as { statusCode?: number }).statusCode ?? 500;
  }

  return (await asked(change.handler, { params: { name: agent }, body: change.body })).status;
}

// The calls a change made beyond asking whose supervisors are whose.
const made = () => [...agency.asked.filter((one) => one.path.split("?")[0] !== "/supervisors"), ...receiver.asked];

describe("a supervisor changed or removed by a member whose supervisors section writes", () => {
  service.sections.set(MEMBER, new Map([["supervisors", { read: true, write: true }]]));

  for (const change of CHANGES) {
    test(`is refused as absent where it is another account's or nobody's: ${change.name}`, async () => {
      session = { user: { name: "member", id: MEMBER }, sid: "bmo.sid=member", administrator: false };
      agency.asked.length = 0;
      receiver.asked.length = 0;

      for (const agent of ["u5", "agent-a", `u0${MEMBER}`]) {
        expect({ agent, status: await answered(change, agent) }).toEqual({ agent, status: 404 });
      }

      expect(made()).toEqual([]);
    });

    test(`passes where it is their own BMO, standing under no owner: ${change.name}`, async () => {
      session = { user: { name: "member", id: MEMBER }, sid: "bmo.sid=member", administrator: false };

      expect(await answered(change, `u${MEMBER}`)).not.toBe(404);
    });
  }
});

describe("a supervisor changed or removed by the administrator", () => {
  test("passes whoever's it is", async () => {
    session = { user: { name: "boss", id: 1 }, sid: "bmo.sid=boss", administrator: true };

    expect(await answered(CHANGES[1]!, "u5")).toBe(200);
  });
});
