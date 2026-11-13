import { movePeople } from "../../../../utils/account-service";
import { fail } from "../../../../utils/fail";
import { MOVE_CODES, callerOf, organizationFailure, unitNumber } from "../../../../utils/organization";

import { wording } from "#shared/wording";

import type { PersonMove, Unit } from "@web/server-client";

// Several people moved into a unit in one act, each its head or a member, each named with the unit they stood in when
// the move was shown (docs/web.md, 「Organisation settings」, the units tab).
export default defineEventHandler(async (event): Promise<Unit> => {
  const signed = await requireAdministrator(event);
  const unit = unitNumber(getRouterParam(event, "unit"));
  const body = await readBody<{ people?: unknown }>(event);

  try {
    return await movePeople(unit, peopleOf(body?.people), callerOf(signed));
  } catch (error) {
    throw organizationFailure(error, MOVE_CODES);
  }
});

function peopleOf(asked: unknown): PersonMove[] {
  if (!Array.isArray(asked) || asked.length === 0) throw fail(400, wording("organization.error.bad_request"));

  return asked.map((person: { user?: unknown; from?: unknown; head?: unknown } | null) => {
    if (typeof person?.user !== "string" || typeof person.head !== "boolean") throw fail(400, wording("organization.error.bad_request"));

    return { user: person.user, from: unitNumber(person.from), head: person.head };
  });
}
