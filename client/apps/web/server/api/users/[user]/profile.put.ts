import { wording } from "#shared/wording";

import { followPersonName } from "../../../utils/account-standing";
import { followSessionName } from "../../../utils/accounts";

import type { UserProfile } from "#shared/types";

// A user's person's name, job title and contact details written whole (docs/accounts.md, 「Users and senders」):
// the account's holder or an administrator keeps them, and an empty field clears what it held. The values are
// handed to the service as they read, and its answer is the profile as it now stands. A changed name is followed
// by the person's own BMO and its room (docs/web.md, 「The join page」), and by the session where it is the
// reader's own.
export default defineEventHandler(async (event): Promise<UserProfile> => {
  const signed = await signedInUser(event);
  const user = profileUser(getRouterParam(event, "user"));

  if (user === null) throw fail(400, wording("common.error.bad_action"));
  if (!mayKeepProfile(signed, user)) throw fail(403, wording("account.error.profile_forbidden"));

  const body = await readBody<Record<string, unknown>>(event);
  const profile = profileAsked(body);

  if (profile === null) throw fail(400, wording("account.error.profile_shape"));

  const caller = profileCaller(signed);
  const before = (await profileOf(user, caller)).fullName;
  const saved = await setProfile(user, profile, caller);

  if (saved.fullName !== before) {
    await followPersonName(user, before).catch((error: unknown) => console.error(`account ${user}: its BMO could not follow its name: ${String(error)}`));
    if (signed.id === user) await followSessionName(event, saved.fullName);
  }

  return saved;
});
