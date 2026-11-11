import { proveNode } from "./account-service";
import { agency, agencyCall } from "./agency";

import type { UserNode } from "@web/server-client";

// Agency's record of the node an account's runs stand on (agency's `docs/person-nodes.md`, 「Which node is a
// person's」; docs/accounts.md, 「Invitations and a person's machine」): set to the machine the account is bound to
// once the hub holds it, and taken away as the account is bound to none.

// Agency's codes on its person-node routes, each with the pack's key for its sentence.
const PERSON_NODE_CODES = { "not-a-hub-node": "organization.error.not_a_hub_node" };

/** The machine set as the node the account's runs stand on; a refusal carries agency's code in its `data`. */
export async function setPersonNode(user: number | string, machine: string): Promise<void> {
  await agencyCall(agency().PUT("/person-nodes/{ownerAccount}", { params: { path: { ownerAccount: String(user) } }, body: { node: machine } }), {
    codes: PERSON_NODE_CODES
  });
}

/** The account's node taken away; an account agency holds no record of has nothing to take. */
export async function dropPersonNode(user: number | string): Promise<void> {
  try {
    await agencyCall(agency().DELETE("/person-nodes/{ownerAccount}", { params: { path: { ownerAccount: String(user) } } }));
  } catch (error) {
    if ((error as { data?: { code?: string | null } }).data?.code !== "not-found") throw error;
  }
}

/**
 * The account's machine proven where the hub holds it now, and then set as the node its runs stand on: a machine
 * the administrator bound the account to is set in agency once it attaches.
 */
export async function settleMachine(user: number | string): Promise<UserNode> {
  const machine = await proveNode(String(user));

  if (typeof machine.agent === "string" && machine.attached) await setPersonNode(user, machine.agent);

  return machine;
}
