// A long job's log as the agency holds it (the agency's `docs/api.md`, 「log-lines」), for the browser check that opens
// it from the TODO panel (tests/browser/agent-log-open.test.ts). The seat that ran the job holds a log of thousands of
// lines across two jobs, the running one's lines carrying the job's run by name and a run id of nought, its calls
// returning results tens of thousands of characters long; the run ledger names the job's run for the worker it was
// ordered for, a name no line stands under (docs/web.md, 「Where the log comes from」).

export const JOB_LOG = {
  seat: "seat-a",
  worker: "worker-slot-a",
  item: 77,
  job: 9_077,
  run: "job-9077",
  ledgerRun: 977,
  earlierJob: 9_076,
  newest: "the newest line of the job"
} as const;

// The first line id of the running job; every line before it is the earlier job's.
const JOB_FROM = 3_001;
const LINE_COUNT = 6_000;
const BASE_AT = 1_790_000_000_000;

// A result of a thousand numbered lines, some thirty thousand characters.
const LONG_RESULT = Array.from({ length: 1_000 }, (_, index) => `output line ${index + 1} of a long result`).join("\n");

function lineAt(id: number): Record<string, unknown> {
  const job = id < JOB_FROM ? JOB_LOG.earlierJob : JOB_LOG.job;
  const run = `job-${job}`;
  const base = { id, runId: 0, jobId: job, roomId: null, round: null, messageId: null, agentName: JOB_LOG.seat, at: BASE_AT + id * 1_000, metadata: null };
  const ref = `call-${id - (id % 3)}`;

  if (id === LINE_COUNT) return { ...base, kind: "text", text: JOB_LOG.newest, fields: { run } };
  if (id % 3 === 0) {
    return { ...base, kind: "tool", text: JSON.stringify({ command: `cat out-${id}.txt`, description: `Read output ${id}` }), fields: { run, name: "Bash", ref } };
  }
  if (id % 3 === 1) return { ...base, kind: "tool-result", text: LONG_RESULT, fields: { run, name: "Bash", ref, state: "succeeded" } };

  return { ...base, kind: "text", text: `working on step ${id}`, fields: { run } };
}

const LINES = Array.from({ length: LINE_COUNT }, (_, index) => lineAt(index + 1));
const JOB_LINES = LINES.filter((line) => line.jobId === JOB_LOG.job);

function limitOf(url: URL): number {
  return Math.min(Number(url.searchParams.get("limit") ?? "500"), 500);
}

/** The agency's answer to a read of this log, or null for a path it does not hold. */
export function jobLogAnswer(url: URL): Response | null {
  if (url.pathname === "/runs" && url.searchParams.get("names") === JOB_LOG.run) {
    return Response.json({
      items: [{ id: JOB_LOG.ledgerRun, name: JOB_LOG.run, agentName: JOB_LOG.worker, unitName: JOB_LOG.run, workerName: null, jobId: null, state: "running", startedAt: BASE_AT, endedAt: null }],
      more: false
    });
  }

  // The run's own lines, forward from its start or a line: the ledger's run reads as the job's lines.
  if (url.pathname === "/log-lines" && Number(url.searchParams.get("runId")) === JOB_LOG.ledgerRun) {
    const after = Number(url.searchParams.get("after") ?? "0");
    const found = JOB_LINES.filter((line) => (line.id as number) > after);

    return Response.json({ items: found.slice(0, limitOf(url)), more: found.length > limitOf(url) });
  }

  // The worker the ledger names holds no line.
  if (url.pathname === `/log/agents/${JOB_LOG.worker}/lines`) return Response.json({ items: [], hasMore: false, hasOlder: false });

  if (url.pathname === `/log/agents/${JOB_LOG.seat}/lines`) {
    const limit = limitOf(url);
    const before = url.searchParams.get("before");
    const after = url.searchParams.get("after");

    if (before !== null) {
      const older = LINES.filter((line) => (line.id as number) < Number(before));

      return Response.json({ items: older.slice(-limit), hasMore: older.length > limit, hasOlder: false });
    }

    if (after !== null) {
      const newer = LINES.filter((line) => (line.id as number) > Number(after));

      return Response.json({ items: newer.slice(0, limit), hasMore: newer.length > limit, hasOlder: false });
    }

    return Response.json({ items: LINES.slice(-limit), hasMore: LINES.length > limit, hasOlder: false });
  }

  return null;
}
