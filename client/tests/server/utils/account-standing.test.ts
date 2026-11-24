import { afterAll, describe, expect, spyOn, test } from "bun:test";

import { standInAccountService } from "../../support/account-service";
import { globalsRestoredAfter } from "../../support/globals";
import { answer, standIn } from "../../support/units";

import { userOf } from "../../../apps/web/server/utils/account-service";
import { followPersonName, ownTitles, standAccount } from "../../../apps/web/server/utils/account-standing";
import { standRecordIdentities } from "../../../apps/web/server/utils/console-rooms";
import { nodeRetry, nodeRetrying, nodeSettled } from "../../../apps/web/server/utils/person-node";
import { wording } from "../../../apps/web/shared/wording";

// An account made ready (docs/web.md, 「The join page」): it is given a supervisor of its own, named after the account
// and titled by the person's name, their login where none stands, on the default answerer's road's provider and
// model, its identity on the record road named by the name it is shown by and linked to it (docs/accounts.md, 「Users
// and senders」), and the agents the agency composes for it, asked of the agency once each time it is made ready (the
// agency's `docs/role-agents.md`, 「The agents an account is given」); an account that holds a BMO already is given
// none again. Its machine,
// where the hub holds it, is set in agency as the node its runs stand on (docs/accounts.md, 「Invitations and a
// person's machine」), and a node agency refuses leaves the account ready. A node the node service lists late is asked
// again until agency takes it, for a bounded while, and agency's record says whether it landed.

const ANSWERER = { name: "agent-a", label: "Agent A", ownerAccount: null, provider: "codex", model: "model-a", effort: "high", thinking: "off", answerTokens: null, warming: {} };
const AGENT = { name: "worker-01", role: "worker", ownerAccount: null, provider: "deepseek", model: "model-w", effort: "high", thinking: null, answerTokens: null, enabled: true, keepsCache: true, sessions: "keep", foldRatio: null, prompt: null, bundles: null, skills: null, followsSupervisor: false, carries: false };
const role = (name: string, agents: unknown[]) => ({ name, code: name, label: name, prompt: null, description: null, bundles: [], skills: null, line: "worker", agents, maxConcurrent: agents.length, followsSupervisor: false, running: 0, waiting: 0, provider: null, waitingFor: null });

// What Nitro would import into the module by itself: a refusal carries the unit's code as its data.
const globals = globalThis as Record<string, unknown>;

globalsRestoredAfter(["createError"]);
globals.createError = (options: { statusCode: number; message: string; data?: unknown }) => Object.assign(new Error(options.message), options);

let supervisors: unknown[] = [ANSWERER];
// How often agency has been asked to set u13, and the records agency holds.
let asksOf13 = 0;
let records: { ownerAccount: string; node: string; shared: boolean; setAt: number }[] = [];

const agency = standIn("AGENCY", (call) => {
  if (call.method === "GET" && call.path === "/supervisors") return answer({ items: supervisors, more: false });
  if (call.method === "GET" && call.path === "/roles") {
    return answer({
      roles: [
        role("worker", [AGENT]),
        role("scout", [{ ...AGENT, name: "scout-u9", role: "scout", ownerAccount: "9" }, { ...AGENT, name: "scout-01", role: "scout" }]),
        role("idle", [{ ...AGENT, name: "idle-01", role: "idle", enabled: false }])
      ],
      bundles: [],
      skills: [],
      lines: []
    });
  }
  if (call.method === "POST" && call.path === "/role-agents") return answer({ ...AGENT, ...call.body }, 201);
  if (call.method === "POST" && call.path.startsWith("/composed-agents/")) return answer({ items: [{ ...AGENT, name: "worker-u9", ownerAccount: "9" }] });
  if (call.method === "PATCH" && call.path.startsWith("/supervisors/")) {
    const name = call.path.slice("/supervisors/".length);
    const held = (supervisors as { name: string }[]).find((one) => one.name === name);

    return answer({ ...ANSWERER, ...held, ...call.body });
  }
  if (call.method === "PUT" && call.path === "/person-nodes/11") return answer({ code: "node-taken", error: "another account holds u11" }, 409);
  // u13 is listed by the node service only from its third ask on; u14 never is.
  if (call.method === "PUT" && call.path === "/person-nodes/13" && ++asksOf13 < 3) return answer({ code: "not-a-hub-node", error: "no hub node is named u13" }, 422);
  if (call.method === "PUT" && call.path === "/person-nodes/14") return answer({ code: "not-a-hub-node", error: "no hub node is named u14" }, 422);
  if (call.method === "GET" && call.path === "/person-nodes") return answer({ items: records, more: false });
  if (call.method === "PUT" && call.path.startsWith("/person-nodes/")) {
    return answer({ ownerAccount: call.path.slice("/person-nodes/".length), node: call.body?.node, setAt: 1 });
  }

  return answer({ code: "no-route", error: "no route" }, 404);
});

