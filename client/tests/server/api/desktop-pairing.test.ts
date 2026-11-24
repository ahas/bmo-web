import { afterAll, beforeEach, describe, expect, test } from "bun:test";

import { ownerKeyOf } from "../../../apps/web/server/utils/owner-key";
import { wording } from "../../../apps/web/shared/wording";
import { globalsRestoredAfter } from "../../support/globals";
import { standInAccountService } from "../../support/account-service";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { RouteEvent } from "../../support/nitro";
import type { PairingApproved, PairingCredential, PairingView, UserNode } from "../../../packages/server-client/src/index";

// The desktop app's pairing as the console hands it on (docs/web.md, 「Access」 and 「The desktop pairing page」): the
// app's two calls with no sign-in, the proxy's address handed on and the page's address answered under the console's
// public address; the read handed on as the service answers it, its credential under no-store; the code read,
// approved and refused for the signed-in reader alone; and the reader's machine proven and set in agency once it
// attaches. What the service decides of a pairing is its own tests'.

const service = standInAccountService({
  users: [
    { id: 2, name: "member-a", node: { agent: "u2", attached: false } },
    { id: 3, name: "member-b" },
    { id: 4, name: "member-c", node: { agent: "u4", attached: true, kind: "desktop", boundAt: 1_700_000_000_000 } },
    { id: 5, name: "member-d" }
  ]
});

process.env.WEB_SERVER_ADDRESS = service.address;
process.env.WEB_SERVER_TOKEN = service.token;

afterAll(() => {
  service.stop();
  delete process.env.WEB_SERVER_ADDRESS;
});

// Agency's records of the accounts' nodes, as its list answers them.
let records: { ownerAccount: string; node: string; shared: boolean; setAt: number }[] = [];

const agency = standIn("AGENCY", (call) => {
  if (call.method === "GET" && call.path === "/person-nodes") return answer({ items: records, more: false });

  return answer({ ownerAccount: call.path.split("/").pop(), node: call.body?.node, setAt: 1 });
});

globalsRestoredAfter(["browserAddress", "ownerKeyOf", "signedInUser", "setResponseStatus", "setResponseHeader", "useRuntimeConfig", "getRequestURL"]);

// What the routes set on their answer, and the console's settings they read, as each test sets them.
let status = 200;
let headers: Record<string, string> = {};
let consoleAddress = "";
let reader = 2;

const globals = globalThis as Record<string, unknown>;

// The address the proxy names, as the console's own helper reads it off `X-Real-IP`.
globals.browserAddress = (event: RouteEvent) => event.headers?.["x-real-ip"] ?? "127.0.0.1";
globals.ownerKeyOf = ownerKeyOf;
globals.signedInUser = async () => ({ id: reader, name: `member-${reader}`, administrator: false });
globals.setResponseStatus = (_event: unknown, code: number) => {
  status = code;
};
globals.setResponseHeader = (_event: unknown, name: string, value: string) => {
  headers[name] = value;
};
globals.useRuntimeConfig = () => ({ public: { consoleAddress }, app: { baseURL: "/console/" } });
globals.getRequestURL = () => new URL("https://reached.invalid/console/api/desktop/pairings");

const ask = await routeOf<{ pairing: string; code: string; approveUrl: string; pollAfterSeconds: number }>("../../apps/web/server/api/desktop/pairings/index.post");
const read = await routeOf<PairingCredential | null>("../../apps/web/server/api/desktop/pairings/[pairing].get");
const view = await routeOf<PairingView>("../../apps/web/server/api/desktop/pair/[code].get");
const approve = await routeOf<PairingApproved>("../../apps/web/server/api/desktop/pair/[code]/approve.post");
const refuse = await routeOf<null>("../../apps/web/server/api/desktop/pair/[code]/refuse.post");
const prove = await routeOf<UserNode>("../../apps/web/server/api/me/machine/proof.post");
const ownMachine = await routeOf<UserNode>("../../apps/web/server/api/me/machine/index.get");

beforeEach(() => {
  status = 200;
  headers = {};
  consoleAddress = "";
  reader = 2;
});

async function paired(address = "192.0.2.1", event: RouteEvent = {}): Promise<{ pairing: string; code: string; approveUrl: string }> {
  const made = await asked(ask, { ...event, headers: { "x-real-ip": address } });

  expect(made.status).toBe(200);
  expect(status).toBe(201);

  return made.answer!;
}

