import { wording } from "#shared/wording";

import { agency, agencyCall } from "./agency";
import { bundleWordOf, roleWordOf } from "./agency-words";

import type { components } from "@agency/client/schema";
import type { AgentRoleBundleView, AgentRoleChange, AgentRoleView, AgentRolesView } from "#shared/agency";

type Schemas = components["schemas"];

// The roles the agency holds and every bundle a role may give, read, added, changed and removed through its
// `/agent-roles` routes (the agency's `docs/agent-roles.md` and `docs/api.md`). The agency's labels are English for
// its log; the screen names a role or a bundle in the pack's words where the pack holds them, by that label otherwise.

// The agency's codes these routes answer beyond the common ones: a role still held, or a kind's own, is not removed.
const REMOVAL_CODES: Readonly<Record<string, string>> = { conflict: "agents.error.role_delete_refused" };

// A bundle is worded by its code, which is its name with each dot a hyphen (the agency's `docs/api.md`, 「agents」).
function bundleOf(bundle: Schemas["AgentRoleBundle"]): AgentRoleBundleView {
  return { name: bundle.name, label: bundleWordOf(bundle.name.replaceAll(".", "-"), bundle.name, bundle.label) };
}

/** One role as the agency answers it, in the screen's shape; a role's code is its name. */
export function agentRoleOf(role: Schemas["AgentRole"]): AgentRoleView {
  return {
    name: role.name,
    shown: roleWordOf(role.name, role.name, role.label),
    label: role.label,
    bundles: role.bundles.map(bundleOf),
    maxConcurrent: role.maxConcurrent,
    prompt: role.prompt === "" ? null : role.prompt,
    tier: role.tier === "" ? null : role.tier,
    agents: role.agents,
    kindDefault: role.kindDefault
  };
}

/** The agency's roles and bundles, in the screen's shape. */
export function agentRolesOfAnswer(answer: Schemas["AgentRoleList"]): AgentRolesView {
  return { roles: answer.roles.map(agentRoleOf), bundles: answer.bundles.map(bundleOf) };
}

const whole = (value: unknown): boolean => typeof value === "number" && Number.isInteger(value) && value >= 1;
const named = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";

/**
 * A role's change as a screen sent it, every field checked for its shape and nothing else: a new role needs its name,
 * its label and its bundles, a change any one field. An emptied prompt or tier is a cleared one. Null where the body
 * does not read as one; whether the values stand is the agency's to say.
 */
export function agentRoleChangeOf(body: unknown, adding: boolean): AgentRoleChange | null {
  if (body === null || typeof body !== "object") return null;

  const held = body as Record<string, unknown>;
  const change: AgentRoleChange = {};

  if (adding) {
    if (!named(held.name)) return null;

    change.name = held.name.trim();
  }

  if ("label" in held) {
    if (!named(held.label)) return null;

    change.label = held.label.trim();
  }

  if ("bundles" in held) {
    if (!Array.isArray(held.bundles) || !held.bundles.every(named)) return null;

    change.bundles = held.bundles.map((one: string) => one.trim());
  }

  if ("maxConcurrent" in held) {
    if (held.maxConcurrent !== null && !whole(held.maxConcurrent)) return null;

    change.maxConcurrent = held.maxConcurrent as number | null;
  }

  if ("prompt" in held) {
    if (held.prompt !== null && typeof held.prompt !== "string") return null;

    change.prompt = typeof held.prompt === "string" && held.prompt.trim() !== "" ? held.prompt : null;
  }

  if ("tier" in held) {
    if (held.tier !== null && typeof held.tier !== "string") return null;

    change.tier = named(held.tier) ? held.tier.trim() : null;
  }

  if (adding && (change.label === undefined || change.bundles === undefined)) return null;
  if (!adding && Object.keys(change).length === 0) return null;

  return change;
}

/** Every role and bundle the agency holds. */
export async function agentRoles(): Promise<AgentRolesView> {
  return agentRolesOfAnswer(await agencyCall(agency().GET("/agent-roles")));
}

/** A new role; on a new role the agency is sent no bound, prompt or tier it was not given. */
export async function addAgentRole(change: AgentRoleChange): Promise<AgentRoleView> {
  if (change.name === undefined || change.label === undefined || change.bundles === undefined) throw fail(400, wording("common.error.bad_action"));

  const body: Schemas["AgentRoleAsk"] = { name: change.name, label: change.label, bundles: change.bundles };

  if (change.maxConcurrent != null) body.maxConcurrent = change.maxConcurrent;
  if (change.prompt != null) body.prompt = change.prompt;
  if (change.tier != null) body.tier = change.tier;

  return agentRoleOf(await agencyCall(agency().POST("/agent-roles", { body })));
}

/** One role's change, the fields it names and no other. */
export async function changeAgentRole(name: string, change: AgentRoleChange): Promise<AgentRoleView> {
  const { name: _name, ...body } = change;

  return agentRoleOf(await agencyCall(agency().PATCH("/agent-roles/{roleName}", { params: { path: { roleName: name } }, body })));
}

/** One role removed; a role still held, or a kind's own, is refused in the pack's words. */
export async function removeAgentRole(name: string): Promise<void> {
  await agencyCall(agency().DELETE("/agent-roles/{roleName}", { params: { path: { roleName: name } } }), { codes: REMOVAL_CODES });
}
