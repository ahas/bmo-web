import { afterAll, describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { standInAccountService } from "../../support/account-service";
import { globalsRestoredAfter } from "../../support/globals";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

// The reader's own machine taken away from the settings (docs/accounts.md, 「Invitations and a person's machine」;
// docs/web.md, 「Settings」, the machine section): a member who is not the administrator takes their own away, agency's
// record with it, and a machine the hub holds that nobody shares is sent a leave through the node standing for it in
// the node service's list, found by its agent; a refused leave, or no node standing for it, leaves the machine taken
// away all the same. The route names no user, so it reaches the reader's own alone.

const globals: Record<string, unknown> = globalThis;

globalsRestoredAfter(["signedInUser"]);

const service = standInAccountService({
  users: [
    { id: 1, name: "boss", administrator: true },
    { id: 2, name: "member-a", node: { agent: "Desk_A", attached: true, kind: "desktop", provenAt: 1 } },
    { id: 3, name: "member-b", node: { agent: "u3", attached: false, provenAt: 1 } },
    { id: 4, name: "member-c", node: { agent: "desk-shared", shared: true, attached: true, provenAt: 1 } },
    { id: 5, name: "member-d", node: { agent: "u5", attached: true, kind: "installed", provenAt: 1 } },
    { id: 6, name: "member-e" },
    { id: 7, name: "member-f", node: { agent: "u7", attached: true, kind: "desktop", provenAt: 1 } }
  ]
});

process.env.WEB_SERVER_ADDRESS = service.address;
process.env.WEB_SERVER_TOKEN = service.token;

afterAll(() => {
  service.stop();
  delete process.env.WEB_SERVER_ADDRESS;
});

const agency = standIn("AGENCY", () => new Response(null, { status: 204 }));
// The node service's list names a node apart from its agent where the agent's name is not one a node name may be; no
// node stands for u7 yet.
const LISTED = [
  { name: "this-machine", label: "this-machine", kind: "ssh", thisMachine: true },
  { name: "-esk--", label: "Desk_A", kind: "hub", agentName: "Desk_A" },
  { name: "u5", label: "u5", kind: "hub", agentName: "u5" }
];
const nodes = standIn("NODE", (call) => {
  if (call.method === "GET") return answer({ items: LISTED, more: false });
  if (call.path.startsWith("/nodes/u5")) return answer({ code: "conflict", error: "the hub did not take the leave" }, 409);

  return new Response(null, { status: 204 });
});
const removals = () => nodes.asked.filter((call) => call.method === "DELETE").map((call) => call.path);

const unlink = await routeOf<void>("../../apps/web/server/api/me/machine/index.delete");

// The route as the member of `id` asks it, signed in as no administrator.
async function unlinkedBy(id: number): ReturnType<typeof asked<void>> {
  globals.signedInUser = async () => ({ id, name: `member-${id}`, administrator: false });

  return await asked(unlink, {});
}

const machineOf = (id: number) => service.users.find((user) => user.id === id)?.node;

describe("the reader's own machine taken away", () => {
  test("goes, agency's record with it, and the machine the hub holds is sent a leave", async () => {
    expect(await unlinkedBy(2)).toMatchObject({ status: 200 });
    expect(machineOf(2)).toBeUndefined();
    expect(agency.asked.filter((call) => call.method === "DELETE").map((call) => call.path)).toContain("/person-nodes/2");
    expect(removals()).toEqual(["/nodes/-esk--?leave=true"]);
  });

  test("sends no leave to a machine the hub does not hold, nor to a shared one", async () => {
    nodes.asked.length = 0;

    expect(await unlinkedBy(3)).toMatchObject({ status: 200 });
    expect(await unlinkedBy(4)).toMatchObject({ status: 200 });
    expect([machineOf(3), machineOf(4)]).toEqual([undefined, undefined]);
    expect(removals()).toEqual([]);
  });

  test("stands taken away where the leave is refused, or no node stands for the machine", async () => {
    nodes.asked.length = 0;

    expect(await unlinkedBy(5)).toMatchObject({ status: 200 });
    expect(await unlinkedBy(7)).toMatchObject({ status: 200 });
    expect([machineOf(5), machineOf(7)]).toEqual([undefined, undefined]);
    expect(removals()).toEqual(["/nodes/u5?leave=true"]);
  });

  test("says so where the reader has no machine", async () => {
    const refused = await unlinkedBy(6);

    expect(refused.status).toBe(404);
    expect(refused.message).toBe(wording("machines.error.none_bound"));
  });
});
