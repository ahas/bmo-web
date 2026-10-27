import type { BriefingSwitches } from "#shared/types";

// The voice briefing's switch as the receiver keeps it (its `docs/api.md`, `GET /voice-briefing`): whether anything is
// spoken at all. It is the administrator's.
export default defineEventHandler(async (event): Promise<BriefingSwitches> => {
  await requireAdministrator(event);

  const read = await unitFetch<{ on?: unknown }>("RECEIVER", "/voice-briefing", undefined, { codes: RECEIVER_CODES });

  return { on: read?.on !== false };
});
