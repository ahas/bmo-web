import { shareNode } from "../../../../../utils/account-service";
import { fail } from "../../../../../utils/fail";
import { SHARING_CODES, callerOf, organizationFailure } from "../../../../../utils/organization";
import { heldTogether, setPersonNode } from "../../../../../utils/person-node";

import { wording } from "#shared/wording";

import type { UserNode } from "@web/server-client";

// A person's machine declared shared with other accounts, or no longer shared, so a second account may be bound to
// it; agency's record follows at once where the hub holds the machine, and otherwise at its proof. A declaration
// agency refuses leaves the binding as it was (docs/web.md, 「Organisation settings」, the units tab; docs/accounts.md,
// 「Invitations and a person's machine」).
export default defineEventHandler(async (event): Promise<UserNode> => {
  const signed = await requireAdministrator(event);
  const user = String(getRouterParam(event, "user") ?? "");
  const body = await readBody<{ shared?: unknown } | null>(event);

  if (typeof body?.shared !== "boolean") throw fail(400, wording("organization.error.bad_request"));

  const shared = body.shared;
  const caller = callerOf(signed);

  try {
    return await heldTogether(
      user,
      caller,
      () => shareNode(user, shared, caller),
      async (node) => {
        if (typeof node.agent === "string" && node.attached) await setPersonNode(user, node.agent, node.shared);
      }
    );
  } catch (error) {
    throw organizationFailure(error, SHARING_CODES);
  }
});
