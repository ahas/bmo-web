import { afterAll, describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { standInAccountService } from "../../support/account-service";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { Rebound, UserNode } from "../../../packages/server-client/src/index";

// A person's machine on the organisation screen (docs/accounts.md, 「Invitations and a person's machine」): the
// administrator binds an account to another machine or to none, and agency's record of the account's node follows,
// set once the new machine is proven and taken away with the binding; a node agency refuses is said in the pack's
// words and leaves the account bound as it was; the machine already bound is declared shared where it stands.

const service = standInAccountService({
  users: [
    { id: 1, name: "boss", administrator: true },
    { id: 2, name: "member-a", node: { agent: "u2", attached: true, provenAt: 1 } },
    { id: 3, name: "member-b", node: { agent: "u3", attached: true, provenAt: 1 } },
    { id: 4, name: "member-c" },
    { id: 5, name: "member-d", node: { agent: "u5", attached: true, provenAt: 1 } },
    { id: 6, name: "member-e" },
    { id: 7, name: "member-f", node: { agent: "desk-e", attached: true, provenAt: 1 } }
  ],
  hub: ["desk-a", "desk-b", "desk-c", "u5"]
});

process.env.WEB_SERVER_ADDRESS = service.address;
process.env.WEB_SERVER_TOKEN = service.token;

afterAll(() => {
  service.stop();
  delete process.env.WEB_SERVER_ADDRESS;
});

const agency = standIn("AGENCY", (call) => {
  if (call.method === "PUT" && call.body?.node === "desk-b") return answer({ code: "not-a-hub-node", error: "no hub node is named desk-b" }, 422);
  // Agency holds another account's record on desk-c, and on desk-e beside account 7's, neither shared.
  if (call.method === "PUT" && (call.body?.node === "desk-c" || call.body?.node === "desk-e")) return answer({ code: "node-taken", error: "another account's node" }, 409);
  if (call.method === "DELETE" && call.path === "/person-nodes/7") return answer({ code: "upstream-failed", error: "the node service did not answer" }, 502);
  if (call.method === "PUT") return answer({ ownerAccount: call.path.split("/").pop(), node: call.body?.node, setAt: 1 });
  if (call.method === "DELETE" && call.path === "/person-nodes/4") return answer({ code: "not-found", error: "no record" }, 404);
  if (call.method === "DELETE") return new Response(null, { status: 204 });

  return answer({ code: "no-route", error: "no route" }, 404);
});

const rebind = await routeOf<Rebound>("../../apps/web/server/api/organization/users/[user]/node.put");
const unbind = await routeOf<void>("../../apps/web/server/api/organization/users/[user]/node.delete");
const prove = await routeOf<UserNode>("../../apps/web/server/api/organization/users/[user]/node/proof.post");

const share = await routeOf<UserNode>("../../apps/web/server/api/organization/users/[user]/node/shared.put");

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
    // Bound to a machine that has not attached, the account has no record in agency yet.
    expect((await asked(rebind, { params: { user: "4" }, body: {} })).answer).toMatchObject({ attached: false });
    agency.asked.length = 0;

    expect((await asked(unbind, { params: { user: "3" } })).status).toBe(200);
    expect((await asked(unbind, { params: { user: "4" } })).status).toBe(200);
    expect(agency.asked.filter((call) => call.method === "DELETE").map((call) => call.path)).toEqual(["/person-nodes/3", "/person-nodes/4"]);
    expect(service.users.find((user) => user.id === 3)?.node).toBeUndefined();
  });

  test("a machine agency refuses leaves the account bound as it was, or bound to none", async () => {
    for (const user of ["5", "6"]) {
      expect((await asked(rebind, { params: { user }, body: { agent: "desk-c" } })).message).toBe(wording("organization.error.agency_node_taken"));
    }

    expect(service.users.find((user) => user.id === 5)?.node).toMatchObject({ agent: "u5", shared: false });
    expect(service.users.find((user) => user.id === 6)?.node).toBeUndefined();
  });

  test("the machine already bound, declared shared where it stands, takes a second account in both units", async () => {
    agency.asked.length = 0;

    expect((await asked(share, { params: { user: "5" }, body: { shared: true } })).answer).toMatchObject({ agent: "u5", shared: true });
    expect((await asked(rebind, { params: { user: "6" }, body: { agent: "u5", shared: true } })).answer).toMatchObject({ agent: "u5", shared: true });
    expect(setCalls()).toEqual([
      ["/person-nodes/5", { node: "u5", shared: true }],
      ["/person-nodes/6", { node: "u5", shared: true }]
    ]);
    expect((await asked(share, { params: { user: "5" }, body: { shared: false } })).message).toBe(wording("organization.error.shared_in_use"));
  });

  test("a declaration or a removal agency refuses leaves the binding as it was", async () => {
    expect((await asked(share, { params: { user: "7" }, body: { shared: true } })).message).toBe(wording("organization.error.agency_node_taken"));
    expect((await asked(unbind, { params: { user: "7" } })).status).toBe(502);
    expect(service.users.find((user) => user.id === 7)?.node).toMatchObject({ agent: "desk-e", shared: false });
  });
});
