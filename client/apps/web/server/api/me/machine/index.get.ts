import { AccountServiceDown, userNode } from "../../../utils/account-service";
import { fail } from "../../../utils/fail";
import { nodeRetrying, nodeSettled, standPersonNode } from "../../../utils/person-node";

import { wording } from "#shared/wording";

import type { UserNode } from "@web/server-client";

// The machine the reader's own account is connected to, for the settings' machine section (docs/web.md, 「Settings」,
// the machine section): read alone, so opening the section records no proof. A login with no user of the account service has none.
// While the hub holds it, whether agency's record names it as the account's node is read beside it, as `nodeSettled`,
// and a record that does not is asked for.
export default defineEventHandler(async (event): Promise<UserNode & { nodeSettled?: boolean }> => {
  const key = ownerKeyOf(await signedInUser(event));

  if (key === null) throw fail(404, wording("machines.error.no_account"));

  let machine: UserNode;

  try {
    machine = await userNode(key);
  } catch (error) {
    throw fail(error instanceof AccountServiceDown ? 503 : 502, wording(error instanceof AccountServiceDown ? "machines.error.unreachable" : "machines.error.failed"));
  }

  if (typeof machine.agent !== "string" || !machine.attached) return machine;

  const settled = await nodeSettled(key, machine.agent);

  // A record that does not name the machine, with no ask running, is asked for now, as a sign-in would.
  if (settled === false && !nodeRetrying(key)) {
    void standPersonNode(key).catch((error: unknown) => console.error(`account ${key}: its node could not be set: ${String(error)}`));
  }

  return settled === null ? machine : { ...machine, nodeSettled: settled };
});
