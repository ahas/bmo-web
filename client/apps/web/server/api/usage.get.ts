import { usageView } from "../utils/usage";

import type { UsageView } from "#shared/types";

// The week a worker's figures cover.
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// What the accounts have left and what the workers spent (docs/web.md, 「Usage in the title bar」): the provider the chat
// runs on from the default answerer's own `provider`, its login and the accounts' names from the agency's fallback answer, each account's own window from its account
// list, and each worker's week from its usage grouped by worker (docs/boundary.md, 「Gaps the console meets」).
export default defineEventHandler(async (event): Promise<UsageView> => {
  await requireUserSession(event);

  const after = Date.now() - WEEK_MS;
  const [fallback, accounts, usage, supervisors, answerer] = await Promise.all([
    agencyCall(agency().GET("/fallback")),
    agencyCall(agency().GET("/accounts")),
    agencyCall(agency().GET("/usage", { params: { query: { groupBy: "agent", after } } })),
    // The provider the chat agent runs on is the default answerer's own; a list that does not answer leaves the
    // fallback's word standing.
    agencyCall(agency().GET("/supervisors")).then((page) => (Array.isArray(page.items) ? page.items : [])).catch(() => []),
    defaultAnswerer()
  ]);
  const chatProvider = supervisors.find((supervisor) => supervisor.name === answerer)?.provider ?? null;

  return usageView(fallback, accounts.items, usage, chatProvider);
});
