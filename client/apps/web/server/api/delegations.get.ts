import { agency, agencyCall } from "../utils/agency";

import type { DelegationPage } from "#shared/types";

// The tasks a supervisor delegated to its double, as the agency lists them (the agency's `docs/api.md`,
// `GET /delegations`): the runs still waiting or running, in the order they were asked, then the latest ended one. The
// owner's own chat draws a run's marker from this answer alone, so every read replaces the whole list and nothing is
// kept here.
export default defineEventHandler(async (event): Promise<DelegationPage> => {
  await requireUserSession(event);

  const page = await agencyCall(agency().GET("/delegations", { params: { query: { ended: 1 } } }));

  return { items: page.items };
});
