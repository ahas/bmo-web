import { listedSupervisors } from "../utils/agent-ownership";

import type { SupervisorView } from "#shared/axes";

// Every supervisor in the agency's order that is the reader's own or the deployment's (docs/web.md, 「Access」), each
// with its road, its warming and its compaction threshold (the agency's `docs/api.md`, 「supervisors」; docs/web.md,
// 「Agent management screen」).
export default defineEventHandler(async (event): Promise<SupervisorView[]> => {
  const signed = await signedInUser(event);

  return listedSupervisors(await readSupervisors(), signed.id);
});
