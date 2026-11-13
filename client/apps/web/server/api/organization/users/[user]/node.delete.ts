import { unbindNode } from "../../../../utils/account-service";
import { MACHINE_CODES, callerOf, organizationFailure } from "../../../../utils/organization";
import { dropPersonNode } from "../../../../utils/person-node";

// A person's account bound to no machine any more, and its node taken away in agency (docs/web.md, 「Organisation
// settings」, the units tab; docs/accounts.md, 「Invitations and a person's machine」).
export default defineEventHandler(async (event): Promise<void> => {
  const signed = await requireAdministrator(event);
  const user = String(getRouterParam(event, "user") ?? "");

  try {
    await unbindNode(user, callerOf(signed));
  } catch (error) {
    throw organizationFailure(error, MACHINE_CODES);
  }

  await dropPersonNode(user);
  setResponseStatus(event, 204);
});
