import { wording } from "#shared/wording";

import type { RepositoryView } from "#shared/axes";

// A repository added, for a reader who may write the repositories tab; a path left out is the agency's to make (the agency's `docs/api.md`,
// 「repositories, prefix-checks and room-holdings」).
export default defineEventHandler(async (event): Promise<RepositoryView> => {
  await signedInUser(event);

  const change = repositoryChangeOf(await readBody<unknown>(event), true);

  if (change === null) throw fail(400, wording("common.error.bad_action"));

  return await addRepository(change, event);
});
