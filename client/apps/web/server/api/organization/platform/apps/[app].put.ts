import { wording } from "#shared/wording";

import { appParam, appWord, appsFailure, changePlatformApp } from "../../../../utils/apps";
import { fail } from "../../../../utils/fail";

import type { PlatformAppChange } from "#shared/apps";

// The platform's own word on an app changed: `offered` and `on`, each true, false, or null to follow the app's
// publisher, and `locks`, its lock on the app's on, each where the body names it (docs/web.md, 「System and organisation」, the
// apps tab): the administrator's.
export default defineEventHandler(async (event): Promise<null> => {
  const signed = await requireAdministrator(event);
  const app = appParam(getRouterParam(event, "app"));
  const body = (await readBody<Record<string, unknown>>(event)) ?? {};
  const change: PlatformAppChange = {};

  if ("offered" in body) change.offered = appWord(body.offered);
  if ("on" in body) change.on = appWord(body.on);
  if ("locks" in body) {
    if (typeof body.locks !== "boolean") throw fail(400, wording("organization.error.bad_request"));

    change.locks = body.locks;
  }

  try {
    await changePlatformApp(app, change, signed);

    return null;
  } catch (error) {
    throw appsFailure(error);
  }
});
