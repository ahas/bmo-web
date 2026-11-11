import { afterAll, describe, expect, test } from "bun:test";

import { standInAccountService } from "../../support/account-service";
import { answer, standIn } from "../../support/units";

import { standAccount } from "../../../apps/web/server/utils/account-standing";

// An account made ready (docs/web.md, 「The join page」): it is given a supervisor of its own, named after the account
// and shown by the person's name, on the default answerer's order, and one agent of its own for every role with an
// agent of no account, taking that agent's road; an account that holds one already is given none again.

const ORDER = [{ provider: "codex", model: "model-a", effort: null, thinking: null, answerTokens: null }];
const ANSWERER = { name: "agent-a", label: "Agent A", ownerAccount: null, provider: "codex", model: "model-a", effort: null, order: ORDER, quotaShare: 0.25, warming: {}, waitingFor: null };
const AGENT = { name: "worker-01", role: "worker", ownerAccount: null, provider: "deepseek", model: "model-w", effort: "high", thinking: null, answerTokens: null, enabled: true, position: 1, keepsCache: true, sessions: "keep", callable: false, foldRatio: null, prompt: null, bundles: null, skills: null, followsSupervisor: false, carries: false };
const role = (name: string, agents: unknown[]) => ({ name, code: name, label: name, prompt: null, description: null, bundles: [], skills: null, line: "worker", agents, maxConcurrent: agents.length, followsSupervisor: false, running: 0, waiting: 0, provider: null, waitingFor: null });

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

  return answer({ code: "no-route", error: "no route" }, 404);
});

const receiver = standIn("RECEIVER", (call) => {
  if (call.method === "GET" && call.path === "/default-answerer") return answer({ supervisor: "agent-a" });
  if (call.method === "POST" && call.path === "/supervisors") {
    return answer({ brain: "made", room: { id: 42, takenBack: false, said: null }, supervisor: { name: call.body?.name } }, 201);
  }

  return answer({ code: "no-route", error: "no route" }, 404);
});

const service = standInAccountService({ users: [{ id: 9, name: "member-a" }] });

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
});
