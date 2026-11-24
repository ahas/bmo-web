import { wording } from "#shared/wording";

import { accountRemoval } from "../../../../utils/account-service";
import { organizationFailure } from "../../../../utils/organization";
import { removalFailureLines, removalOutcome, runAccountRemoval } from "../../../../utils/removal";

import type { RemovalOutcome } from "#shared/removal";

// A person's account deleted for good, marked left first where `leave` asks for it, once `confirm` is the name the
// person is shown by, typed exactly: the platform administrator's alone (docs/web.md, the organisation screen's permanent delete). The cascade runs to
// its end or to the unit that stopped it, and running it again resumes it.
export default defineEventHandler(async (event): Promise<RemovalOutcome> => {
  const signed = await requireAdministrator(event);
  const user = String(getRouterParam(event, "user") ?? "");
  const body: unknown = await readBody(event).catch(() => null);
  const confirm = typeof body === "object" && body !== null ? Reflect.get(body, "confirm") : null;
  const leave = typeof body === "object" && body !== null && Reflect.get(body, "leave") === true;

  if (!/^\d+$/.test(user)) throw fail(400, wording("organization.error.bad_request"));

  const context = { administrator: String(signed.id ?? "") };

  try {
    const plan = await accountRemoval(user, context.administrator);

    if (plan === null) return { finished: true, already: true, refusal: null, steps: [], people: [] };

    const shown = plan.fullName === "" ? plan.name : plan.fullName;

    if (confirm !== shown) throw fail(400, wording("removal.error.confirm"));

    const run = await runAccountRemoval(user, { leave }, context);

    for (const line of removalFailureLines(run, `account ${user}`)) console.warn(line);

    return removalOutcome(run);
  } catch (error) {
    throw organizationFailure(error);
  }
});
