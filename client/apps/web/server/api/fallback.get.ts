import { emptyFallbackView } from "../../app/domain/agent-settings";

import type { FallbackView } from "#shared/types";

// The fallback as the agency answers it (the agency's `docs/api.md`, 「providers, models and model files」): the
// account runs on Claude Code go out on now, and every Claude account in the order the Claude Code entry walks them. A
// field the answer leaves out stands as the empty view has it. No credential is in the agency's answer and so none is in this one — a
// key that reached the browser would be a key in a page's memory and in whatever cached it.
export default defineEventHandler(async (event): Promise<FallbackView> => {
  await requireUserSession(event);

  // The agency's generated schema leaves both fields untyped; each one missing stands as below.
  const fallback = (await agencyCall(agency().GET("/fallback"))) as Partial<FallbackView>;
  const empty = emptyFallbackView();

  return {
    active: fallback.active ?? empty.active,
    accounts: Array.isArray(fallback.accounts) ? fallback.accounts : empty.accounts
  };
});
