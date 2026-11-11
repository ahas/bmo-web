import { proveInvite } from "../../../utils/account-service";
import { standAccount } from "../../../utils/account-standing";
import { inviteFailure } from "../../../utils/invites";

import type { Proof } from "@web/server-client";

// Whether the invited person's machine is attached, the account enabled where it is, and an account made ready
// given its own BMO and its agents (docs/web.md, 「The join page」).
export default defineEventHandler(async (event): Promise<Proof> => {
  let proof: Proof;

  try {
    proof = await proveInvite(String(getRouterParam(event, "token") ?? ""));
  } catch (error) {
    throw inviteFailure(error);
  }

  if (proof.active && typeof proof.user === "string" && /^\d+$/.test(proof.user)) await standAccount(Number(proof.user));

  return proof;
});
