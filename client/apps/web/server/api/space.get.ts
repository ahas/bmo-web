import type { SpaceView } from "#shared/space";

// The agents' space, as the live status screen draws it (docs/web.md, 「Live status screen」, the space): the machines,
// the repositories and every agent with what it is doing now.
export default defineEventHandler(async (event): Promise<SpaceView> => {
  await requireUserSession(event);

  return await readSpace();
});
