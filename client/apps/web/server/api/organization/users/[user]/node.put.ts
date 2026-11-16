import { rebindNode } from "../../../../utils/account-service";
import { MACHINE_CODES, callerOf, organizationFailure } from "../../../../utils/organization";
import { heldTogether, setPersonNode } from "../../../../utils/person-node";

import type { Rebound } from "@web/server-client";

// A person's account bound to another machine, the one named or a fresh name, shared where the body says so, and set
// as their node in agency at once where the hub holds it already; otherwise the proof sets it once it attaches. A
// machine agency refuses leaves the account bound as it was (docs/web.md, 「Organisation settings」, the units tab;
// docs/accounts.md, 「Invitations and a person's machine」).
export default defineEventHandler(async (event): Promise<Rebound> => {
  const signed = await requireAdministrator(event);
  const user = String(getRouterParam(event, "user") ?? "");
  const body = await readBody<{ agent?: unknown; shared?: unknown } | null>(event);
  const agent = typeof body?.agent === "string" && body.agent.trim() !== "" ? body.agent.trim() : null;
  const shared = body?.shared === true;
  const caller = callerOf(signed);

  try {
    return await heldTogether(
      user,
      caller,
      () => rebindNode(user, agent, shared, caller),
      async (rebound) => {
        if (rebound.attached) await setPersonNode(user, rebound.agent, rebound.shared);
      }
    );
  } catch (error) {
    throw organizationFailure(error, MACHINE_CODES);
  }
});
