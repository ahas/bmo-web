import { wording } from "#shared/wording";
import { BASE_DECISIONS } from "#shared/org-memory";

import { decideCandidate } from "../../../../../utils/base-memory";
import { unitNumber } from "../../../../../utils/organization";

import type { BaseDecision } from "#shared/org-memory";

// One of the base's candidates decided, `decision` `raise`, `keep` or `drop`, the administrator's alone (docs/web.md,
// 「Organisation」, the org memory tab with the platform chosen).
export default defineEventHandler(async (event): Promise<null> => {
  const signed = await requireAdministrator(event);
  const memory = unitNumber(getRouterParam(event, "memory"));
  const body = await readBody<{ decision?: unknown }>(event).catch(() => null);
  const decision = body?.decision;

  if (typeof decision !== "string" || !(BASE_DECISIONS as readonly string[]).includes(decision)) throw fail(400, wording("org_memory.error.bad_request"));

  await decideCandidate(signed, memory, decision as BaseDecision);

  return null;
});
