import { proveInvite } from "../../../utils/account-service";
import { inviteFailure } from "../../../utils/invites";

import type { Proof } from "@web/server-client";

// Whether the invited person's machine is attached, the account enabled where it is (docs/web.md, 「The join page」).
export default defineEventHandler(async (event): Promise<Proof> => {
  try {
    return await proveInvite(String(getRouterParam(event, "token") ?? ""));
  } catch (error) {
    throw inviteFailure(error);
  }
});
