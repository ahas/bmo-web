// The browser harness's run of a role that no job carries and whose asker named its work, as the stand-in agency's
// slots serve it and the sidebar checks read it: a run of the `seeker` role, on an agent that follows the supervisor
// asking it, named in the sidebar by the line its asker gave it and opening the role's log at that run (docs/web.md,
// 「Sidebar」). The role's log holds an earlier run's lines and then this run's, the first of them written the moment
// the run was let in.

const SINCE = Date.now() - 20_000;

export const ASKED_RUN = {
  role: "seeker",
  agent: "seeker-01",
  run: "ask-agent-a-1",
  title: "Check the plan",
  // When the run was let in, in epoch milliseconds, read where the harness runs; a test reads it from the console.
  since: SINCE,
  // The words of the run's first line, which the log opened at the run stands.
  header: "asked run started on the plan"
} as const;

function lineAt(id: number, at: number, run: string, text: string): Record<string, unknown> {
  return {
    id, runId: 0, jobId: null, roomId: null, round: null, messageId: null, agentName: ASKED_RUN.agent, at, metadata: null,
    kind: "text", text, fields: { run }
  };
}

// An earlier run's lines a minute before, then the asked run's from the moment it was let in.
const LINES = [
  lineAt(1, SINCE - 60_000, "ask-agent-a-0", "an earlier run's line"),
  lineAt(2, SINCE - 59_000, "ask-agent-a-0", "the earlier run ends"),
  lineAt(3, SINCE, ASKED_RUN.run, ASKED_RUN.header),
  lineAt(4, SINCE + 1_000, ASKED_RUN.run, "reading the plan"),
  lineAt(5, SINCE + 2_000, ASKED_RUN.run, "the plan reads as it should")
];

/** The agency's answer to a read of the role's log, or null for a path it does not hold: the page a moment stands in,
 * the page before or after a line, or the newest. */
export function askedRunLogAnswer(url: URL): Response | null {
  if (url.pathname !== `/log/agents/${ASKED_RUN.role}/lines`) return null;

  const limit = Math.min(Number(url.searchParams.get("limit") ?? "500"), 500);
  const at = url.searchParams.get("at");
  const before = url.searchParams.get("before");
  const after = url.searchParams.get("after");
  const page = (lines: Record<string, unknown>[], hasOlder: boolean): Response =>
    Response.json({ items: lines.slice(0, limit), hasMore: lines.length > limit, hasOlder });

  if (at !== null) {
    const from = LINES.filter((line) => (line.at as number) >= Number(at));

    return page(from, from.length < LINES.length);
  }
  if (before !== null) return page(LINES.filter((line) => (line.id as number) < Number(before)), false);
  if (after !== null) return page(LINES.filter((line) => (line.id as number) > Number(after)), false);

  return page(LINES, false);
}
