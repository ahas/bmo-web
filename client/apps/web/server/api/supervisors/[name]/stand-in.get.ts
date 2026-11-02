import type { StandInView } from "#shared/axes";

// The stand-in a supervisor's turns go out on now, or none (docs/web.md, 「Agent screen」).
export default defineEventHandler(async (event): Promise<{ standIn: StandInView | null }> => {
  await requireUserSession(event);

  return { standIn: await readStandIn(axisName(getRouterParam(event, "name"))) };
});
