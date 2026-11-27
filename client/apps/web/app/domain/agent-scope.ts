// The node of the system and organisation screen an agent list stands under (docs/web.md,
// 「System and organisation」, the agent tabs): the agency's lists narrow by the node chosen — the platform's own
// link whole for the administrator, the reader's own account at their link, and a unit and the units under it at a
// company or a unit of one — and a row added at a node is filed under it. The address is the whole of what decides
// the scope, so the list components read it here rather than being handed it.

import { ORGANIZATION_KEY, PERSON_NODE, PLATFORM_NODE, UNIT_KEY } from "./organization";

import { useSignedUser } from "~/domain/access";

import type { LocationQuery } from "vue-router";

/** What one read of the agency's lists is narrowed to, and where a row it adds is filed. `params` are the agency's
 * owner parameters, carried onto the BFF's address as query; `key` names the node for the fetch cache, so one
 * node's answer never stands in another's; `ownerUnit` files an add under the unit chosen, absent where the node
 * files no unit (the platform's own rows, and a person's, which the agency files under the caller). */
export interface AgentScope {
  key: string;
  params: Record<string, string | boolean>;
  ownerUnit?: number;
}

// One address value as text, whichever way the router left it.
function text(value: LocationQuery[string] | undefined): string {
  const one = Array.isArray(value) ? value[0] : value;

  return typeof one === "string" ? one : "";
}

/** The scope the address chooses: the platform's link, the reader's own with their account named, a unit and the
 * units under it, or the company itself with its units below. `null` while the address names no node, which leaves
 * a list on the reader's whole reach exactly as before the tabs joined the tree. */
export function agentScopeOf(query: LocationQuery, signedUser: number | null): AgentScope | null {
  const node = text(query[ORGANIZATION_KEY]);

  if (node === PLATFORM_NODE) return { key: "platform", params: {} };
  if (node === PERSON_NODE) {
    return signedUser === null ? { key: "me", params: {} } : { key: "me", params: { ownerAccount: String(signedUser) } };
  }

  if (!/^[1-9][0-9]*$/.test(node)) return null;

  const asked = text(query[UNIT_KEY]);
  const chosen = /^[1-9][0-9]*$/.test(asked) ? Number(asked) : Number(node);

  return { key: `unit-${chosen}`, params: { unit: String(chosen), unitSubtree: "true" }, ownerUnit: chosen };
}

/** The scope the screen's own address names, kept live as the reader moves through the tree. */
export function useAgentScope(): ComputedRef<AgentScope | null> {
  const route = useRoute();
  const signedUser = useSignedUser();

  return computed(() => agentScopeOf(route.query, signedUser.value));
}
