import type { BriefingSwitches } from "#shared/types";

// The voice briefing's two switches as the receiver keeps them (its `docs/api.md`, `GET /voice-briefing`): whether
// anything is spoken, and whether a summary plays by itself. They are the administrator's.
export default defineEventHandler(async (event): Promise<BriefingSwitches> => {
  await requireAdministrator(event);

  const read = await unitFetch<{ on?: unknown; autoplay?: unknown }>("RECEIVER", "/voice-briefing", undefined, { codes: RECEIVER_CODES });

  return { on: read?.on !== false, autoplay: read?.autoplay !== false };
});
