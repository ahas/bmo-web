// A round's instruction pipeline as its round log keeps it (the receiver's `docs/instruction.md`, 「The round log」):
// what each turn of a round wrote, read for the room's draft chip.
import { receiver, receiverCall } from "./receiver";

import type { DraftRead, DraftReadHow, DraftRow, DraftSummary, DraftVersion } from "#shared/drafting";
import type { components } from "@bmo/receiver-client/schema";

type Schemas = components["schemas"];

function rowOf(row: Schemas["PipelineRound"]): DraftRow {
  return {
    id: row.id,
    number: row.number,
    question: row.question,
    kind: row.kind,
    answerChars: row.answerChars,
    changed: row.changed,
    outcome: row.outcome,
    detail: row.detail,
    ms: row.ms,
    at: row.at,
    answer: row.answer,
    reads: (row.reads ?? []).flatMap(readOf),
    session: row.session ?? null,
    loaded: row.loaded ?? null,
    versions: versionsOf(Reflect.get(row, "versions"))
  };
}

// The answers a turn's row names it wrote, once the receiver's log carries them; one of a shape the console does not
// know is left out.
function versionsOf(versions: unknown): DraftVersion[] {
  if (!Array.isArray(versions)) return [];

  return versions.flatMap((version: unknown) => {
    const text: unknown = typeof version === "object" && version !== null ? Reflect.get(version, "text") : undefined;
    const opened: unknown = typeof version === "object" && version !== null ? Reflect.get(version, "opened") : undefined;

    return typeof text === "string" && (opened === "handed" || opened === "program") ? [{ text, opened }] : [];
  });
}

const READ_HOWS: readonly DraftReadHow[] = ["attached", "read", "held"];

// One piece the end names as read; one of a way the console does not know is left out.
function readOf(read: Schemas["RoundRead"]): DraftRead[] {
  const how = READ_HOWS.find((one) => one === read.how);

  if (how === undefined) return [];

  // The memory the piece is, once the receiver's end names one.
  const memoryId: unknown = Reflect.get(read, "memoryId");

  return [{ path: read.path, holds: read.holds ?? null, how, ...(typeof memoryId === "number" ? { memoryId } : {}) }];
}

/** Every row each named round's pipeline wrote, in the order written, its answers whole. */
export async function readRoundDrafts(chatId: number, rounds: readonly string[], signal?: AbortSignal): Promise<Map<string, DraftRow[]>> {
  if (rounds.length === 0) return new Map();

  const page = await receiverCall(receiver().GET("/rounds/pipeline", { params: { query: { room: chatId, rounds: rounds.join(",") } }, ...(signal === undefined ? {} : { signal }) }));

  return new Map(page.items.map((round) => [round.round, round.rows.map(rowOf)]));
}

/** What a round's rows say in short: how many turns the pipeline asked once the message stood — its instruction stages
 * and the check of what arrived meanwhile, and no row of the round's own message turn or of the agent's judgement
 * before it — how it ended and what it read from the brain; null for a round whose pipeline left no other row. */
export function draftSummaryOf(round: string, rows: readonly DraftRow[]): DraftSummary | null {
  const past = rows.filter((row) => row.kind !== "turn" && row.kind !== "supervisor");

  if (past.length === 0) return null;

  const end = past.findLast((row) => row.kind === "end");

  return { round, asked: past.filter((row) => row.kind !== "end").length, end: end?.outcome ?? null, reads: end?.reads ?? [], loaded: end?.loaded ?? null };
}

/** The summaries of a page's rounds; a receiver that does not answer leaves the page without them. */
export async function draftSummaries(chatId: number, rounds: readonly string[]): Promise<Map<string, DraftSummary>> {
  try {
    const read = await readRoundDrafts(chatId, rounds);
    const summaries = new Map<string, DraftSummary>();

    for (const [round, rows] of read) {
      const summary = draftSummaryOf(round, rows);

      if (summary !== null) summaries.set(round, summary);
    }

    return summaries;
  } catch (error) {
    console.error(`draft rows of chat ${chatId} could not be read:`, error);

    return new Map();
  }
}
