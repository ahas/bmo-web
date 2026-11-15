import { proveNode } from "../../../utils/account-service";
import { setPersonNode } from "../../../utils/person-node";
import { pairingFailure } from "../../../utils/pairings";

import type { UserNode } from "@web/server-client";

// Whether the reader's own machine has attached; attached, it is recorded as proven and set as their node in agency,
// as the organisation screen's check does (docs/web.md, 「The desktop pairing page」). Nobody reads agency's refusal
// on the page, so it goes to the log, as at a sign-in.
export default defineEventHandler(async (event): Promise<UserNode> => {
  const key = ownerKeyOf(await signedInUser(event));
  let machine: UserNode;

  if (key === null) throw pairingFailure(null);

  try {
    machine = await proveNode(key);
  } catch (error) {
    throw pairingFailure(error);
  }

  if (typeof machine.agent === "string" && machine.attached) {
    await setPersonNode(key, machine.agent).catch((error: unknown) => console.error(`account ${key}: its node could not be set: ${String(error)}`));
  }

  return machine;
});
