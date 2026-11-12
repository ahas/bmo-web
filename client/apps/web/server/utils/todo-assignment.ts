import { MODEL_LABEL_LIMIT } from "#shared/config";
import { wording } from "#shared/wording";
import { readRoles } from "./axes";
import { fail } from "./fail";

import type { RoleAgentView } from "#shared/axes";

// Whom an item's work runs on, as its labels name it (the agency's docs/repositories.md, 「An agent an item names」):
// one agent by its `agent` label, or a model and a role by its `model` and `role` labels, the launch then seating the
// job on whichever agent of that role running that model is free. The console writes the labels and checks a model
// against the agents the agency lists before it writes or approves one (docs/web.md, the TODO panel's section).

const ROLE_NAME = /^[a-z][a-z0-9-]*$/;

/** What one of an item's assignment labels names: null where it is absent, empty or `auto`. */
export function namedLabel(labels: Readonly<Record<string, string>>, key: "agent" | "model" | "role"): string | null {
  const named = (labels[key] ?? "").trim();

  return named === "" || named === "auto" ? null : named;
}

/** Whether a value reads as a model an agent's road names, bare or with its provider before it. */
export function isAssignedModel(value: unknown): value is string {
  return typeof value === "string" && value !== "" && value !== "auto" && value.length <= MODEL_LABEL_LIMIT && !/\s/.test(value);
}

/** Whether a value reads as a role's key as the agency holds it. */
export function isRoleName(value: unknown): value is string {
  return typeof value === "string" && value.length <= MODEL_LABEL_LIMIT && ROLE_NAME.test(value);
}

/** Whether an agent's road runs the model, named as its road names it or with its provider before it. */
export function runsModel(agent: Pick<RoleAgentView, "provider" | "model">, model: string): boolean {
  if (agent.model === null) return false;

  return agent.model === model || (agent.provider !== null && `${agent.provider}/${agent.model}` === model);
}

/**
 * Refuses a model no agent of the role runs, 422 with the role's agents and their models named, or the role where the
 * agency holds none by that name; passes where at least one agent of the role switched on runs it.
 */
export async function requireModelCandidate(role: string, model: string): Promise<void> {
  const held = (await readRoles()).roles.find((one) => one.name === role);

  if (held === undefined) throw fail(422, wording("todo.error.unknown_role", { role }));

  const on = held.agents.filter((agent) => agent.enabled);

  if (on.some((agent) => runsModel(agent, model))) return;

  const agents = on.length === 0
    ? wording("agents.status.agents_none")
    : on.map((agent) => (agent.model === null ? agent.name : `${agent.name} (${agent.model})`)).join(", ");

  throw fail(422, wording("todo.error.no_candidate", { role, model, agents }));
}

/** Refuses approving an item that names a model and a role and no agent where no agent of that role runs the model. */
export async function requireCandidateOfLabels(labels: Readonly<Record<string, string>>): Promise<void> {
  const model = namedLabel(labels, "model");
  const role = namedLabel(labels, "role");

  if (namedLabel(labels, "agent") !== null || model === null || role === null) return;

  await requireModelCandidate(role, model);
}

/** The labels an item holds with one agent named, the model and the role it may have named taken away. */
export function labelsNamingAgent(labels: Readonly<Record<string, string>>, agent: string): Record<string, string> {
  const { model: _model, role: _role, ...rest } = labels;

  return { ...rest, agent };
}

/** The labels an item holds with a model and a role named, the agent it may have named taken away. */
export function labelsNamingModel(labels: Readonly<Record<string, string>>, model: string, role: string): Record<string, string> {
  const { agent: _agent, ...rest } = labels;

  return { ...rest, model, role };
}
