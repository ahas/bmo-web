import { isError } from "h3";

import { AccountRefusal, AccountServiceDown } from "../../../utils/account-service";
import { callerOf } from "../../../utils/organization";
import { unlinkMachine } from "../../../utils/person-node";
import { fail } from "../../../utils/fail";
import { ownerKeyOf } from "../../../utils/owner-key";

import { wording } from "#shared/wording";

// The reader's own machine taken away from their account, from the settings' machine section (docs/web.md,
// 「Settings」, the machine section; docs/accounts.md, 「Invitations and a person's machine」). The route names no
// user: the account is the reader's own, so no one reaches another person's machine through it.
export default defineEventHandler(async (event): Promise<void> => {
  const signed = await signedInUser(event);
  const key = ownerKeyOf(signed);

  if (key === null) throw fail(404, wording("machines.error.no_account"));

  try {
    await unlinkMachine(key, callerOf(signed));
  } catch (error) {
    throw unlinkFailure(error);
  }

  setResponseStatus(event, 204);
});

// What the unlinking came to, in the section's words; agency's refusal is already said in the pack's and goes on as
// it stands.
function unlinkFailure(error: unknown): Error {
  if (isError(error)) return error;
  if (error instanceof AccountServiceDown) return fail(503, wording("machines.error.unreachable"));
  if (error instanceof AccountRefusal && error.code === "not-found") return fail(404, wording("machines.error.none_bound"));

  return fail(error instanceof AccountRefusal ? 502 : 500, wording("machines.error.unbind_failed"));
}