// The rooms each supervisor answers, the first its private room.
let rooms: Record<string, { id: number; title: string | null; named: boolean; alone: boolean }[]> = {};

const receiver = standIn("RECEIVER", (call) => {
  if (call.method === "GET" && call.path === "/default-answerer") return answer({ supervisor: "agent-a" });
  const identity = call.path.match(/^\/accounts\/(\d+)\/identity$/)?.[1];

  if (call.method === "PUT" && identity !== undefined) return answer({ account: identity, sender: 9_000_000_000_000 + Number(identity) });
  if (call.method === "GET" && call.path.startsWith("/supervisors/") && call.path.endsWith("/rooms")) {
    return answer({ items: rooms[call.path.split("/")[2]!] ?? [], more: false });
  }
  if (call.method === "PUT" && /^\/rooms\/\d+\/title$/.test(call.path)) return answer({ title: call.body?.title ?? null });
  if (call.method === "POST" && call.path === "/supervisors") {
    return answer({ brain: "made", room: { id: 42, takenBack: false, said: null }, supervisor: { name: call.body?.name } }, 201);
  }

  return answer({ code: "no-route", error: "no route" }, 404);
});

const service = standInAccountService({
  users: [
    { id: 9, name: "member-a", node: { agent: "u9", attached: true } },
    { id: 10, name: "member-b", node: { agent: "u10", attached: false } },
    { id: 11, name: "member-c", node: { agent: "u11", attached: true } },
    { id: 12, name: "member-d", fullName: "Person D" },
    { id: 13, name: "member-e", node: { agent: "u13", attached: true } },
    { id: 14, name: "member-f", node: { agent: "u14", attached: true } }
  ]
});

process.env.WEB_SERVER_ADDRESS = service.address;
process.env.WEB_SERVER_TOKEN = service.token;

afterAll(() => {
  service.stop();
  delete process.env.WEB_SERVER_ADDRESS;
});

