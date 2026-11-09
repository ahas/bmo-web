// The receiver's draft process (the receiver's `docs/drafting.md`): its table and its questions, read and set for the
// agents screen, and what a round's process wrote, read for the room's draft chip. A refusal of a set is said by the
// pack's sentence for the receiver's code on these routes, which says what the receiver checks.
import { receiver, receiverCall } from "./receiver";

import type { DraftKey, DraftProcessesView, DraftProcessValues, DraftProcessView, DraftQuestionView, DraftRead, DraftReadHow, DraftRow, DraftSummary, DraftSource, PastCeiling } from "#shared/drafting";
import type { components } from "@bmo/receiver-client/schema";

type Schemas = components["schemas"];

// A set the receiver refuses is refused for what it checks of the row or the question, and a key it holds no
// console row for is the one thing a removal is refused for.
const PROCESS_CODES: Readonly<Record<string, string>> = { "bad-request": "agents.error.draft_process_refused", "not-found": "agents.error.draft_process_missing" };
const QUESTION_CODES: Readonly<Record<string, string>> = {
  "bad-request": "agents.error.draft_question_refused",
  conflict: "agents.error.draft_question_named",
  "not-found": "agents.error.draft_question_missing"
};

const sourceOf = (source: string): DraftSource => (source === "set" ? "set" : "default");

function processOf(row: Schemas["DraftProcess"]): DraftProcessView {
  return {
    provider: row.provider,
    tier: row.tier,
    agentName: row.agentName,
    rounds: row.rounds,
    sendFrom: row.sendFrom,
    light: row.light,
    off: row.off,
    lightChars: row.lightChars,
    ceilingSeconds: row.ceilingSeconds,
    pastCeiling: row.pastCeiling === "skip" ? "skip" : "send",
    source: sourceOf(row.source)
  };
}

function questionOf(question: Schemas["DraftQuestion"]): DraftQuestionView {
  return { name: question.name, text: question.text, source: sourceOf(question.source) };
}

function rowOf(row: Schemas["DraftRound"]): DraftRow {
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
    loaded: row.loaded ?? null
  };
}

const READ_HOWS: readonly DraftReadHow[] = ["attached", "read", "held"];

// One piece the end names as read; one of a way the console does not know is left out.
function readOf(read: Schemas["DraftRead"]): DraftRead[] {
  const how = READ_HOWS.find((one) => one === read.how);

  if (how === undefined) return [];

  // The memory the piece is, once the receiver's end names one.
  const memoryId: unknown = Reflect.get(read, "memoryId");

  return [{ path: read.path, holds: read.holds ?? null, how, ...(typeof memoryId === "number" ? { memoryId } : {}) }];
}

/** The table and the catalogue, read together. */
export async function readDraftProcesses(): Promise<DraftProcessesView> {
  const asking = receiver();
  const [rows, questions] = await Promise.all([receiverCall(asking.GET("/draft-processes")), receiverCall(asking.GET("/draft-questions"))]);

  return { rows: rows.items.map(processOf), questions: questions.items.map(questionOf) };
}

/** One row set, as the receiver now holds it. */
export async function writeDraftProcess(key: DraftKey, values: DraftProcessValues): Promise<DraftProcessView> {
  const saved = await receiverCall(
    receiver().PUT("/draft-processes/{provider}/{tier}/{agentName}", { params: { path: { ...key } }, body: { ...values } }),
    { codes: PROCESS_CODES }
  );

  return processOf(saved);
}

/** The console's row of one key taken away. */
export async function eraseDraftProcess(key: DraftKey): Promise<void> {
  await receiverCall(receiver().DELETE("/draft-processes/{provider}/{tier}/{agentName}", { params: { path: { ...key } } }), { codes: PROCESS_CODES });
}

/** One question's text set, as the receiver now holds it. */
export async function writeDraftQuestion(name: string, text: string): Promise<DraftQuestionView> {
  return questionOf(await receiverCall(receiver().PUT("/draft-questions/{name}", { params: { path: { name } }, body: { text } }), { codes: QUESTION_CODES }));
}

/** The console's text of one question taken away: a question the console added leaves the catalogue, and one the
 * policy holds stands again in the policy's text. */
export async function eraseDraftQuestion(name: string): Promise<void> {
  await receiverCall(receiver().DELETE("/draft-questions/{name}", { params: { path: { name } } }), { codes: QUESTION_CODES });
}

/** Every row each named round's process wrote, in the order written, its answers whole. */
export async function readRoundDrafts(chatId: number, rounds: readonly string[], signal?: AbortSignal): Promise<Map<string, DraftRow[]>> {
  if (rounds.length === 0) return new Map();

  const page = await receiverCall(receiver().GET("/rounds/drafts", { params: { query: { room: chatId, rounds: rounds.join(",") } }, ...(signal === undefined ? {} : { signal }) }));

  return new Map(page.items.map((round) => [round.round, round.rows.map(rowOf)]));
}

/** What a round's rows say in short: how many rounds the process asked — its questions, items and checks, and no row
 * of the round's own turn or of the agent's judgement before it — how it ended and what it read from the brain; null
 * for a round whose process left no other row. */
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

/** A key's place read off a route's text: a name, or `*` for any. */
export function draftKeyPart(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/** The values a set's body names, or null where one is missing or of the wrong sort; what the values say is the
 * receiver's to judge. */
export function draftValuesOf(body: Record<string, unknown> | null | undefined): DraftProcessValues | null {
  const names = (value: unknown): string[] | null => (Array.isArray(value) && value.every((one) => typeof one === "string") ? (value as string[]) : null);
  const whole = (value: unknown): number | null => (typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null);
  const rounds = names(body?.rounds);
  const light = names(body?.light);
  const lightChars = whole(body?.lightChars);
  const ceilingSeconds = whole(body?.ceilingSeconds);
  const pastCeiling = body?.pastCeiling === "send" || body?.pastCeiling === "skip" ? (body.pastCeiling as PastCeiling) : null;
  // A value the table carries unshown: absent from an older body, empty.
  const sendFrom = body?.sendFrom === undefined ? "" : typeof body.sendFrom === "string" ? body.sendFrom : null;
  // The questions switched off: absent from a body that switches none off.
  const off = body?.off === undefined ? [] : names(body.off);

  if (rounds === null || light === null || off === null || lightChars === null || ceilingSeconds === null || pastCeiling === null || sendFrom === null) return null;

  return { rounds, sendFrom, light, off, lightChars, ceilingSeconds, pastCeiling };
}
