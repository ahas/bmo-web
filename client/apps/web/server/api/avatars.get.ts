import type { AvatarRef } from "#shared/types";

// The pictures the console can show the signed-in user, all of them at once: the ones of what they share
// (docs/web.md, 「Profile photos」). It is a short list — one row per room and per person — and it is asked for once a
// screen rather than once a name.
export default defineEventHandler(async (event): Promise<AvatarRef[]> => {
  await requireUserSession(event);

  const reach = await avatarReach(event);

  return (await avatarRefs()).filter((ref) => reaches(reach, ref.kind, ref.id));
});
