import { acceptInvite } from "../../../utils/account-service";
import { inviteFailure } from "../../../utils/invites";

import type { Accepted } from "@web/server-client";

const text = (value: unknown): string => (typeof value === "string" ? value : "");

// An invitation accepted with a login, the person's name and a password, with no sign-in (docs/web.md, 「The join
// page」). A call that gives no name leaves the account the name the invitation was made with.
export default defineEventHandler(async (event): Promise<Accepted> => {
  const body = await readBody<{ name?: unknown; password?: unknown; fullName?: unknown }>(event);

  try {
    return await acceptInvite(String(getRouterParam(event, "token") ?? ""), { name: text(body?.name), password: text(body?.password), fullName: text(body?.fullName).trim() });
  } catch (error) {
    throw inviteFailure(error);
  }
});
