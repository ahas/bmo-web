import type { AgentRoleChange, AgentRoleView } from "#shared/agency";

// The roles tab's form and what it sends (docs/web.md, the role tab): a role's dialog holds every field of a role, and a
// save sends a new role whole and a role being edited by the fields that differ from what it opened on.

/** What a role's dialog holds: the bound as a number or none, the prompt and the tier as text, empty for none. */
export interface AgentRoleForm {
  name: string;
  label: string;
  bundles: string[];
  maxConcurrent: number | null;
  tier: string;
  prompt: string;
}

export function emptyRoleForm(): AgentRoleForm {
  return { name: "", label: "", bundles: [], maxConcurrent: null, tier: "", prompt: "" };
}

export function roleForm(role: AgentRoleView): AgentRoleForm {
  return {
    name: role.name,
    label: role.label,
    bundles: role.bundles.map((one) => one.name),
    maxConcurrent: role.maxConcurrent,
    tier: role.tier ?? "",
    prompt: role.prompt ?? ""
  };
}

const sameBundles = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((one) => b.includes(one));

/** What a save sends: a new role every field, an edited one the fields that differ, a cleared one as null. */
export function roleChange(form: AgentRoleForm, from: AgentRoleForm | null): AgentRoleChange {
  const tier = form.tier.trim() === "" ? null : form.tier.trim();
  const prompt = form.prompt.trim() === "" ? null : form.prompt;
  const whole: AgentRoleChange = { label: form.label.trim(), bundles: [...form.bundles], maxConcurrent: form.maxConcurrent, prompt, tier };

  if (from === null) return { name: form.name.trim(), ...whole };

  const change: AgentRoleChange = {};

  if (form.label.trim() !== from.label) change.label = whole.label;
  if (!sameBundles(form.bundles, from.bundles)) change.bundles = whole.bundles;
  if (form.maxConcurrent !== from.maxConcurrent) change.maxConcurrent = form.maxConcurrent;
  if (form.prompt !== from.prompt) change.prompt = prompt;
  if (form.tier !== from.tier) change.tier = tier;

  return change;
}

/** The pack's key for why a role cannot be removed, or null where it can: an agent holds it, or it is a kind's own. */
export function roleRemovalBlock(role: AgentRoleView): string | null {
  if (role.agents > 0) return "agents.status.role_held";
  if (role.kindDefault) return "agents.status.role_kind_own";

  return null;
}

/** Where a refusal goes in the dialog: under the field it names, or under the form for any other. */
export function roleRefusalPlace(field: string | null): string {
  return field !== null && ["name", "label", "bundles", "maxConcurrent", "tier", "prompt"].includes(field) ? field : "form";
}
