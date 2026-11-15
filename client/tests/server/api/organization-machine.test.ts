import { afterAll, describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { standInAccountService } from "../../support/account-service";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { Rebound, UserNode } from "../../../packages/server-client/src/index";

// A person's machine on the organisation screen (docs/accounts.md, 「Invitations and a person's machine」): the
// administrator binds an account to another machine or to none, and agency's record of the account's node follows,
// set once the new machine is proven and taken away with the binding; a node agency refuses is said in the pack's
// words.

const service = standInAccountService({
  users: [
    { id: 1, name: "boss", administrator: true },
    { id: 2, name: "member-a", node: { agent: "u2", attached: true, provenAt: 1 } },
    { id: 3, name: "member-b", node: { agent: "u3", attached: true, provenAt: 1 } },
    { id: 4, name: "member-c" }
  ],
  hub: ["desk-a", "desk-b"]
});

process.env.WEB_SERVER_ADDRESS = service.address;
process.env.WEB_SERVER_TOKEN = service.token;

afterAll(() => {
  service.stop();
  delete process.env.WEB_SERVER_ADDRESS;
});

const agency = standIn("AGENCY", (call) => {
  if (call.method === "PUT" && call.body?.node === "desk-b") return answer({ code: "not-a-hub-node", error: "no hub node is named desk-b" }, 422);
  if (call.method === "PUT") return answer({ ownerAccount: call.path.split("/").pop(), node: call.body?.node, setAt: 1 });
  if (call.method === "DELETE" && call.path === "/person-nodes/4") return answer({ code: "not-found", error: "no record" }, 404);
  if (call.method === "DELETE") return new Response(null, { status: 204 });

  return answer({ code: "no-route", error: "no route" }, 404);
});

const rebind = await routeOf<Rebound>("../../apps/web/server/api/organization/users/[user]/node.put");
const unbind = await routeOf<void>("../../apps/web/server/api/organization/users/[user]/node.delete");
const prove = await routeOf<UserNode>("../../apps/web/server/api/organization/users/[user]/node/proof.post");

const setCalls = () => agency.asked.filter((call) => call.method === "PUT").map((call) => [call.path, call.body]);

describe("a person's machine", () => {
  test("bound to a fresh machine is set in agency only once it attaches", async () => {
    agency.asked.length = 0;

    const rebound = await asked(rebind, { params: { user: "2" }, body: {} });

    expect(rebound.answer).toMatchObject({ agent: "u2-fresh", attached: false, install: { linux: "install u2-fresh" } });
    expect((await asked(prove, { params: { user: "2" } })).answer).toMatchObject({ agent: "u2-fresh", attached: false });
    expect(setCalls()).toEqual([]);

    service.hub.add("u2-fresh");

    expect((await asked(prove, { params: { user: "2" } })).answer).toMatchObject({ agent: "u2-fresh", attached: true });
    expect(setCalls()).toEqual([["/person-nodes/2", { node: "u2-fresh" }]]);
  });

  test("bound to a machine the hub holds already is set in agency at once", async () => {
    agency.asked.length = 0;

    expect((await asked(rebind, { params: { user: "3" }, body: { agent: "desk-a" } })).answer).toMatchObject({ agent: "desk-a", attached: true });
    expect(setCalls()).toEqual([["/person-nodes/3", { node: "desk-a" }]]);
  });

  test("bound as a shared machine is set in agency as shared", async () => {
    agency.asked.length = 0;
    service.hub.add("desk-shared");

    expect((await asked(rebind, { params: { user: "2" }, body: { agent: "desk-shared", shared: true } })).answer).toMatchObject({ agent: "desk-shared", shared: true, attached: true });
    expect(setCalls()).toEqual([["/person-nodes/2", { node: "desk-shared", shared: true }]]);
  });

  test("a node agency refuses, and a machine another account holds, are said in the pack's words", async () => {
    const refused = await asked(rebind, { params: { user: "4" }, body: { agent: "desk-b" } });

    expect(refused.status).toBe(502);
    expect(refused.message).toBe(wording("organization.error.not_a_hub_node"));

    const taken = await asked(rebind, { params: { user: "4" }, body: { agent: "desk-a" } });

    expect(taken.status).toBe(409);
    expect(taken.message).toBe(wording("organization.error.node_taken"));
  });

  test("taken away is taken out of agency too, an account agency holds no record of passing", async () => {
    agency.asked.length = 0;

    expect((await asked(unbind, { params: { user: "3" } })).status).toBe(200);
    expect((await asked(unbind, { params: { user: "4" } })).status).toBe(200);
    expect(agency.asked.filter((call) => call.method === "DELETE").map((call) => call.path)).toEqual(["/person-nodes/3", "/person-nodes/4"]);
    expect(service.users.find((user) => user.id === 3)?.node).toBeUndefined();
  });
});
