import { agency, agencyCall } from "./agency";

import type { LogLine } from "@agency/client";
import type { RoundSpend, TurnActionsRef } from "#shared/types";

// The most lines one read of the agency answers (the agency's `docs/api.md`, 「log-lines」).
const LINES_PAGE = 500;

// What one answer cost and what its turn did, as a message's chip line reads it.
export interface RoundFigures {
  spend: RoundSpend | null;
  actions: TurnActionsRef | null;
}

// The lines a run left, every page of them from the first.
async function linesOf(runId: number, agent: string): Promise<LogLine[]> {
  const found: LogLine[] = [];
  let cursor = 0;

  for (;;) {
    const page = await agencyCall(
      agency().GET("/log-lines", { params: { query: { runId, agentName: agent, after: cursor, limit: LINES_PAGE } } })
    );

    found.push(...page.items);

    if (!page.more || page.items.length === 0) break;

    cursor = page.items[page.items.length - 1]!.id;
  }

  return found;
}

// A line's own record, where it carries one as JSON: a pane program's progress and answer lines do, and a
// stream's own lines do not.
function recordOf(line: LogLine): Record<string, unknown> | null {
  if (!line.text.startsWith("{")) return null;

  try {
    const read: unknown = JSON.parse(line.text);

    return typeof read === "object" && read !== null ? (read as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function nameOf(line: LogLine, record: Record<string, unknown> | null): string | null {
  const named = record?.tool ?? (typeof line.fields === "object" && line.fields !== null ? (line.fields as Record<string, unknown>).name : null);

  return typeof named === "string" && named !== "" ? named : null;
}

/**
 * What the round's run spent and what it called, read from the agency's log of the run (docs/boundary.md,
 * 「Gaps the console meets」): a pane program's answer line carries the turn's usage, and every line naming a
 * tool — its progress lines and a stream's own tool calls — is one thing the turn called. None where the run
 * left no log the agency still holds.
 */
export async function figuresOf(round: string): Promise<RoundFigures | null> {
  const page = await agencyCall(agency().GET("/runs", { params: { query: { names: round, limit: 1 } } }));
  const run = page.items[0];

  if (run === undefined) return null;

  const lines = await linesOf(run.id, run.agentName);
  const tools = new Set<string>();
  let spend: RoundSpend | null = null;

  for (const line of lines) {
    const record = recordOf(line);

    if (line.kind === "progress") {
      const name = nameOf(line, record);

      if (name !== null) tools.add(name);

      continue;
    }

    if (line.kind === "answer" && record !== null && typeof record.usage === "object" && record.usage !== null) {
      const counted = record.usage as Record<string, unknown>;
      const number = (name: string): number => (typeof counted[name] === "number" ? (counted[name] as number) : 0);

      spend = {
        inputTokens: number("inputTokens"),
        outputTokens: number("outputTokens"),
        cacheReadTokens: number("cacheReadTokens"),
        cacheWriteTokens: number("cacheWriteTokens"),
        measured: 1,
        unmeasured: 0,
        roads: [],
        context: null
      };

      continue;
    }

    // A stream's own tool call, which a Claude Code turn leaves as a line of its own.
    if (line.kind === "tool") {
      const name = nameOf(line, record);

      if (name !== null) tools.add(name);
    }
  }

  const actions: TurnActionsRef = {
    agent: run.agentName,
    run: round,
    documents: 0,
    held: 0,
    tools: tools.size,
    records: []
  };

  return { spend, actions: tools.size > 0 || spend !== null ? actions : null };
}
