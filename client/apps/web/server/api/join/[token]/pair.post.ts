import { approveInvitePairing } from "../../../utils/account-service";
import { joinPairingFailure } from "../../../utils/invites";

import { wording } from "#shared/wording";

import type { PairingApproved } from "@web/server-client";

// The desktop app's pairing approved with the invitation, for the account it made while that account waits for its
// machine (docs/web.md, 「The join page」; docs/accounts.md, 「Desktop pairing」): the code the person typed from the
// app's title bar, handed on as the service reads it, in either case and with or without its hyphen.
export default defineEventHandler(async (event): Promise<PairingApproved> => {
  const body = await readBody<{ code?: unknown }>(event);
  const code = typeof body?.code === "string" ? body.code.trim() : "";

  if (code === "") throw fail(400, wording("join.error.code_empty"));

  try {
    return await approveInvitePairing(String(getRouterParam(event, "token") ?? ""), code);
  } catch (error) {
    throw joinPairingFailure(error);
  }
});
