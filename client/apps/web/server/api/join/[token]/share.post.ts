import { askInviteShare } from "../../../utils/account-service";
import { joinShareFailure } from "../../../utils/invites";
import { followShare } from "../../../utils/machine-shares";

import { wording } from "#shared/wording";

import type { ShareAnswer } from "@web/server-client";

// The invitation's account asks to share the machine another agent holds on the person's PC, with no sign-in (docs/web.md,
// 「The join page」; docs/accounts.md, 「A machine shared at an invitation's ask」). The account the browser is signed in
// to, where it is, is named as the owner, so a machine of the asker's own binds at once.
export default defineEventHandler(async (event): Promise<ShareAnswer> => {
  const body = await readBody<{ machine?: unknown } | null>(event);
  const machine = typeof body?.machine === "string" ? body.machine.trim() : "";

  if (machine === "") throw fail(400, wording("join.error.share_empty"));

  const session = await getUserSession(event).catch(() => null);
  const owner = typeof session?.user?.id === "number" ? String(session.user.id) : null;

  try {
    const answer = await askInviteShare(String(getRouterParam(event, "token") ?? ""), machine, owner);

    await followShare(answer);

    return answer;
  } catch (error) {
    throw joinShareFailure(error);
  }
});
