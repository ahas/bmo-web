import { MACHINE_CODES, organizationFailure } from "../../../../../utils/organization";
import { settleMachine } from "../../../../../utils/person-node";

import type { UserNode } from "@web/server-client";

// Whether the machine a person's account was bound to has attached; attached, it is recorded as proven and set as
// their node in agency (docs/web.md, 「Settings」, the organisation section).
export default defineEventHandler(async (event): Promise<UserNode> => {
  await requireAdministrator(event);
  const user = String(getRouterParam(event, "user") ?? "");
  let machine: UserNode;

  try {
    machine = await settleMachine(user);
  } catch (error) {
    throw organizationFailure(error, MACHINE_CODES);
  }

  return machine;
});
