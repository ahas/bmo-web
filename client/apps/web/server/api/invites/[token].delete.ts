import { dropInvite } from "../../utils/account-service";
import { inviteFailure } from "../../utils/invites";
import { callerOf } from "../../utils/organization";

// An invitation taken back by whoever made it, or the administrator (docs/web.md, 「Organisation settings」, the
// invitations tab).
export default defineEventHandler(async (event): Promise<null> => {
  const signed = await signedInUser(event);

  try {
    await dropInvite(String(getRouterParam(event, "token") ?? ""), callerOf(signed));
    setResponseStatus(event, 204);

    return null;
  } catch (error) {
    throw inviteFailure(error);
  }
});
