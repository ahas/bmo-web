import { agency, agencyCall } from "./agency";

import type { TokenSplit } from "#shared/types";

// What a job's run has done so far, read off its log: the calls whose result has come back, and what its model's
// requests have reported spending. The agency answers a job's usage only once its turn has ended and no count of its
// calls at all (docs/boundary.md, 「Gaps the console meets」), while every line a model's request produced keeps that
// request's id and its usage in the metadata the writer filed, the same usage on every line of one request. So a
// run's lines are read once, only the newer ones on each later read, and every request's usage counts once.

// The most lines one read of the agency answers.
const AGENCY_PAGE = 500;

// The most runs whose tally the server keeps at once; the run asked about longest ago gives its place up first.
const RUNS_KEPT = 64;

interface RequestUsage {
  id: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

// One run's tally: the newest line read, the results counted, and every request's usage by its id.
interface RunTally {
  after: number;
  calls: number;
  requests: Map<string, RequestUsage>;
}

/** What a run has done so far: its calls whose result has come back, and its spend, null where no request has
 * reported any. */
export interface RunFigures {
  calls: number;
  spent: TokenSplit | null;
}

const tallies = new Map<number, RunTally>();

function countOf(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

/** The request a log line came from and the usage it reported, as the line's metadata keeps them under `request` in
 * the model API's own field names; null on a line no request's usage stands on. */
export function requestUsageOf(metadata: unknown): RequestUsage | null {
  if (typeof metadata !== "object" || metadata === null) return null;

  const request = (metadata as Record<string, unknown>).request;

  if (typeof request !== "object" || request === null) return null;

  const { id, usage } = request as Record<string, unknown>;

  if (typeof id !== "string" || id === "" || typeof usage !== "object" || usage === null) return null;

  const figures = usage as Record<string, unknown>;

  return {
    id,
    input: countOf(figures.input_tokens),
    output: countOf(figures.output_tokens),
    cacheRead: countOf(figures.cache_read_input_tokens),
    cacheWrite: countOf(figures.cache_creation_input_tokens)
  };
}

/** Every request's usage added up, each request once; null where no request has reported any. */
export function spendOf(requests: Iterable<RequestUsage>): TokenSplit | null {
  const all = [...requests];
  const sum = (figure: (one: RequestUsage) => number): number => all.reduce((total, one) => total + figure(one), 0);

  if (all.length === 0) return null;

  return {
    inputTokens: sum((one) => one.input),
    outputTokens: sum((one) => one.output),
    cacheReadTokens: sum((one) => one.cacheRead),
    cacheWriteTokens: sum((one) => one.cacheWrite)
  };
}

// The tally of a run, made the newest one kept.
function tallyOf(runId: number): RunTally {
  const tally = tallies.get(runId) ?? { after: 0, calls: 0, requests: new Map() };

  tallies.delete(runId);
  tallies.set(runId, tally);

  for (const oldest of tallies.keys()) {
    if (tallies.size <= RUNS_KEPT) break;
    tallies.delete(oldest);
  }

  return tally;
}

/** What a run has done so far, read on from where the last read of it stopped. A read that fails leaves the figures
 * as far as they were read: they stand beside the job's line, not as part of it. */
export async function runFigures(runId: number): Promise<RunFigures> {
  const tally = tallyOf(runId);

  try {
    for (;;) {
      const page = await agencyCall(agency().GET("/log-lines", { params: { query: { runId, after: tally.after, limit: AGENCY_PAGE } } }));

      for (const line of page.items) {
        // Two reads of one run may overlap; a line the other has counted already is passed over.
        if (line.id <= tally.after) continue;

        const request = requestUsageOf(line.metadata);

        if (request !== null) tally.requests.set(request.id, request);
        if (line.kind === "tool-result") tally.calls += 1;
        tally.after = Math.max(tally.after, line.id);
      }

      if (!page.more || page.items.length === 0) break;
    }
  } catch {
    // What was read stands.
  }

  return { calls: tally.calls, spent: spendOf(tally.requests.values()) };
}
