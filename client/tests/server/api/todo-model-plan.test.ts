import { describe, expect, test } from "bun:test";

import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { TodoModelPlan } from "../../../apps/web/shared/types";

// What the TODO rows name before an item's job has run, and what chose a running job's road (docs/web.md, the TODO
// panel's section), in the order the agency chooses a job's road (its docs/repositories.md, 「A model an item names」):
// a repository's pin over the road of the agent its jobs' role would let a run in on, and each running job's own road
// with its `chosenBy`.

const ENTRY = { provider: "deepseek", model: "deepseek-flash", effort: null, thinking: null, answerTokens: null };
const AGENT = (name: string, provider: string, model: string, position: number) => ({
  ...ENTRY, name, role: "worker", provider, model, enabled: true, position, keepsCache: false, foldRatio: null, prompt: null, bundles: null, skills: null,
  followsSupervisor: false, carries: false
});
const ROLE = {
  name: "worker", code: "worker", label: "Worker", prompt: null, description: null, bundles: [], line: "worker",
  agents: [AGENT("worker-01", "deepseek", "deepseek-flash", 1), AGENT("worker-02", "claude-code", "claude-opus-5-5", 2)],
  maxConcurrent: 2, sessions: "keep", foldRatio: 0.85, callable: false, followsSupervisor: false, running: 1, waiting: 0, provider: "deepseek" as string | null, waitingFor: null
};
const REPOSITORY = (name: string, pin: { provider: string; model: string } | null) => ({
  name, label: null, icon: null, ownerAccount: null, path: `/srv/${name}`, nodeName: null, supportCount: 0, prefixDocuments: [], preamble: null,
  rules: null, devCommand: null, pin, downgradeHeal: true, sampling: {}, samplingSettings: [], checkouts: []
});
const JOB = (id: number, itemId: number, road: { provider: string; model: string }, chosenBy: string | null) => ({
  id, itemId, roleName: "worker", state: "running", roads: [road], chosenBy
});

let role = ROLE;
let extraRoles: (typeof ROLE)[] = [];
let recent: Record<string, unknown>[] | null = null;

standIn("AGENCY", (call) => {
  if (call.path === "/repositories") return answer({ items: [REPOSITORY("repo-a", null), REPOSITORY("repo-b", { provider: "codex", model: "gpt-5.6-sol" })], more: false });
  if (call.path === "/roles") return answer({ roles: [role, ...extraRoles], bundles: [], lines: ["worker"] });
  if (call.path === "/models") return answer({ items: [], more: false });
  if (call.path.startsWith("/jobs?") && call.path.includes("state=running")) {
    return answer({ items: [JOB(1, 11, { provider: "claude-code", model: "claude-opus-5-5" }, "forced"), JOB(2, 12, { provider: "deepseek", model: "deepseek-flash" }, "unheard-of")], more: false });
  }
  if (call.path.startsWith("/jobs?") && call.path.includes("state=starting")) return answer({ items: [], more: false });
  if (call.path.startsWith("/jobs?") && recent !== null) return answer({ items: recent, more: false });
  if (call.path.startsWith("/jobs?")) return answer({ items: [JOB(1, 11, { provider: "claude-code", model: "claude-opus-5-5" }, "forced")], more: false });

  return answer({ code: "not-found", error: "no such route" }, 404);
});

const plan = await routeOf<TodoModelPlan>("../../apps/web/server/api/todos/model-plan.get");

describe("the model plan", () => {
  test("names a repository's pin, and where it pins none the road of the role's agent on the provider its next run goes out on", async () => {
    role = ROLE;

    expect((await asked(plan, {})).answer?.workers).toEqual({ "repo-a": "deepseek/deepseek-flash", "repo-b": "codex/gpt-5.6-sol" });
  });

  test("follows the role to its next agent's road, the pin standing over it", async () => {
    role = { ...ROLE, provider: "claude-code" };

    expect((await asked(plan, {})).answer?.workers).toEqual({ "repo-a": "claude-code/claude-opus-5-5", "repo-b": "codex/gpt-5.6-sol" });

    role = ROLE;
  });

  test("names no road for a repository whose role has no agent that can answer now", async () => {
    role = { ...ROLE, provider: null };

    expect((await asked(plan, {})).answer?.workers).toEqual({ "repo-b": "codex/gpt-5.6-sol" });

    role = ROLE;
  });

  test("reads the role per repository, from its newest job, and no other repository's", async () => {
    role = ROLE;
    extraRoles = [{ ...ROLE, name: "producer", provider: "claude-code" }];
    recent = [{ ...JOB(9, 19, { provider: "claude-code", model: "claude-opus-5-5" }, "forced"), roleName: "producer", repositoryName: "repo-a" }];

    const answered = await asked(plan, {});

    extraRoles = [];
    recent = null;
    expect(answered.status).toBe(200);
    expect((answered.answer as TodoModelPlan).workers["repo-a"]).toBe("claude-code/claude-opus-5-5");
    expect((answered.answer as TodoModelPlan).workers["repo-b"]).toBe("codex/gpt-5.6-sol");
  });

  test("names each running job's road and what chose it, leaving out a choice the agency does not name", async () => {
    const got = (await asked(plan, {})).answer;

    expect(got?.running).toEqual({ 11: "claude-code/claude-opus-5-5", 12: "deepseek/deepseek-flash" });
    expect(got?.chosenBy).toEqual({ 11: "forced" });
  });
});
