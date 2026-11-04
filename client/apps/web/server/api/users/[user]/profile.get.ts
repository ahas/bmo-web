import { wording } from "#shared/wording";

import type { UserProfile } from "#shared/types";

// A user's job title and contact details (docs/accounts.md, 「Users and senders」): the account's holder or an
// administrator reads them, as the signed-in login's own user and role are handed on to the service.
export default defineEventHandler(async (event): Promise<UserProfile> => {
  const signed = await signedInUser(event);
  const user = profileUser(getRouterParam(event, "user"));

  if (user === null) throw fail(400, wording("common.error.bad_action"));
  if (!mayKeepProfile(signed, user)) throw fail(403, wording("account.error.profile_forbidden"));

  return await profileOf(user, profileCaller(signed));
});
