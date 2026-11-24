import { approveMachineShare } from "../../../../utils/account-service";
import { shareDecisionFailure } from "../../../../utils/invites";
import { followShare } from "../../../../utils/machine-shares";
import { callerOf } from "../../../../utils/organization";

import type { ShareAnswer } from "@web/server-client";

// An ask to share a machine approved by the administrator or a head of everyone on it, the share bound and followed
// into agency (docs/web.md, 「Organisation settings」, the invitations tab).
export default defineEventHandler(async (event): Promise<ShareAnswer> => {
  const signed = await signedInUser(event);

  try {
    const answer = await approveMachineShare(String(getRouterParam(event, "user") ?? ""), callerOf(signed));

    await followShare(answer);

    return answer;
  } catch (error) {
    throw shareDecisionFailure(error);
  }
});
