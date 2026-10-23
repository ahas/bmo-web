import type { MonitorNode } from "#shared/types";

// The node service's list, as far as the monitor reads it (docs/web.md, 「Monitor screen」).
export default defineEventHandler(async (event): Promise<MonitorNode[]> => {
  await requireUserSession(event);

  return await listNodes();
});