describe("the desktop app's pairing", () => {
  test("is asked for the proxy's address and answers the page's address under the console's own", async () => {
    consoleAddress = "https://console.invalid/console";
    const made = await paired("192.0.2.7");

    expect(service.pairingAddresses.at(-1)).toBe("192.0.2.7");
    expect(made.approveUrl).toBe(`https://console.invalid/console/desktop/pair?code=${made.code}&in=app`);
    expect(made).toMatchObject({ pollAfterSeconds: 3 });

    consoleAddress = "";
    const reached = await paired("192.0.2.7");

    expect(reached.approveUrl).toBe(`https://reached.invalid/console/desktop/pair?code=${reached.code}&in=app`);
  });

  test("an address past its share is refused in the pack's words", async () => {
    for (let at = service.pairingAddresses.filter((one) => one === "198.51.100.7").length; at < 10; at += 1) await paired("198.51.100.7");

    const refused = await asked(ask, { headers: { "x-real-ip": "198.51.100.7" } });

    expect(refused.status).toBe(429);
    expect(refused.message).toBe(wording("pairing.error.too_many"));
  });

  test("is read as waiting, then once with its credential under no-store, then not at all", async () => {
    const { pairing, code } = await paired();

    expect(await asked(read, { params: { pairing } })).toMatchObject({ status: 200, answer: null });
    expect(status).toBe(202);
    expect(headers["cache-control"]).toBe("no-store");

    expect((await asked(view, { params: { code } })).answer).toMatchObject({ state: "waiting", machine: "u2" });
    expect((await asked(approve, { params: { code } })).answer).toEqual({ machine: "u2" });

    status = 200;
    headers = {};
    const credential = await asked(read, { params: { pairing } });

    expect(credential.answer).toEqual({ node: "u2", credential: "u2.credential", hubUrl: "wss://hub.invalid" });
    expect(status).toBe(200);
    expect(headers["cache-control"]).toBe("no-store");

    const again = await asked(read, { params: { pairing } });

    expect(again.status).toBe(404);
    expect(again.message).toBe(wording("pairing.error.not_found"));
  });

  test("is approved and refused for the signed-in reader alone, a refused one closed", async () => {
    const { pairing, code } = await paired();

    reader = 3;
    expect((await asked(view, { params: { code } })).answer).toEqual({ code, expiresAt: 600_000, state: "waiting" });
    expect((await asked(refuse, { params: { code } })).status).toBe(200);
    expect(status).toBe(204);

    const closed = await asked(approve, { params: { code } });

    expect(closed.status).toBe(410);
    expect(closed.message).toBe(wording("pairing.error.closed"));
    expect((await asked(read, { params: { pairing } })).status).toBe(410);

    // A reader bound to no machine is given one as they approve.
    const fresh = await paired();

    expect((await asked(approve, { params: { code: fresh.code } })).answer).toEqual({ machine: "u3-fresh" });
  });

  test("proves the reader's own machine and sets it in agency once it attaches", async () => {
    agency.asked.length = 0;

    expect((await asked(prove, {})).answer).toMatchObject({ agent: "u2", attached: false });
    expect(agency.asked).toEqual([]);

    service.hub.add("u2");

    expect((await asked(prove, {})).answer).toMatchObject({ agent: "u2", attached: true });
    expect(agency.asked.map((call) => [call.method, call.path, call.body])).toEqual([["PUT", "/person-nodes/2", { node: "u2" }]]);
  });

  test("reads the reader's own machine as the service answers it, and records no proof", async () => {
    agency.asked.length = 0;
    reader = 4;
    records = [{ ownerAccount: "4", node: "u4", shared: false, setAt: 1 }];

    expect((await asked(ownMachine, {})).answer).toMatchObject({ agent: "u4", attached: true, kind: "desktop", boundAt: 1_700_000_000_000, nodeSettled: true });
    expect(service.users.find((user) => user.id === 4)?.node?.provenAt).toBeUndefined();
    // Agency's record is read, and nothing is written where it names the machine.
    expect(agency.asked.map((call) => [call.method, call.path])).toEqual([["GET", "/person-nodes"]]);

    // Where agency's record does not name it yet, the read says so and asks for it to be set.
    agency.asked.length = 0;
    records = [];
    expect((await asked(ownMachine, {})).answer).toMatchObject({ agent: "u4", nodeSettled: false });
    for (let waited = 0; !agency.asked.some((call) => call.method === "PUT") && waited < 1_000; waited += 5) await new Promise((resolve) => setTimeout(resolve, 5));
    expect(agency.asked.filter((call) => call.method === "PUT").map((call) => [call.path, call.body])).toEqual([["/person-nodes/4", { node: "u4" }]]);

    // A reader connected to no machine reads none.
    reader = 5;
    expect((await asked(ownMachine, {})).answer?.agent ?? null).toBeNull();
  });
});
