import { unbindNode } from "../../../../utils/account-service";
import { MACHINE_CODES, callerOf, organizationFailure } from "../../../../utils/organization";
import { dropPersonNode, heldTogether } from "../../../../utils/person-node";

// A person's account bound to no machine any more, and its node taken away in agency; where agency refuses, the
// account stays bound as it was (docs/web.md, 「Organisation settings」, the units tab; docs/accounts.md,
// 「Invitations and a person's machine」).
export default defineEventHandler(async (event): Promise<void> => {
  const signed = await requireAdministrator(event);
  const user = String(getRouterParam(event, "user") ?? "");
  const caller = callerOf(signed);

  try {
    await heldTogether(
      user,
      caller,
      () => unbindNode(user, caller),
      () => dropPersonNode(user)
    );
  } catch (error) {
    throw organizationFailure(error, MACHINE_CODES);
  }

  setResponseStatus(event, 204);
});