describe("an account made ready", () => {
  test("is given its own BMO on the default answerer's road and the agents the agency composes for it", async () => {
    agency.asked.length = 0;
    receiver.asked.length = 0;

    await standAccount(9);

    const added = receiver.asked.filter((call) => call.method === "POST");

    expect(added).toHaveLength(1);
    // The receiver's add takes a road's provider and model alone; a person with no name of their own is titled by
    // their login.
    expect(added[0]?.body).toEqual({ name: "u9", label: ownTitles("member-a").label, room: ownTitles("member-a").room, provider: "codex", model: "model-a", repository: null, ownerAccount: 9, sessionScope: "agent" });

    // The agents are the agency's to make, by the composition the delegation chain resolves for the person: the
    // console asks once and adds none of its own.
    expect(agency.asked.filter((call) => call.method === "POST").map((call) => call.path)).toEqual(["/composed-agents/9"]);
  });

  test("is linked to its identity on the record road, the same one every time it is made ready, named as it is shown", async () => {
    receiver.asked.length = 0;

    await standAccount(9);
    await standAccount(9);

    expect(receiver.asked.filter((call) => call.method === "PUT").map((call) => [call.path, call.body])).toEqual([
      ["/accounts/9/identity", { name: "member-a" }],
      ["/accounts/9/identity", { name: "member-a" }]
    ]);
    expect((await userOf(9))?.senders).toEqual([9_000_000_000_009]);
  });

  test("an account that holds a BMO already is given none again", async () => {
    supervisors = [ANSWERER, { ...ANSWERER, name: "u9", ownerAccount: 9 }];
    receiver.asked.length = 0;

    try {
      await standAccount(9);

      expect(receiver.asked.filter((call) => call.method === "POST")).toHaveLength(0);
    } finally {
      supervisors = [ANSWERER];
    }
  });

  test("an account whose BMO `u<user>` stands under no owner, as one given before the receiver passed the account on, is given none again", async () => {
    supervisors = [ANSWERER, { ...ANSWERER, name: "u9", ownerAccount: null }];
    receiver.asked.length = 0;

    try {
      await standAccount(9);

      expect(receiver.asked.filter((call) => call.method === "POST" && call.path === "/supervisors")).toHaveLength(0);
    } finally {
      supervisors = [ANSWERER];
    }
  });

  test("sets the machine the account is bound to as its node, and none while the hub does not hold it", async () => {
    agency.asked.length = 0;

    await standAccount(9);
    await standAccount(10);

    const set = agency.asked.filter((call) => call.method === "PUT");

    expect(set.map((call) => [call.path, call.body])).toEqual([["/person-nodes/9", { node: "u9" }]]);
  });

  test("a node agency refuses leaves the account ready and says agency's code in the log", async () => {
    const logged = spyOn(console, "error").mockImplementation(() => {});

    try {
      await standAccount(11);

      expect(logged.mock.calls.map((call) => String(call[0]))).toEqual([expect.stringContaining("node-taken")]);
    } finally {
      logged.mockRestore();
    }
  });

  test("a node the node service lists late is asked again, one round at a time, until agency takes it", async () => {
    const warned = spyOn(console, "warn").mockImplementation(() => {});
    const told = spyOn(console, "info").mockImplementation(() => {});

    Object.assign(nodeRetry, { everyMs: 5, forMs: 5_000 });
    try {
      agency.asked.length = 0;
      asksOf13 = 0;
      await standAccount(13);
      // A second making-ready while the round runs starts none of its own.
      await standAccount(13);
      expect(nodeRetrying(13)).toBe(true);
      expect(await nodeSettled(13, "u13")).toBe(false);

      for (let waited = 0; nodeRetrying(13) && waited < 2_000; waited += 5) await new Promise((resolve) => setTimeout(resolve, 5));

      expect(nodeRetrying(13)).toBe(false);
      expect(agency.asked.filter((call) => call.method === "PUT" && call.path === "/person-nodes/13")).toHaveLength(3);
      records = [{ ownerAccount: "13", node: "u13", shared: false, setAt: 1 }];
      expect(await nodeSettled(13, "u13")).toBe(true);
      expect(await nodeSettled(13, "u99")).toBe(false);
    } finally {
      Object.assign(nodeRetry, { everyMs: 5_000, forMs: 120_000 });
      records = [];
      warned.mockRestore();
      told.mockRestore();
    }
  });

  test("a node the node service never lists is asked again only for the bound, then left for the next sign-in", async () => {
    const warned = spyOn(console, "warn").mockImplementation(() => {});
    const logged = spyOn(console, "error").mockImplementation(() => {});

    Object.assign(nodeRetry, { everyMs: 5, forMs: 60 });
    try {
      agency.asked.length = 0;
      await standAccount(14);

      for (let waited = 0; nodeRetrying(14) && waited < 2_000; waited += 5) await new Promise((resolve) => setTimeout(resolve, 5));

      const asks = agency.asked.filter((call) => call.method === "PUT" && call.path === "/person-nodes/14").length;

      expect(nodeRetrying(14)).toBe(false);
      expect(asks).toBeGreaterThan(2);
      expect(asks).toBeLessThan(20);
      expect(logged.mock.calls.map((call) => String(call[0]))).toEqual([expect.stringContaining("next sign-in")]);
    } finally {
      Object.assign(nodeRetry, { everyMs: 5_000, forMs: 120_000 });
      warned.mockRestore();
      logged.mockRestore();
    }
  });
});

