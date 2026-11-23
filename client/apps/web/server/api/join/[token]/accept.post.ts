import { acceptInvite } from "../../../utils/account-service";
import { inviteFailure } from "../../../utils/invites";

import { MAX_LOGIN_LENGTH, MIN_LOGIN_LENGTH, loginOf } from "#shared/logins";
import { wording } from "#shared/wording";

import type { Accepted } from "@web/server-client";

const text = (value: unknown): string => (typeof value === "string" ? value : "");

// An invitation accepted with a login, the person's name and a password, with no sign-in (docs/web.md, 「The join
// page」). The login is read by the rule the sign-in reads it by (shared/logins.ts), so every login an invitation
// makes signs in. A call that gives no name leaves the account the name the invitation was made with.
export default defineEventHandler(async (event): Promise<Accepted> => {
  const body = await readBody<{ name?: unknown; password?: unknown; fullName?: unknown }>(event);
  const name = loginOf(body?.name);

  if (name === null) {
    throw fail(400, wording("account.error.user_name_shape", { min: MIN_LOGIN_LENGTH, max: MAX_LOGIN_LENGTH }));
  }

  try {
    return await acceptInvite(String(getRouterParam(event, "token") ?? ""), { name, password: text(body?.password), fullName: text(body?.fullName).trim() });
  } catch (error) {
    throw inviteFailure(error);
  }
});
