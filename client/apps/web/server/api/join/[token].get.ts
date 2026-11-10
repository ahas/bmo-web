import { inviteView } from "../../utils/account-service";
import { fail } from "../../utils/fail";
import { inviteFailure } from "../../utils/invites";

import { wording } from "#shared/wording";

import type { InviteView } from "@web/server-client";

// An invitation as its link shows it, read with no sign-in (docs/web.md, 「The join page」).
export default defineEventHandler(async (event): Promise<InviteView> => {
  let view: InviteView | null;

  try {
    view = await inviteView(String(getRouterParam(event, "token") ?? ""));
  } catch (error) {
    throw inviteFailure(error);
  }

  if (view === null) throw fail(404, wording("invites.error.not_found"));

  return view;
});
