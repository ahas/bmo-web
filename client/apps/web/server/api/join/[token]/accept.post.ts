import { acceptInvite } from "../../../utils/account-service";
import { inviteFailure } from "../../../utils/invites";

import type { Accepted } from "@web/server-client";

// An invitation accepted with a name and a password, with no sign-in (docs/web.md, 「The join page」).
export default defineEventHandler(async (event): Promise<Accepted> => {
  const body = await readBody<{ name?: unknown; password?: unknown }>(event);

  try {
    return await acceptInvite(
      String(getRouterParam(event, "token") ?? ""),
      typeof body?.name === "string" ? body.name : "",
      typeof body?.password === "string" ? body.password : ""
    );
  } catch (error) {
    throw inviteFailure(error);
  }
});
