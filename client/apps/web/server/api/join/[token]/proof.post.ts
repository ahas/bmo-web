import { proveInvite } from "../../../utils/account-service";
import { standAccount } from "../../../utils/account-standing";
import { agentLoginNeeded } from "../../../utils/agent-login";
import { inviteFailure } from "../../../utils/invites";

import type { Proof } from "@web/server-client";

// Whether the invited person's machine is attached, the account enabled where it is, an account made ready given its
// own BMO and its agents, and whether it must set up a login of its own before it starts (docs/web.md, 「The join
// page」).
export default defineEventHandler(async (event): Promise<Proof & { agentLogin: boolean }> => {
  let proof: Proof;

  try {
    proof = await proveInvite(String(getRouterParam(event, "token") ?? ""));
  } catch (error) {
    throw inviteFailure(error);
  }

  const user = proof.active && typeof proof.user === "string" && /^\d+$/.test(proof.user) ? Number(proof.user) : null;

  if (user === null) return { ...proof, agentLogin: false };

  await standAccount(user);

  return { ...proof, agentLogin: await agentLoginNeeded(user) };
});
