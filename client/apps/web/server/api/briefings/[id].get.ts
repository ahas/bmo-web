import type { VoiceBriefing } from "#shared/types";

// One briefing as the voice engine holds it, which a line's chip waits on while its reading is made.
export default defineEventHandler(async (event): Promise<VoiceBriefing> => {
  await requireUserSession(event);

  return await readBriefing(requireBriefingId(event));
});
