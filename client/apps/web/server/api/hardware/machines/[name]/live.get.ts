import type { LiveRange } from "#shared/types";

// A machine's live record since the instant `since` names, in seconds, and only the figures measuring what
// `metrics` lists where it lists any (docs/web.md, 「Monitor screen」).
export default defineEventHandler(async (event): Promise<LiveRange> => {
  await requireUserSession(event);

  const query = getQuery(event);
  const asked = Number(query.since);
  const metrics = typeof query.metrics === "string" && query.metrics !== "" ? query.metrics.split(",") : [];

  return await machineLive(machineNamed(getRouterParam(event, "name")), Number.isFinite(asked) ? asked : null, metrics);
});
