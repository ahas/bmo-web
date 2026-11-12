import { logFilterFrom } from "#shared/monitor-logs";
import { wording } from "#shared/wording";

import type { LogPage } from "#shared/monitor-logs";

// A page of the lines the machine's background units wrote, for the monitor's logs tab (docs/web.md, 「Monitor's logs
// tab」): older than `before`, the newest where none is named, or written after `after`.
export default defineEventHandler(async (event): Promise<LogPage> => {
  await requireAdministrator(event);

  const query = getQuery(event);
  const filter = logFilterFrom(query);
  const reading = logReading(wording("monitor_logs.label.masked"));
  const cursor = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);
  const after = cursor(query.after);

  return after === null ? readOlderLogLines(filter, cursor(query.before), reading) : readNewerLogLines(filter, after, reading);
});
