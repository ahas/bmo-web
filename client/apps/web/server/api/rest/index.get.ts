import type { RestView } from "#shared/rest";

// Whether the deployment rests now, until when and of what kind, with the agents of the reader's lists its rest closes
// (docs/web.md, 「What each agent is doing now」): read by every tab that shows an agent's state, on its own clock.
export default defineEventHandler(async (event): Promise<RestView> => {
  await requireUserSession(event);

  return await readRest(event);
});
