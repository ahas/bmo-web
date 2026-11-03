import { describe, expect, test } from "bun:test";

import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { TodoModelPlan } from "../../../apps/web/shared/types";

// What the TODO rows name before an item's job has run, and what chose a running job's road (docs/web.md, the TODO
// panel's section), in the order the agency chooses a job's road (its docs/repositories.md, 「A model an item names」):
// the role's forced provider over every repository's pin, the pin over the role's order, and each running job's own
// road with its `chosenBy`.

const ENTRY = { provider: "deepseek", model: "deepseek-flash", effort: null, thinking: null, answerTokens: null };
const ROLE = {
  name: "worker", code: "worker", label: "Worker", prompt: null, description: null, bundles: [], line: "worker", order: [ENTRY], quotaShare: 0.01,
  active: null as { provider: string; model: string } | null, maxConcurrent: 3, sessions: "keep", foldRatio: 0.85, callable: false,
  followsSupervisor: false, running: 1, waiting: 0, provider: "deepseek", waitingFor: null
};
const REPOSITORY = (name: string, pin: { provider: string; model: string } | null) => ({
  name, label: null, icon: null, ownerAccount: null, path: `/srv/${name}`, nodeName: null, supportCount: 0, prefixDocuments: [], preamble: null,
  rules: null, devCommand: null, pin, downgradeHeal: true, sampling: {}, samplingSettings: [], checkouts: []
});
const JOB = (id: number, itemId: number, road: { provider: string; model: string }, chosenBy: string | null) => ({
  id, itemId, roleName: "worker", state: "running", roads: [road], chosenBy
});

let role = ROLE;

standIn("AGENCY", (call) => {
  if (call.path === "/repositories") return answer({ items: [REPOSITORY("repo-a", null), REPOSITORY("repo-b", { provider: "codex", model: "gpt-5.6-sol" })], more: false });
  if (call.path === "/roles") return answer({ roles: [role], bundles: [], lines: ["worker"] });
  if (call.path === "/models") return answer({ items: [], more: false });
  if (call.path.startsWith("/jobs?") && call.path.includes("state=running")) {
    return answer({ items: [JOB(1, 11, { provider: "claude-code", model: "claude-opus-5-5" }, "forced"), JOB(2, 12, { provider: "deepseek", model: "deepseek-flash" }, "unheard-of")], more: false });
  }
  if (call.path.startsWith("/jobs?") && call.path.includes("state=starting")) return answer({ items: [], more: false });
  if (call.path.startsWith("/jobs?")) return answer({ items: [JOB(1, 11, { provider: "claude-code", model: "claude-opus-5-5" }, "forced")], more: false });

  return answer({ code: "not-found", error: "no such route" }, 404);
});

const plan = await routeOf<TodoModelPlan>("../../apps/web/server/api/todos/model-plan.get");

describe("the model plan", () => {
  test("names the role's order's choice under a repository's pin where no provider is forced", async () => {
    role = ROLE;

    expect((await asked(plan, {})).answer?.workers).toEqual({ "repo-a": "deepseek/deepseek-flash", "repo-b": "codex/gpt-5.6-sol" });
  });

  test("names the role's forced provider over every repository's pin", async () => {
    role = { ...ROLE, active: { provider: "claude-code", model: "claude-opus-5-5" }, provider: "claude-code" };

    expect((await asked(plan, {})).answer?.workers).toEqual({ "repo-a": "claude-code/claude-opus-5-5", "repo-b": "claude-code/claude-opus-5-5" });

    role = ROLE;
  });

  test("names each running job's road and what chose it, leaving out a choice the agency does not name", async () => {
    const got = (await asked(plan, {})).answer;

    expect(got?.running).toEqual({ 11: "claude-code/claude-opus-5-5", 12: "deepseek/deepseek-flash" });
    expect(got?.chosenBy).toEqual({ 11: "forced" });
  });
});
