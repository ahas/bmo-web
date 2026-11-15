import { signedInUser } from "./accounts";
import { agency, agencyCall } from "./agency";
import { supervisorOwner } from "./axes";

import type { components } from "@agency/client/schema";
import type { H3Event } from "h3";

// Whose agents a signed-in user reads (docs/web.md, 「Access」): an agent's log, its turns, its job lines and its own
// settings quote what was said in its rooms, a person's private room with their own BMO among them, so the
// administrator reads every agent's, and anyone else the agents their own account owns alone — their own BMO, and an
// agent of a role standing as theirs. Every other agent answers them as if it did not stand. The agency names the
// account each supervisor and each role agent is filed under (its `docs/api.md`, 「Role agents」), and a supervisor it
// names none for is owned as `supervisorOwner` says.

type Schemas = components["schemas"];

// A role agent as the agency answers it, with the account it is filed under, which its published schema leaves out.
type HeldAgent = Schemas["RoleAgent"] & { ownerAccount?: string | null };

/** Whether the account owns the agent of this name: a supervisor filed under it, or a role agent. */
export async function ownsAgent(account: number, name: string): Promise<boolean> {
  const [supervisors, roles] = await Promise.all([agencyCall(agency().GET("/supervisors")), agencyCall(agency().GET("/roles"))]);

  if (supervisors.items.some((supervisor) => supervisor.name === name && supervisorOwner(supervisor) === account)) return true;

  return roles.roles.some((role) => ((role.agents ?? []) as HeldAgent[]).some((agent) => agent.name === name && agent.ownerAccount === String(account)));
}

/** An agent the signed-in user may read, or a refusal answering as if it did not stand. */
export async function requireReadableAgent(event: H3Event, name: string): Promise<void> {
  const signed = await signedInUser(event);

  if (signed.administrator) return;
  if (signed.id === null || !(await ownsAgent(signed.id, name).catch(() => false))) {
    throw createError({ statusCode: 404, statusMessage: "Not Found" });
  }
}
