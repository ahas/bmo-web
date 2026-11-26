// A long job's log as the agency holds it (the agency's `docs/api.md`, 「log-lines」, 「assignments and jobs」), for the
// browser checks that open it from the TODO panel (tests/browser/agent-log-open.test.ts, tests/browser/todo-job-log.test.ts).
// The seat that ran the job holds a log of thousands of lines across two jobs, the running one's lines carrying the
// job by number and a `runId` of nought, their results running to tens of thousands of characters. The run ledger
// names the job's run for the checkout it ran in, one row per turn of it, under a name no line stands under, and a
// turn that has published no row leaves the job with no run name at all; the job's lines answer to the job alone,
// which is what every screen opens them by (docs/web.md, 「Where the log comes from」).

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

/** The job as the agency's job row holds it: its lines under the seat that did the work, its run named for the
 * checkout it ran in, and its session numbered by the agency rather than by the job. */
const JOB_ROW = {
  id: JOB_LOG.job,
  itemId: JOB_LOG.item,
  leaseId: 12,
  holderName: "owner",
  assignmentId: 31,
  workerName: JOB_LOG.worker,
  repositoryName: "repo-a",
  roleName: "coder",
  agentName: JOB_LOG.seat,
  sessionId: `${JOB_LOG.worker}@run:4908`,
  runId: JOB_LOG.ledgerRun,
  runName: JOB_LOG.run,
  roomId: null,
  state: "running",
  outcome: null,
  report: null,
  tokenCount: 0,
  usage: null,
  startedAt: BASE_AT,
  endedAt: null
};

/** The agency's answer to a read of this log, or null for a path it does not hold. */
export function jobLogAnswer(url: URL): Response | null {
  // Only this job's row: another stand-in's job is left for it to answer, so a job number that is not this fixture's
  // claims nothing.
  const job = url.pathname.match(/^\/jobs\/(\d+)$/);

  if (job !== null) return Number(job[1]) === JOB_LOG.job ? Response.json(JOB_ROW) : null;

  if (url.pathname === "/jobs" && url.searchParams.get("running") === "true") {
    return Response.json({ items: [JOB_ROW], more: false });
  }

  if (url.pathname === "/runs" && url.searchParams.get("names") === JOB_LOG.run) {
    return Response.json({
      items: [{ id: JOB_LOG.ledgerRun, name: `${JOB_LOG.worker}:${JOB_LOG.run}`, agentName: JOB_LOG.worker, unitName: JOB_LOG.run, workerName: null, jobId: null, state: "running", startedAt: BASE_AT, endedAt: null }],
      more: false
    });
  }

  // The job's own lines, by the job alone: the lines before a line id read upward, the lines after one read on.
  if (url.pathname === "/log-lines" && url.searchParams.get("jobId") === String(JOB_LOG.job)) {
    return page(JOB_LINES, url);
  }

  // The run's own lines, forward from its start or a line: the ledger's run reads as the job's lines.
  if (url.pathname === "/log-lines" && Number(url.searchParams.get("runId")) === JOB_LOG.ledgerRun) {
    return page(JOB_LINES, url);
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

// One page of the lines, oldest first, read upward from a line id or on past it: upward reads the last lines under
// the id, which is how the newest of a job are reached.
function page(held: Record<string, unknown>[], url: URL): Response {
  const limit = limitOf(url);
  const before = url.searchParams.get("before");
  const after = url.searchParams.get("after");

  if (after !== null) {
    const newer = held.filter((line) => (line.id as number) > Number(after));

    return Response.json({ items: newer.slice(0, limit), more: newer.length > limit });
  }

  if (before !== null) {
    const older = held.filter((line) => (line.id as number) < Number(before));

    return Response.json({ items: older.slice(-limit), more: older.length > limit });
  }

  return Response.json({ items: held.slice(0, limit), more: held.length > limit });
}
