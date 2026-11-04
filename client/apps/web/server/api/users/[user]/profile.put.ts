import { wording } from "#shared/wording";

import type { UserProfile } from "#shared/types";

// A user's job title and contact details written whole (docs/accounts.md, 「Users and senders」): the account's
// holder or an administrator keeps them, and an empty field clears what it held. The values are handed to the
// service as they read, and its answer is the profile as it now stands.
export default defineEventHandler(async (event): Promise<UserProfile> => {
  const signed = await signedInUser(event);
  const user = profileUser(getRouterParam(event, "user"));

  if (user === null) throw fail(400, wording("common.error.bad_action"));
  if (!mayKeepProfile(signed, user)) throw fail(403, wording("account.error.profile_forbidden"));

  const body = await readBody<Record<string, unknown>>(event);
  const profile = profileAsked(body);

  if (profile === null) throw fail(400, wording("account.error.profile_shape"));

  return await setProfile(user, profile, profileCaller(signed));
});
