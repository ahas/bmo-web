// A briefing's sound, OGG/Opus, the range a player seeking through it asked for handed on.
export default defineEventHandler(async (event) => {
  await requireUserSession(event);

  return sendWebResponse(event, await briefingSound(requireBriefingId(event), getRequestHeader(event, "range")));
});
