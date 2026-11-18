import { MACHINE_CODES, callerOf, organizationFailure } from "../../../../utils/organization";
import { unlinkMachine } from "../../../../utils/person-node";

// A person's account bound to no machine any more, its node taken away in agency and the machine sent a leave; where
// agency refuses, the account stays bound as it was (docs/web.md, 「Organisation settings」, the units tab;
// docs/accounts.md, 「Invitations and a person's machine」).
export default defineEventHandler(async (event): Promise<void> => {
  const signed = await requireAdministrator(event);
  const user = String(getRouterParam(event, "user") ?? "");

  try {
    await unlinkMachine(user, callerOf(signed));
  } catch (error) {
    throw organizationFailure(error, MACHINE_CODES);
  }

  setResponseStatus(event, 204);
});
