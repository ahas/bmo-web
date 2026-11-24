import { wording } from "#shared/wording";

import { accountRemovalPreview } from "../../../../utils/removal";
import { organizationFailure } from "../../../../utils/organization";

import type { AccountRemovalView } from "#shared/removal";

// What deleting a person's account for good would take now, unit by unit, with nothing changed: the platform
// administrator's alone (docs/web.md, the organisation screen's permanent delete).
export default defineEventHandler(async (event): Promise<AccountRemovalView> => {
  const signed = await requireAdministrator(event);
  const user = String(getRouterParam(event, "user") ?? "");

  if (!/^\d+$/.test(user)) throw fail(400, wording("organization.error.bad_request"));

  let preview: Awaited<ReturnType<typeof accountRemovalPreview>>;

  try {
    preview = await accountRemovalPreview(user, { administrator: String(signed.id ?? "") });
  } catch (error) {
    throw organizationFailure(error);
  }

  if (preview === null) throw fail(404, wording("organization.error.not_found"));

  const { plan, units } = preview;

  return {
    user: plan.user,
    name: plan.fullName === "" ? plan.name : plan.fullName,
    login: plan.name,
    left: plan.left,
    refusal: plan.refusal ?? null,
    units
  };
});
