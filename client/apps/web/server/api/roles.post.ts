import { wording } from "#shared/wording";

import type { RoleView } from "#shared/axes";

// A role added, for a reader who may write the roles tab (the agency's `docs/api.md`, 「roles」). The body is checked for its shape alone;
// whether the values stand is the agency's to say, and a refused field is said under that field.
export default defineEventHandler(async (event): Promise<RoleView> => {
  await signedInUser(event);

  const change = roleChangeOf(await readBody<unknown>(event), true);

  if (change === null) throw fail(400, wording("common.error.bad_action"));

  return await addRole(change);
});
