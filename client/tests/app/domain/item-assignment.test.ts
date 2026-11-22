import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { assignmentChoices, assignmentOf, assignmentValue, namedAssignment } from "../../../apps/web/app/domain/item-assignment";

import type { RoleAgentView, RoleView } from "../../../apps/web/shared/axes";

// Whom an item's work runs on, as its detail chooses it (docs/web.md, the TODO panel's section): one agent, or a model
// and the role whose free agent takes it at the launch.

const seat = (name: string, model: string | null, enabled = true): RoleAgentView => ({
  name, role: "role-a", provider: model === null ? null : "provider-a", model, effort: null, thinking: null, answerTokens: null, advisor: null, enabled,
  keepsCache: false, sessions: "keep", foldRatio: null, prompt: null, bundles: null, skills: null, followsAsker: null, followsSupervisor: model === null, carries: false
});

const role = (name: string, agents: RoleAgentView[]): RoleView => ({
  name, label: name, description: null, prompt: null, providerPrompts: {}, bundles: [], skills: null, line: "default", agents, roads: [], followsAsker: false,
  maxConcurrent: agents.length, running: 0, waiting: 0, provider: null, waitingFor: null
} as RoleView);

const ROLES = [role("role-a", [seat("agent-a", "model-a"), seat("agent-b", "model-b"), seat("agent-c", "model-a"), seat("agent-d", "model-c", false), seat("agent-e", null)])];

describe("the assignment chooser", () => {
  test("offers under each role the models its agents switched on run, each once with its agents, then those agents", () => {
    const [group] = assignmentChoices(wording, ROLES, null);

    expect(group!.map((one) => one.value)).toEqual(["@role-a", "model:role-a:model-a", "model:role-a:model-b", "agent-a", "agent-b", "agent-c", "agent-e"]);
    expect(group![1]).toMatchObject({
      label: wording("todo.label.assign_model", { role: "role-a", model: "model-a" }),
      description: wording("todo.label.assign_model_agents", { agents: "agent-a, agent-c" })
    });
  });

  test("stands what the labels name first, alone, only where the listing does not hold it", () => {
    expect(assignmentChoices(wording, ROLES, { role: "role-a", model: "model-a" })).toHaveLength(1);
    expect(assignmentChoices(wording, [], { role: "role-a", model: "model-a" })[0]).toEqual([
      { value: "model:role-a:model-a", label: wording("todo.label.assign_model", { role: "role-a", model: "model-a" }) }
    ]);
    expect(assignmentChoices(wording, [], { agent: "agent-z" })[0]).toEqual([{ value: "agent-z", label: "agent-z" }]);
  });

  test("a choice's value reads back as the assignment it stands for", () => {
    for (const assignment of [{ agent: "agent-a" }, { role: "role-a", model: "model-a" }, { role: "role-a", model: "provider-a/vendor:model-a" }, { role: null, model: "model-a" }]) {
      expect(assignmentOf(assignmentValue(assignment))).toEqual(assignment);
    }
  });

  test("the labels name the agent over a model, and a model with its role or alone", () => {
    expect(namedAssignment({ agent: "agent-a", model: "model-a", role: "role-a" })).toEqual({ agent: "agent-a" });
    expect(namedAssignment({ agent: null, model: "model-a", role: "role-a" })).toEqual({ role: "role-a", model: "model-a" });
    expect(namedAssignment({ agent: null, model: null, role: "role-a" })).toBeNull();
    // A model with no role stands chosen as the model alone where the listing does not offer it.
    expect(assignmentChoices(wording, [], namedAssignment({ agent: null, model: "model-a", role: null }))[0]).toEqual([{ value: "model::model-a", label: "model-a" }]);
  });
});
