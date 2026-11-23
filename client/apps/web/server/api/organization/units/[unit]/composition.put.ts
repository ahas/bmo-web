import { wording } from "#shared/wording";

import { signedInUser } from "../../../../utils/accounts";
import { unitNumber } from "../../../../utils/organization";
import { changeComposition, isDelegation, orgAgentsFailure } from "../../../../utils/organisation-supply";

import type { CompositionChoice } from "#shared/organisation-supply";

// A unit's word on one role, and the composition's delegation (docs/web.md, 「Organisation」, the BMO tab): `role` with
// `choice` — `{ off: true }`, `{ agents: n }` or null to follow above — and `delegation`, either or both.
export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  const unit = unitNumber(getRouterParam(event, "unit"));
  const body = await readBody<{ role?: unknown; choice?: unknown; delegation?: unknown }>(event).catch(() => ({}) as Record<string, unknown>);
  const role = typeof body?.role === "string" && body.role !== "" ? body.role : undefined;
  const choice = choiceIn(body?.choice);
  const delegation = isDelegation(body?.delegation) ? body.delegation : undefined;

  if ((role === undefined || choice === undefined) && delegation === undefined) throw fail(400, wording("organization.error.bad_request"));

  try {
    await changeComposition(event, unit, { role, choice: role === undefined ? undefined : choice, delegation }, await signedInUser(event));
  } catch (error) {
    throw orgAgentsFailure(error);
  }

  return { ok: true };
});

// A role's word as the screen sends it, undefined where it is none of the three.
function choiceIn(value: unknown): CompositionChoice | null | undefined {
  if (value === null) return null;
  if (typeof value !== "object") return undefined;

  const said = value as { off?: unknown; agents?: unknown };

  if (said.off === true) return { off: true };
  if (typeof said.agents === "number" && Number.isInteger(said.agents) && said.agents >= 0 && said.agents <= 8) return { agents: said.agents };

  return undefined;
}
