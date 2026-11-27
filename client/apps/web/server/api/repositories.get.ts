import { listedRows } from "../utils/agent-ownership";

import type { RepositoryView } from "#shared/axes";

// Every repository that is the reader's own or the deployment's (docs/web.md, 「Access」), with its checkouts (the
// agency's `docs/api.md`, 「repositories, prefix-checks and room-holdings」).
export default defineEventHandler(async (event): Promise<RepositoryView[]> => {
  const signed = await signedInUser(event);
  // A scoped read asks the agency, which answers a node's repositories to its heads alone; unscoped, the
  // console keeps narrowing to the reader's own and the deployment's.
  const scope = ownerParamsOf(getQuery(event));

  return await readRepositories(scope === undefined ? (rows) => listedRows(rows, signed.id) : (rows) => rows, event, scope);
});