describe("every account standing before the record road", () => {
  test("is linked to its identity there by one pass over the accounts, which a second pass repeats harmlessly", async () => {
    receiver.asked.length = 0;

    expect(await standRecordIdentities(async () => "9")).toEqual({ linked: 6, failed: 0 });
    // Each identity is named as its account is shown: the person's name, else the login.
    expect(receiver.asked.map((call) => [call.path, call.body])).toEqual([
      ["/accounts/9/identity", { name: "member-a" }],
      ["/accounts/10/identity", { name: "member-b" }],
      ["/accounts/11/identity", { name: "member-c" }],
      ["/accounts/12/identity", { name: "Person D" }],
      ["/accounts/13/identity", { name: "member-e" }],
      ["/accounts/14/identity", { name: "member-f" }]
    ]);
    expect(await standRecordIdentities(async () => "9")).toEqual({ linked: 6, failed: 0 });

    for (const user of [9, 10, 11, 12, 13, 14]) {
      expect((await userOf(user))?.senders).toEqual([9_000_000_000_000 + user]);
    }
  });
});

describe("a person's own BMO titled by their name", () => {
  const own = (label: string) => ({ ...ANSWERER, name: "u12", label, ownerAccount: 12 });
  const changes = () => ({
    labels: agency.asked.filter((call) => call.method === "PATCH").map((call) => [call.path, call.body]),
    titles: receiver.asked.filter((call) => call.method === "PUT" && call.path.endsWith("/title")).map((call) => [call.path, call.body])
  });

  test("takes the titles the pack makes: the name with BMO for the supervisor, the name alone for the room", () => {
    expect(ownTitles("Person D")).toEqual({
      label: wording("account.label.own_bmo", { name: "Person D", agent: wording("account.label.bmo_name") }),
      room: wording("account.label.own_bmo_room", { name: "Person D" })
    });
    expect(ownTitles("Person D").label).toContain("Person D");
    expect(ownTitles("Person D").label).not.toBe(ownTitles("Person D").room);
  });

  test("is made with the person's name where one stands", async () => {
    receiver.asked.length = 0;

    await standAccount(12);

    const added = receiver.asked.find((call) => call.method === "POST");

    expect(added?.body).toMatchObject({ name: "u12", label: ownTitles("Person D").label, room: ownTitles("Person D").room });
  });

  test("titled by the login before the person had a name, follows the name once one stands", async () => {
    supervisors = [ANSWERER, own("member-d")];
    rooms = { u12: [{ id: 42, title: "member-d", named: true, alone: true }] };
    agency.asked.length = 0;
    receiver.asked.length = 0;

    try {
      await followPersonName(12);

      expect(changes()).toEqual({ labels: [["/supervisors/u12", { label: ownTitles("Person D").label }]], titles: [["/rooms/42/title", { title: ownTitles("Person D").room }]] });
    } finally {
      supervisors = [ANSWERER];
      rooms = {};
    }
  });

  test("titled by the name until now, follows a name changed", async () => {
    supervisors = [ANSWERER, own(ownTitles("Old name").label)];
    rooms = { u12: [{ id: 7, title: "group", named: true, alone: false }, { id: 42, title: ownTitles("Old name").room, named: true, alone: true }] };
    agency.asked.length = 0;
    receiver.asked.length = 0;

    try {
      await followPersonName(12, "Old name");

      expect(changes()).toEqual({ labels: [["/supervisors/u12", { label: ownTitles("Person D").label }]], titles: [["/rooms/42/title", { title: ownTitles("Person D").room }]] });
    } finally {
      supervisors = [ANSWERER];
      rooms = {};
    }
  });

  test("a title chosen by hand, or one already right, is left as it stands", async () => {
    supervisors = [ANSWERER, own("Helper")];
    rooms = { u12: [{ id: 42, title: ownTitles("Person D").room, named: true, alone: true }] };
    agency.asked.length = 0;
    receiver.asked.length = 0;

    try {
      await followPersonName(12, "Old name");

      expect(changes()).toEqual({ labels: [], titles: [] });
    } finally {
      supervisors = [ANSWERER];
      rooms = {};
    }
  });
});
