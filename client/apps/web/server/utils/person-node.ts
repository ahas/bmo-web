import { proveNode, rebindNode, revokeMachine, unbindNode, userNode } from "./account-service";
import { agency, agencyCall } from "./agency";

import type { ProfileCaller } from "./account-service";
import type { UserNode } from "@web/server-client";

// Agency's record of the node an account's runs stand on (agency's `docs/person-nodes.md`, 「Which node is a
// person's」; docs/accounts.md, 「Invitations and a person's machine」): set to the machine the account is bound to
// once the hub holds it, and taken away as the account is bound to none.

// Agency's codes on its person-node routes, each with the pack's key for its sentence.
const PERSON_NODE_CODES = { "not-a-hub-node": "organization.error.not_a_hub_node", "node-taken": "organization.error.agency_node_taken" };

/**
 * The machine set as the node the account's runs stand on, said to be shared where the administrator bound it so; a
 * refusal carries agency's code in its `data`.
 */
export async function setPersonNode(user: number | string, machine: string, shared = false): Promise<void> {
  // `shared` goes only where it is true, so a record of the account's own machine reads as it always has. The vendored
  // agency client's body type does not name the field yet, so the body is built apart from the call.
  const body: { node: string; shared?: boolean } = shared ? { node: machine, shared } : { node: machine };

  await agencyCall(agency().PUT("/person-nodes/{ownerAccount}", { params: { path: { ownerAccount: String(user) } }, body }), {
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

  if (typeof machine.agent === "string" && machine.attached) await setPersonNode(user, machine.agent, machine.shared);

  return machine;
}

/**
 * A change to the account's binding that agency's record follows, held together across the two units: the account
 * service's word first, since it judges the account, its leaving, the machine's name and who else is bound there;
 * then agency's, asked by `follow`; and where agency refuses, the binding is put back as it stood before the change,
 * so a refused change leaves nothing behind in either unit. The refusal is answered as agency said it.
 */
export async function heldTogether<T>(user: string, caller: ProfileCaller, change: () => Promise<T>, follow: (changed: T) => Promise<void>): Promise<T> {
  const before = await userNode(user);
  const changed = await change();

  try {
    await follow(changed);
  } catch (refusal) {
    await putBack(user, before, caller).catch((error: unknown) => console.error(`account ${user}: its binding could not be put back: ${String(error)}`));
    throw refusal;
  }

  return changed;
}

// The binding as it stood: the same machine with the same declaration, or none.
async function putBack(user: string, before: UserNode, caller: ProfileCaller): Promise<void> {
  if (typeof before.agent === "string") {
    await rebindNode(user, before.agent, before.shared, caller);
  } else {
    await unbindNode(user, caller);
  }
}

/**
 * The account's machine taken away, by the administrator or by the account itself (docs/accounts.md, 「Invitations
 * and a person's machine」). Agency's record goes first and the binding next, so a refusal from either leaves both
 * as they stood: a binding put back would be the administrator's to make, while agency's record is set back for any
 * account, as the proof sets it. Then, where the binding was not shared, its name is revoked at the hub through the
 * account service, so the machine is told to leave now or at its next hello and the desktop app asks to be connected
 * again; the binding is gone whatever the revoke meets, so a refused revoke goes to the log.
 */
export async function unlinkMachine(user: string, caller: ProfileCaller): Promise<void> {
  const machine = await userNode(user);
  const held = typeof machine.agent === "string" && machine.attached ? machine.agent : null;

  await dropPersonNode(user);
  try {
    await unbindNode(user, caller);
  } catch (refusal) {
    if (held !== null) {
      await setPersonNode(user, held, machine.shared).catch((error: unknown) => console.error(`account ${user}: its node could not be set back: ${String(error)}`));
    }
    throw refusal;
  }

  if (typeof machine.agent !== "string" || machine.shared) return;

  const agent = machine.agent;

  await revokeMachine(agent).catch((error: unknown) => console.error(`account ${user}: its machine ${agent} was not revoked: ${String(error)}`));
}
