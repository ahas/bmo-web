import { wording } from "#shared/wording";

import type { RepositoryView } from "#shared/axes";

// One repository's fields changed, the rest kept (the agency's `docs/api.md`, 「repositories, prefix-checks and
// room-holdings」).
export default defineEventHandler(async (event): Promise<RepositoryView> => {
  await signedInUser(event);

  const name = axisName(getRouterParam(event, "name"));
  const change = repositoryChangeOf(await readBody<unknown>(event), false);

  if (change === null) throw fail(400, wording("common.error.bad_action"));

  return await changeRepository(name, change);
});
