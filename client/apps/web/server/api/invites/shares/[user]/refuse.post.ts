import { refuseMachineShare } from "../../../../utils/account-service";
import { shareDecisionFailure } from "../../../../utils/invites";
import { callerOf } from "../../../../utils/organization";

// An ask to share a machine refused by the administrator or a head of everyone on it (docs/web.md, 「Organisation
// settings」, the invitations tab).
export default defineEventHandler(async (event): Promise<null> => {
  const signed = await signedInUser(event);

  try {
    await refuseMachineShare(String(getRouterParam(event, "user") ?? ""), callerOf(signed));
    setResponseStatus(event, 204);

    return null;
  } catch (error) {
    throw shareDecisionFailure(error);
  }
});
