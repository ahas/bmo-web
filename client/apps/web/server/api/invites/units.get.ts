import { inviteUnits } from "../../utils/account-service";
import { inviteFailure } from "../../utils/invites";
import { callerOf } from "../../utils/organization";

// The units the reader may invite into (docs/web.md, 「Organisation settings」, the invitations tab).
export default defineEventHandler(async (event): Promise<{ id: number; name: string }[]> => {
  const signed = await signedInUser(event);

  try {
    return await inviteUnits(callerOf(signed));
  } catch (error) {
    throw inviteFailure(error);
  }
});
