import { wording } from "#shared/wording";

import type { RoleView } from "#shared/axes";

// One role's fields changed, the rest kept; an emptied prompt or description is a cleared one (the agency's
// `docs/api.md`, 「roles」).
export default defineEventHandler(async (event): Promise<RoleView> => {
  await signedInUser(event);

  const name = axisName(getRouterParam(event, "name"));
  const change = roleChangeOf(await readBody<unknown>(event), false);

  if (change === null) throw fail(400, wording("common.error.bad_action"));

  return await changeRole(name, change, event);
});
