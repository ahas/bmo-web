import { afterAll, describe, expect, spyOn, test } from "bun:test";

import { standInAccountService } from "../../support/account-service";
import { globalsRestoredAfter } from "../../support/globals";
import { answer, standIn } from "../../support/units";

import { standAccount } from "../../../apps/web/server/utils/account-standing";

// An account made ready (docs/web.md, 「The join page」): it is given a supervisor of its own, named after the account
// and shown by the person's name, on the default answerer's order, and one agent of its own for every role with an
// agent of no account, taking that agent's road; an account that holds one already is given none again. Its machine,
// where the hub holds it, is set in agency as the node its runs stand on (docs/accounts.md, 「Invitations and a
// person's machine」), and a node agency refuses leaves the account ready.

const ORDER = [{ provider: "codex", model: "model-a", effort: null, thinking: null, answerTokens: null }];
const ANSWERER = { name: "agent-a", label: "Agent A", ownerAccount: null, provider: "codex", model: "model-a", effort: null, order: ORDER, quotaShare: 0.25, warming: {}, waitingFor: null };
const AGENT = { name: "worker-01", role: "worker", ownerAccount: null, provider: "deepseek", model: "model-w", effort: "high", thinking: null, answerTokens: null, enabled: true, keepsCache: true, sessions: "keep", foldRatio: null, prompt: null, bundles: null, skills: null, followsSupervisor: false, carries: false };
const role = (name: string, agents: unknown[]) => ({ name, code: name, label: name, prompt: null, description: null, bundles: [], skills: null, line: "worker", agents, maxConcurrent: agents.length, followsSupervisor: false, running: 0, waiting: 0, provider: null, waitingFor: null });

// What Nitro would import into the module by itself: a refusal carries the unit's code as its data.
const globals = globalThis as Record<string, unknown>;

globalsRestoredAfter(["createError"]);
globals.createError = (options: { statusCode: number; message: string; data?: unknown }) => Object.assign(new Error(options.message), options);

let supervisors: unknown[] = [ANSWERER];

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
  if (call.method === "PUT" && call.path === "/person-nodes/11") return answer({ code: "not-a-hub-node", error: "no hub node is named u11" }, 422);
  if (call.method === "PUT" && call.path.startsWith("/person-nodes/")) {
    return answer({ ownerAccount: call.path.slice("/person-nodes/".length), node: call.body?.node, setAt: 1 });
  }

  return answer({ code: "no-route", error: "no route" }, 404);
});

const receiver = standIn("RECEIVER", (call) => {
  if (call.method === "GET" && call.path === "/default-answerer") return answer({ supervisor: "agent-a" });
  if (call.method === "POST" && call.path === "/supervisors") {
    return answer({ brain: "made", room: { id: 42, takenBack: false, said: null }, supervisor: { name: call.body?.name } }, 201);
  }

  return answer({ code: "no-route", error: "no route" }, 404);
});

const service = standInAccountService({
  users: [
    { id: 9, name: "member-a", node: { agent: "u9", attached: true } },
    { id: 10, name: "member-b", node: { agent: "u10", attached: false } },
    { id: 11, name: "member-c", node: { agent: "u11", attached: true } }
  ]
});

process.env.WEB_SERVER_ADDRESS = service.address;
process.env.WEB_SERVER_TOKEN = service.token;

afterAll(() => {
  service.stop();
  delete process.env.WEB_SERVER_ADDRESS;
});

describe("an account made ready", () => {
  test("is given its own BMO on the default answerer's order and an agent of every role it holds none of", async () => {
    agency.asked.length = 0;
    receiver.asked.length = 0;

    await standAccount(9);

    const added = receiver.asked.filter((call) => call.method === "POST");

    expect(added).toHaveLength(1);
    expect(added[0]?.body).toMatchObject({ name: "u9", label: "member-a", room: "member-a", quotaShare: 0.25, ownerAccount: 9, sessionScope: "agent" });

    const agents = agency.asked.filter((call) => call.method === "POST" && call.path === "/role-agents");

    // The worker role gains one; the scout role holds the account's already; the idle role has no agent switched on.
    expect(agents).toHaveLength(1);
    expect(agents[0]?.body).toMatchObject({ role: "worker", name: "worker-u9", ownerAccount: "9", provider: "deepseek", model: "model-w", effort: "high", enabled: true, keepsCache: true });
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

      expect(logged.mock.calls.map((call) => String(call[0]))).toEqual([expect.stringContaining("not-a-hub-node")]);
    } finally {
      logged.mockRestore();
    }
  });
});
