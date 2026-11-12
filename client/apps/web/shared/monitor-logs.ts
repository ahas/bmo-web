// The monitor's logs tab (docs/web.md, 「Monitor's logs tab」): what the machine's background units wrote to the user
// journal, read through the console's server. The server and the screen share these shapes and the filter's words.

/** The route a page of lines is read from, and the route the filters' choices are read from. */
export const MONITOR_LOGS_URL = "/api/monitor/logs";
export const MONITOR_LOG_SOURCES_URL = "/api/monitor/log-sources";

/** The category of a unit that stands in no category slice of its own: the units' servers. */
export const SERVICE_CATEGORY = "service";

/** How often the tab asks for what was written after the newest line it holds, while it stands. */
export const MONITOR_LOGS_POLL_MS = 3_000;

/** How many lines a page holds at most. */
export const MONITOR_LOGS_PAGE = 100;

/** The levels a line is filtered by: the journal's own priority, 0 to 3 an error, 4 a warning, the rest other. */
export const LOG_LEVELS = ["error", "warning", "other"] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

export function isLogLevel(value: unknown): value is LogLevel {
  return typeof value === "string" && (LOG_LEVELS as readonly string[]).includes(value);
}

/** One line of the journal as the screen shows it, its words already masked. */
export interface LogLine {
  /** The journal's cursor of the line: its identity, and where a read goes on from. */
  id: string;
  /** When it was written, in epoch milliseconds. */
  at: number;
  unit: string;
  category: string;
  level: LogLevel;
  text: string;
}

/**
 * One answer of the logs route.
 * - `lines`: newest first.
 * - `next`: where a read of older lines goes on from, the last entry the read looked at whether or not it was kept;
 *   null where the journal's start was reached.
 * - `head`: the newest entry the read looked at, which the next read of new lines goes on from; null where it
 *   looked at none.
 * - `gap`: a read of new lines met more than it reads at once, so the lines it answers do not reach back to the
 *   head it was given and the screen starts again from them.
 */
export interface LogPage {
  lines: LogLine[];
  next: string | null;
  head: string | null;
  gap: boolean;
}

/** One category the filter offers: its key and, for the servers' category, each unit in it by name. */
export interface LogCategory {
  key: string;
  units: string[];
}

export interface LogSources {
  categories: LogCategory[];
}

/** What a read is narrowed by; every one of them may be left out. */
export interface LogFilter {
  category: string | null;
  unit: string | null;
  level: LogLevel | null;
  query: string;
}

/** The filter as the address or a request's query carries it. */
export function logFilterFrom(query: Record<string, unknown>): LogFilter {
  const text = (value: unknown): string | null => (typeof value === "string" && value.trim() !== "" ? value.trim() : null);

  return {
    category: text(query.category),
    unit: text(query.unit),
    level: isLogLevel(query.level) ? query.level : null,
    query: typeof query.q === "string" ? query.q : ""
  };
}

/** The filter written back as a query, a filter left unset written as nothing. */
export function logFilterQuery(filter: LogFilter): Record<string, string | undefined> {
  return {
    category: filter.category ?? undefined,
    unit: filter.unit ?? undefined,
    level: filter.level ?? undefined,
    q: filter.query.trim() === "" ? undefined : filter.query
  };
}

/** Whether any filter narrows the lines. */
export function logFiltered(filter: LogFilter): boolean {
  return filter.category !== null || filter.unit !== null || filter.level !== null || filter.query.trim() !== "";
}
