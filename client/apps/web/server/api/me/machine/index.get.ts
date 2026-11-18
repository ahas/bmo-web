import { AccountServiceDown, userNode } from "../../../utils/account-service";
import { fail } from "../../../utils/fail";

import { wording } from "#shared/wording";

import type { UserNode } from "@web/server-client";

// The machine the reader's own account is connected to, for the settings' machine section (docs/web.md, 「Settings」,
// the machine section): read alone, so opening the section records no proof. A login with no user of the account service has none.
export default defineEventHandler(async (event): Promise<UserNode> => {
  const key = ownerKeyOf(await signedInUser(event));

  if (key === null) throw fail(404, wording("machines.error.no_account"));

  try {
    return await userNode(key);
  } catch (error) {
    throw fail(error instanceof AccountServiceDown ? 503 : 502, wording(error instanceof AccountServiceDown ? "machines.error.unreachable" : "machines.error.failed"));
  }
});
