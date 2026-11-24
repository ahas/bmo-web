import { inviteShare } from "../../../utils/account-service";
import { joinShareFailure } from "../../../utils/invites";

import type { ShareAskState } from "@web/server-client";

// The invitation's account's ask to share a machine as it stands, null where it asked for none (docs/web.md, 「The join
// page」).
export default defineEventHandler(async (event): Promise<ShareAskState | null> => {
  try {
    return await inviteShare(String(getRouterParam(event, "token") ?? ""));
  } catch (error) {
    throw joinShareFailure(error);
  }
});
