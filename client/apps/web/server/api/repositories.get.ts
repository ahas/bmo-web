import { listedRows } from "../utils/agent-ownership";

import type { RepositoryView } from "#shared/axes";

// Every repository that is the reader's own or the deployment's (docs/web.md, 「Access」), with its checkouts (the
// agency's `docs/api.md`, 「repositories, prefix-checks and room-holdings」).
export default defineEventHandler(async (event): Promise<RepositoryView[]> => {
  const signed = await signedInUser(event);

  return await readRepositories((rows) => listedRows(rows, signed.id));
});
