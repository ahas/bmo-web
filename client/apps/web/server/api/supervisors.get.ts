import { listedSupervisors } from "../utils/agent-ownership";

import type { SupervisorView } from "#shared/axes";

// Every supervisor in the agency's order that is the reader's own or the deployment's (docs/web.md, 「Access」), each
// with its road, its warming and its compaction threshold (the agency's `docs/api.md`, 「supervisors」; docs/web.md,
// 「Agent management screen」).
export default defineEventHandler(async (event): Promise<SupervisorView[]> => {
  const signed = await signedInUser(event);
  // Where the address names a node of the tree, the agency answers what that reader reaches there and the
  // console's own whose-row rule stands aside; unscoped, it keeps narrowing as it always did (the agency's
  // `docs/api.md`, 「Who a caller acts for」; docs/web.md, 「Access」).
  const scope = await ownerParamsOf(event, getQuery(event));

  return scope === undefined ? listedSupervisors(await readSupervisors(event), signed.id) : await readSupervisors(event, scope);
});
