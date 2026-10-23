import { wording } from "#shared/wording";

// The console's row of one key taken away; the policy's row of the key stands again where it holds one (the
// receiver's `docs/drafting.md`, 「The routes」).
export default defineEventHandler(async (event): Promise<{ ok: true }> => {
  await requireUserSession(event);

  const body = await readBody<Record<string, unknown>>(event);
  const provider = draftKeyPart(body?.provider);
  const tier = draftKeyPart(body?.tier);
  const agentName = draftKeyPart(body?.agentName);

  if (provider === null || tier === null || agentName === null) throw fail(400, wording("common.error.bad_action"));

  await eraseDraftProcess({ provider, tier, agentName });

  return { ok: true };
});
