import { wording } from "#shared/wording";

import { listUsers, setPlatformBmo } from "../../../utils/account-service";
import { standOwnBmos } from "../../../utils/bmo-profile";
import { bmoFailure } from "../../../utils/bmo-routes";
import { callerOf } from "../../../utils/organization";

import type { CompanyBmoView } from "#shared/bmo-profile";

// The platform's own default name and call names saved, the administrator's, then applied to every person's BMO, since
// any company setting none follows it (docs/web.md, 「System and organisation」, the agents tab with the platform chosen).
export default defineEventHandler(async (event): Promise<CompanyBmoView> => {
  const signed = await requireAdministrator(event);
  const body = await readBody<{ name?: unknown; callNames?: unknown }>(event);

  if (typeof body !== "object" || body === null || !Array.isArray(body.callNames)) throw fail(400, wording("bmo_profile.error.bad_profile"));

  const name = typeof body.name === "string" && body.name.trim() !== "" ? body.name.trim() : null;
  const callNames = body.callNames.filter((one): one is string => typeof one === "string");

  try {
    const caller = callerOf(signed);
    const saved = await setPlatformBmo({ name, callNames }, caller);

    standOwnBmos((await listUsers(caller)).map((one) => Number(one.user)).filter((user) => Number.isSafeInteger(user)));

    return saved;
  } catch (error) {
    throw bmoFailure(error);
  }
});
