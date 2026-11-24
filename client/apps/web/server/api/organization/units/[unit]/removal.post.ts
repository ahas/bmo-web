import { wording } from "#shared/wording";

import { unitRemoval } from "../../../../utils/account-service";
import { organizationFailure } from "../../../../utils/organization";
import { removalFailureLines, removalOutcome, runUnitRemoval } from "../../../../utils/removal";

import type { RemovalOutcome } from "#shared/removal";

// A unit and every unit under it deleted for good, its people's accounts first where `withPeople` asks for it, once
// `confirm` is the unit's name typed exactly: the platform administrator's alone (docs/web.md, the organisation screen's permanent delete). The
// cascade runs to its end or to the unit that stopped it, and running it again resumes it.
export default defineEventHandler(async (event): Promise<RemovalOutcome> => {
  const signed = await requireAdministrator(event);
  const unit = Number(getRouterParam(event, "unit"));
  const body: unknown = await readBody(event).catch(() => null);
  const confirm = typeof body === "object" && body !== null ? Reflect.get(body, "confirm") : null;
  const withPeople = typeof body === "object" && body !== null && Reflect.get(body, "withPeople") === true;

  if (!Number.isSafeInteger(unit) || unit <= 0) throw fail(400, wording("organization.error.bad_request"));

  const context = { administrator: String(signed.id ?? "") };

  try {
    const plan = await unitRemoval(unit, context.administrator);

    if (plan === null) return { finished: true, already: true, refusal: null, steps: [], people: [] };
    if (confirm !== plan.name) throw fail(400, wording("removal.error.confirm"));

    const run = await runUnitRemoval(unit, { withPeople }, context);

    for (const line of removalFailureLines(run, `unit ${unit}`)) console.warn(line);

    return removalOutcome(run);
  } catch (error) {
    throw organizationFailure(error);
  }
});
