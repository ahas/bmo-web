import { wording } from "#shared/wording";

import { appParam, appWord, appsFailure, changeUnitApp } from "../../../../../utils/apps";
import { fail } from "../../../../../utils/fail";
import { unitNumber } from "../../../../../utils/organization";

import type { UnitAppChange } from "#shared/apps";

// A unit's word on an app changed: `on` (true, false, or null to follow above), `locks`, and the administrator's
// `offer` (true, false, or null to take the platform's rule for the unit away), each where the body names it
// (docs/web.md, 「Organisation」, the apps tab). Who writes the link, and a lock above it, are the account service's word.
export default defineEventHandler(async (event): Promise<null> => {
  const unit = unitNumber(getRouterParam(event, "unit"));
  const app = appParam(getRouterParam(event, "app"));
  const body = (await readBody<Record<string, unknown>>(event)) ?? {};
  const change: UnitAppChange = {};

  if ("on" in body) change.on = appWord(body.on);
  if ("offer" in body) change.offer = appWord(body.offer);
  if ("locks" in body) {
    if (typeof body.locks !== "boolean") throw fail(400, wording("organization.error.bad_request"));

    change.locks = body.locks;
  }

  try {
    await changeUnitApp(unit, app, change, await signedInUser(event));

    return null;
  } catch (error) {
    throw appsFailure(error);
  }
});
