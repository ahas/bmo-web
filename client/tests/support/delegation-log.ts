// A delegated task's run as the agency holds it (the agency's `docs/api.md`, 「runs」 and 「log-lines」), for the browser
// check that opens it from the owner's own chat's marker (tests/browser/delegation-marker.test.ts): the slot holding
// the task names the run under the delegation's token, the run ledger holds it open for the room it was asked in, and
// its agent's log holds a few lines of it among another run's.

export const DELEGATION_LOG = {
  token: "delegation-running",
  title: "Check the room marker",
  agent: "doppelganger-01",
  run: "delegate-agent-a-1",
  ledgerRun: 966,
  // The words the run's first line says, which the opened log stands.
  header: "delegated run started on the room marker"
} as const;

const BASE_AT = 1_790_000_000_000;

function lineAt(id: number, runId: number, text: string): Record<string, unknown> {
  return {
    id, runId, jobId: null, roomId: null, round: null, messageId: null, agentName: DELEGATION_LOG.agent, at: BASE_AT + id * 1_000, metadata: null,
    kind: "text", text, fields: { run: runId === DELEGATION_LOG.ledgerRun ? DELEGATION_LOG.run : "another-run" }
  };
}

// An earlier run's lines, then the delegated run's.
const LINES = [
  lineAt(1, 960, "an earlier run's line"),
  lineAt(2, DELEGATION_LOG.ledgerRun, DELEGATION_LOG.header),
  lineAt(3, DELEGATION_LOG.ledgerRun, "reading the room screen"),
  lineAt(4, DELEGATION_LOG.ledgerRun, "the marker reads as it should")
];

function limitOf(url: URL): number {
  return Math.min(Number(url.searchParams.get("limit") ?? "500"), 500);
}

/** The agency's answer to a read of the delegated run, or null for a path it does not hold. `roomId` is the room the
 * ledger says the run was asked in. */
export function delegationLogAnswer(url: URL, roomId: number): Response | null {
  if (url.pathname === "/runs" && (url.searchParams.get("names") ?? "").split(",").includes(DELEGATION_LOG.run)) {
    return Response.json({
      items: [
        {
          id: DELEGATION_LOG.ledgerRun, name: DELEGATION_LOG.run, agentName: "doppelganger", unitName: DELEGATION_LOG.run, workerName: null, jobId: null,
          state: "open", startedAt: BASE_AT + 2_000, endedAt: null, outcome: null, roomId, round: null, messageId: null
        }
      ],
      more: false
    });
  }

  // The run's own lines, forward from its start or a line.
  if (url.pathname === "/log-lines" && Number(url.searchParams.get("runId")) === DELEGATION_LOG.ledgerRun) {
    const after = Number(url.searchParams.get("after") ?? "0");
    const found = LINES.filter((line) => line.runId === DELEGATION_LOG.ledgerRun && (line.id as number) > after);

    return Response.json({ items: found.slice(0, limitOf(url)), more: found.length > limitOf(url) });
  }

  // The agent's log across its runs, which a run's newest lines are read back through.
  if (url.pathname === `/log/agents/${DELEGATION_LOG.agent}/lines`) {
    const before = url.searchParams.get("before");
    const lines = before === null ? LINES : LINES.filter((line) => (line.id as number) < Number(before));

    return Response.json({ items: lines.slice(-limitOf(url)), hasMore: lines.length > limitOf(url), hasOlder: false });
  }

  return null;
}
