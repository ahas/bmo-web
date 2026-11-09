import { usageView } from "../utils/usage";

import type { UsageView } from "#shared/types";

// The week a worker's figures cover.
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// What the accounts have left and what the workers spent (docs/web.md, 「Usage in the title bar」): the provider the chat
// runs on from the default answerer's own `provider`, its login and the accounts' names from the agency's fallback answer, each account's own window from its account
// list, and each worker's week from its usage grouped by worker (docs/boundary.md, 「Gaps the console meets」). An
// account the owner switched off, or one on a provider switched off, is left out: the providers' own switches are
// read from the agency's provider list, and a list that does not answer leaves every provider standing as on. The
// same list names each provider's own road that keeps a balance, with the request allowance read beside it.
export default defineEventHandler(async (event): Promise<UsageView> => {
  await requireUserSession(event);

  const after = Date.now() - WEEK_MS;
  const [fallback, accounts, usage, supervisors, answerer, providers] = await Promise.all([
    agencyCall(agency().GET("/fallback")),
    agencyCall(agency().GET("/accounts")),
    agencyCall(agency().GET("/usage", { params: { query: { groupBy: "agent", after } } })),
    // The provider the chat agent runs on is the default answerer's own; a list that does not answer leaves the
    // fallback's word standing.
    agencyCall(agency().GET("/supervisors")).then((page) => (Array.isArray(page.items) ? page.items : [])).catch(() => []),
    defaultAnswerer(),
    agencyCall(agency().GET("/providers")).then((page) => (Array.isArray(page.items) ? page.items : [])).catch(() => [])
  ]);
  const chatProvider = supervisors.find((supervisor) => supervisor.name === answerer)?.provider ?? null;

  const providersOff = new Set(providers.filter((provider) => provider.enabled === false).map((provider) => provider.name));

  return usageView(fallback, accounts.items, usage, chatProvider, providersOff, providers);
});
