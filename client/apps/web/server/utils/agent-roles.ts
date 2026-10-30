import { wording } from "#shared/wording";

import { agencyRoute } from "./agency";
import { bundleWordOf, roleWordOf } from "./agency-words";

import type { AgentRoleBundleView, AgentRoleChange, AgentRoleView, AgentRolesView } from "#shared/agency";

// The roles the agency holds and every bundle a role may give, read, added, changed and removed through its
// `/agent-roles` routes (the agency's `docs/agent-roles.md` and `docs/api.md`). The agency's labels are English for
// its log; the screen names a role or a bundle in the pack's words where the pack holds them, by that label otherwise.

// The agency's codes these routes answer beyond the common ones: a role still held, or a kind's own, is not removed.
const REMOVAL_CODES: Readonly<Record<string, string>> = { conflict: "agents.error.role_delete_refused" };

const text = (value: unknown): string => (typeof value === "string" ? value : "");
const list = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter((one): one is Record<string, unknown> => one !== null && typeof one === "object") : [];

function bundleOf(held: Record<string, unknown>): AgentRoleBundleView[] {
  const name = text(held.name);

  return name === "" ? [] : [{ name, label: bundleWordOf(held.code, name, text(held.label)) }];
}

/** One role as the agency answers it, in the screen's shape; a member that does not read as one is left out. */
export function agentRoleOf(held: Record<string, unknown>): AgentRoleView[] {
  const name = text(held.name);

  if (name === "") return [];

  const label = text(held.label);

  return [
    {
      name,
      shown: roleWordOf(held.code, name, label),
      label,
      bundles: list(held.bundles).flatMap(bundleOf),
      maxConcurrent: typeof held.maxConcurrent === "number" ? held.maxConcurrent : null,
      prompt: typeof held.prompt === "string" && held.prompt !== "" ? held.prompt : null,
      tier: typeof held.tier === "string" && held.tier !== "" ? held.tier : null,
      agents: typeof held.agents === "number" ? held.agents : 0,
      kindDefault: held.kindDefault === true
    }
  ];
}

/** The agency's roles and bundles, in the screen's shape. */
export function agentRolesOfAnswer(answer: unknown): AgentRolesView {
  const held = (answer ?? {}) as { roles?: unknown; bundles?: unknown };

  return { roles: list(held.roles).flatMap(agentRoleOf), bundles: list(held.bundles).flatMap(bundleOf) };
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
  return agentRolesOfAnswer(await agencyRoute<unknown>("GET", "/agent-roles"));
}

/** A new role; on a new role the agency is sent no bound, prompt or tier it was not given. */
export async function addAgentRole(change: AgentRoleChange): Promise<AgentRoleView> {
  const body = Object.fromEntries(Object.entries(change).filter(([, value]) => value !== null));

  return roleAnswered(await agencyRoute<unknown>("POST", "/agent-roles", body));
}

/** One role's change, the fields it names and no other. */
export async function changeAgentRole(name: string, change: AgentRoleChange): Promise<AgentRoleView> {
  return roleAnswered(await agencyRoute<unknown>("PATCH", `/agent-roles/${encodeURIComponent(name)}`, change));
}

/** One role removed; a role still held, or a kind's own, is refused in the pack's words. */
export async function removeAgentRole(name: string): Promise<void> {
  await agencyRoute<unknown>("DELETE", `/agent-roles/${encodeURIComponent(name)}`, undefined, { codes: REMOVAL_CODES });
}

function roleAnswered(answer: unknown): AgentRoleView {
  const [role] = answer !== null && typeof answer === "object" ? agentRoleOf(answer as Record<string, unknown>) : [];

  if (role === undefined) throw fail(502, wording("agents.error.agency_failed"));

  return role;
}
