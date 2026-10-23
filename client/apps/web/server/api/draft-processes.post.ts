import { wording } from "#shared/wording";

import type { DraftProcessView } from "#shared/drafting";

// One row of the draft process table set, its key and every value it holds (the receiver's `docs/drafting.md`,
// 「The routes」). Whether the values stand is the receiver's to say; a body that names no key or misses a value goes
// no further.
export default defineEventHandler(async (event): Promise<DraftProcessView> => {
  await requireUserSession(event);

  const body = await readBody<Record<string, unknown>>(event);
  const provider = draftKeyPart(body?.provider);
  const tier = draftKeyPart(body?.tier);
  const agentName = draftKeyPart(body?.agentName);
  const values = draftValuesOf(body);

  if (provider === null || tier === null || agentName === null || values === null) throw fail(400, wording("common.error.bad_action"));

  return await writeDraftProcess({ provider, tier, agentName }, values);
});
