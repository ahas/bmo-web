// A role's log as the agency holds it (the agency's `docs/api.md`, 「log-lines」), for the browser check that opens a
// running job's run from its agent's state cell (tests/browser/agent-log-run-start.test.ts). Three agents of one role
// write into the role's one log, a line of each in turn, and the third has been running a job since the middle of it:
// its lines carry the job's run by name and a run id of nought, and the run ledger names the run for the checkout the
// job was ordered in, a name no line stands under (docs/web.md, 「Where the log comes from」).

export const ROLE_LOG = {
  role: "builder",
  seat: "builder-03",
  others: ["builder-01", "builder-02"],
  checkout: "repo-b",
  item: 88,
  job: 9_088,
  run: "job-9088",
  ledgerRun: 988,
  header: "the run header of the job"
} as const;

// The id of the running job's first line; the role's lines before it are every agent's earlier work.
export const RUN_FROM = 1_501;

// The job's next line: three agents of the role write in turn, so the seat's next line of the same job stands three
// along, and a read narrowed to the job brings nothing of the two between them.
export const RUN_NEXT = RUN_FROM + 3;
const LINE_COUNT = 2_400;
const BASE_AT = 1_790_000_000_000;

// A result of forty numbered lines, which a row folds under its call.
const RESULT = Array.from({ length: 40 }, (_, index) => `output line ${index + 1}`).join("\n");

// The agent writing a line: the role's agents in turn, the run's first line falling to the seat that runs the job.
function agentOf(id: number): string {
  const turn = (((id - RUN_FROM) % 3) + 3) % 3;

  return turn === 0 ? ROLE_LOG.seat : ROLE_LOG.others[turn - 1]!;
}

function lineAt(id: number): Record<string, unknown> {
  const agentName = agentOf(id);
  const ofJob = agentName === ROLE_LOG.seat && id >= RUN_FROM;
  const run = ofJob ? ROLE_LOG.run : `run-${agentName}`;
  const base = { id, runId: 0, jobId: ofJob ? ROLE_LOG.job : null, roomId: null, round: null, messageId: null, agentName, at: BASE_AT + id * 1_000, metadata: null };

  // Each agent's own lines, counted: every fourth a call and the next of that agent's its result, so a row's height
  // varies down the log as it does.
  const nth = (((Math.floor((id - RUN_FROM) / 3) % 4) + 4) % 4);

  if (id === RUN_FROM) return { ...base, kind: "note", text: ROLE_LOG.header, fields: { run } };
  if (nth === 1) {
    return { ...base, kind: "tool", text: JSON.stringify({ command: `cat out-${id}.txt`, description: `Read output ${id}` }), fields: { run, name: "Bash", ref: `call-${id}` } };
  }
  if (nth === 2) return { ...base, kind: "tool-result", text: RESULT, fields: { run, name: "Bash", ref: `call-${id - 3}`, state: "succeeded" } };

  return { ...base, kind: "text", text: `${agentName} working on step ${id}`, fields: { run } };
}

const LINES = Array.from({ length: LINE_COUNT }, (_, index) => lineAt(index + 1));
const RUN_LINES = LINES.filter((line) => line.jobId === ROLE_LOG.job);

function limitOf(url: URL): number {
  return Math.min(Number(url.searchParams.get("limit") ?? "500"), 500);
}

// A page of `lines` read the way the agency reads one agent's log: before an id, after one, or the newest.
function pageOf(lines: Record<string, unknown>[], url: URL): Response {
  const limit = limitOf(url);
  const before = url.searchParams.get("before");
  const after = url.searchParams.get("after");

  if (before !== null) {
    const older = lines.filter((line) => (line.id as number) < Number(before));

    return Response.json({ items: older.slice(-limit), hasMore: older.length > limit, hasOlder: false });
  }

  if (after !== null) {
    const newer = lines.filter((line) => (line.id as number) > Number(after));

    return Response.json({ items: newer.slice(0, limit), hasMore: newer.length > limit, hasOlder: false });
  }

  return Response.json({ items: lines.slice(-limit), hasMore: lines.length > limit, hasOlder: false });
}

// A page of the job's own lines, read the way the agency reads `GET /log-lines?jobId=`: from the start, after a
// line, or the page just before one.
function jobPage(lines: Record<string, unknown>[], url: URL): Response {
  const limit = limitOf(url);
  const before = url.searchParams.get("before");
  const after = url.searchParams.get("after");

  if (after !== null) {
    const newer = lines.filter((line) => (line.id as number) > Number(after));

    return Response.json({ items: newer.slice(0, limit), more: newer.length > limit });
  }

  if (before !== null) {
    const older = lines.filter((line) => (line.id as number) < Number(before));

    return Response.json({ items: older.slice(-limit), more: older.length > limit });
  }

  return Response.json({ items: lines.slice(0, limit), more: lines.length > limit });
}

/** The agency's answer to a read of this log, or null for a path it does not hold. */
export function roleLogAnswer(url: URL): Response | null {
  // The job the seat runs, and its own lines: the job is what they carry, and what every screen reads them by.
  if (url.pathname === `/jobs/${ROLE_LOG.job}`) {
    return Response.json({
      id: ROLE_LOG.job, itemId: ROLE_LOG.item, leaseId: 7, holderName: "owner", assignmentId: 12, workerName: ROLE_LOG.checkout, repositoryName: "repo-b",
      roleName: ROLE_LOG.role, agentName: ROLE_LOG.seat, sessionId: `${ROLE_LOG.checkout}@run:4908`, runId: ROLE_LOG.ledgerRun, runName: ROLE_LOG.run,
      roomId: null, state: "running", outcome: null, report: null, tokenCount: 0, usage: null, startedAt: BASE_AT + RUN_FROM * 1_000, endedAt: null
    });
  }

  if (url.pathname === "/log-lines" && url.searchParams.get("jobId") === String(ROLE_LOG.job)) {
    return jobPage(RUN_LINES, url);
  }

  if (url.pathname === "/runs" && url.searchParams.get("names") === ROLE_LOG.run) {
    return Response.json({
      items: [
        {
          id: ROLE_LOG.ledgerRun, name: `${ROLE_LOG.checkout}:${ROLE_LOG.run}`, agentName: ROLE_LOG.checkout, unitName: ROLE_LOG.run, workerName: null,
          jobId: null, state: "running", startedAt: BASE_AT + RUN_FROM * 1_000, endedAt: null
        }
      ],
      more: false
    });
  }

  // The run's own lines, forward from its start or a line: the ledger's run reads as the job's lines.
  if (url.pathname === "/log-lines" && Number(url.searchParams.get("runId")) === ROLE_LOG.ledgerRun) {
    const after = Number(url.searchParams.get("after") ?? "0");
    const found = RUN_LINES.filter((line) => (line.id as number) > after);

    return Response.json({ items: found.slice(0, limitOf(url)), more: found.length > limitOf(url) });
  }

  if (url.pathname === `/log/agents/${ROLE_LOG.role}/lines`) return pageOf(LINES, url);

  for (const agent of [ROLE_LOG.seat, ...ROLE_LOG.others]) {
    if (url.pathname === `/log/agents/${agent}/lines`) return pageOf(LINES.filter((line) => line.agentName === agent), url);
  }

  return null;
}
