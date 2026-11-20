import { isBrainCall } from "#shared/mcp-names";

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

// The most runs one round is read as: its own turn and the turns its instruction pipeline asked.
const ROUND_RUNS = 50;

// What a run's ledger row says it spent, where it says anything.
function usageOf(usage: unknown): Omit<RoundSpend, "measured" | "unmeasured" | "roads" | "context"> | null {
  if (typeof usage !== "object" || usage === null) return null;

  const counted = usage as Record<string, unknown>;
  const number = (name: string): number => (typeof counted[name] === "number" ? (counted[name] as number) : 0);

  return {
    inputTokens: number("inputTokens"),
    outputTokens: number("outputTokens"),
    cacheReadTokens: number("cacheReadTokens"),
    cacheWriteTokens: number("cacheWriteTokens")
  };
}

/**
 * What the round's runs spent and what they did, read from the agency's ledger and its log of every run of the round
 * (docs/boundary.md, 「Gaps the console meets」): the round's own turn and each turn its instruction pipeline asked the
 * same session. Every `tool` line is one call; a pane program that leaves no such line names its calls on its
 * progress lines instead. The reference documents are its `context` lines, held or attached. None where the agency
 * holds no run of the round.
 */
export async function figuresOf(round: string): Promise<RoundFigures | null> {
  const page = await agencyCall(agency().GET("/runs", { params: { query: { names: round, limit: ROUND_RUNS } } }));
  const runs = [...page.items].sort((one, other) => one.id - other.id);
  const first = runs[0];

  if (first === undefined) return null;

  let tools = 0;
  let brain = 0;
  let documents = 0;
  let held = 0;
  let spend: RoundSpend | null = null;
  // The context the last run that reported it closed on.
  let carried: number | null = null;
  const add = (spent: Omit<RoundSpend, "measured" | "unmeasured" | "roads" | "context">): void => {
    const was = spend;

    spend = {
      inputTokens: (was?.inputTokens ?? 0) + spent.inputTokens,
      outputTokens: (was?.outputTokens ?? 0) + spent.outputTokens,
      cacheReadTokens: (was?.cacheReadTokens ?? 0) + spent.cacheReadTokens,
      cacheWriteTokens: (was?.cacheWriteTokens ?? 0) + spent.cacheWriteTokens,
      measured: (was?.measured ?? 0) + 1,
      unmeasured: 0,
      roads: [],
      context: null,
      contextTokens: carried ?? was?.contextTokens ?? null
    };
  };

  // The runs' lines are read side by side and counted in the runs' own order, since the last run that reports how full
  // its session stood is the one the round stands at.
  const read = await Promise.all(runs.map((run) => linesOf(run.id, run.agentName)));

  for (const [at, run] of runs.entries()) {
    const lines = read[at]!;
    const called = lines.filter((line) => line.kind === "tool");
    // A pane program's progress lines name a call only where the run left no call line of its own.
    const named = called.length > 0 ? called : lines.filter((line) => line.kind === "progress" && nameOf(line, recordOf(line)) !== null);
    let answered: ReturnType<typeof usageOf> = null;

    for (const line of named) {
      tools += 1;

      if (isBrainCall(nameOf(line, recordOf(line)), line.text)) brain += 1;
    }

    for (const line of lines) {
      if (line.kind === "context") {
        const state = typeof line.fields === "object" && line.fields !== null ? (line.fields as Record<string, unknown>).state : null;

        if (state === "held") held += 1;
        else documents += 1;
      }

      if (line.kind === "answer") {
        const record = recordOf(line);

        answered = usageOf(record?.usage) ?? answered;
      }
    }

    // The ledger's row carries the run's usage and its context beside what the published type states.
    const row: Record<string, unknown> = Object.fromEntries(Object.entries(run));
    const spent = usageOf(row.usage) ?? answered;

    if (typeof row.contextTokens === "number" && row.contextTokens > 0) carried = row.contextTokens;

    if (spent !== null) add(spent);
  }

  const actions: TurnActionsRef = {
    agent: first.agentName,
    runs: runs.map((run) => run.unitName),
    documents,
    held,
    tools,
    brain,
    records: []
  };

  return { spend, actions: tools > 0 || documents + held > 0 || spend !== null ? actions : null };
}
