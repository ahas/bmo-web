import { wording } from "#shared/wording";

import type { LogSources } from "#shared/monitor-logs";

// The categories and the servers' units the monitor's logs tab filters by (docs/web.md, 「Monitor's logs tab」).
export default defineEventHandler(async (event): Promise<LogSources> => {
  await requireAdministrator(event);

  return readLogSources(logReading(wording("monitor_logs.label.masked")));
});
