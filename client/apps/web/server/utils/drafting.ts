// The receiver's draft process (the receiver's `docs/drafting.md`): one supervisor's process and its questions, read
// and set for the supervisor's settings, and what a round's process wrote, read for the room's draft chip. A refusal
// of a set is said by the pack's sentence for the receiver's code on these routes, which says what the receiver
// checks.
import { receiver, receiverCall } from "./receiver";

import { ANY_KEY } from "#shared/drafting";

import type { DraftProcessValues, DraftQuestionView, DraftRead, DraftReadHow, DraftRow, DraftSummary, DraftSource, PastCeiling, SupervisorDraftSave, SupervisorDraftView } from "#shared/drafting";
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

function valuesOf(row: Schemas["DraftProcess"]): DraftProcessValues {
  return {
    rounds: row.rounds,
    sendFrom: row.sendFrom,
    off: row.off,
    ceilingSeconds: row.ceilingSeconds,
    pastCeiling: row.pastCeiling === "skip" ? "skip" : "send"
  };
}

// A process that asks nothing, where the receiver answers no row at all.
const NO_PROCESS: DraftProcessValues = { rounds: [], sendFrom: "", off: [], ceilingSeconds: 0, pastCeiling: "send" };

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

/** A supervisor's draft process: the row it reads, the policy's, and its catalogue with the policy's texts beside
 * its own. */
export async function readSupervisorDraft(agentName: string): Promise<SupervisorDraftView> {
  const asking = receiver();
  const [own, every, questions, policyQuestions] = await Promise.all([
    receiverCall(asking.GET("/draft-processes", { params: { query: { agentName } } })),
    receiverCall(asking.GET("/draft-processes")),
    receiverCall(asking.GET("/draft-questions", { params: { query: { agentName } } })),
    receiverCall(asking.GET("/draft-questions"))
  ]);
  const row = own.items[0];
  const policy = every.items.find((one) => sourceOf(one.source) === "default");
  const policyTexts = new Map(policyQuestions.items.map((one) => [one.name, one.text]));

  return {
    source: row === undefined ? "default" : sourceOf(row.source),
    process: row === undefined ? NO_PROCESS : valuesOf(row),
    policy: policy === undefined ? NO_PROCESS : valuesOf(policy),
    questions: questions.items.map((one): DraftQuestionView => ({ name: one.name, text: one.text, source: sourceOf(one.source), policyText: policyTexts.get(one.name) ?? null }))
  };
}

/** One save of a supervisor's draft settings, in the order that keeps every list naming a question the receiver
 * holds: the texts set, then the process, then the texts taken away. Answers the settings as the receiver now holds
 * them. */
export async function writeSupervisorDraft(agentName: string, save: SupervisorDraftSave): Promise<SupervisorDraftView> {
  const asking = receiver();
  const key = { provider: ANY_KEY, tier: ANY_KEY, agentName };

  for (const [name, text] of Object.entries(save.texts ?? {})) {
    await receiverCall(asking.PUT("/draft-questions/{agentName}/{name}", { params: { path: { agentName, name } }, body: { text } }), { codes: QUESTION_CODES });
  }

  if (save.process === null) {
    await receiverCall(asking.DELETE("/draft-processes/{provider}/{tier}/{agentName}", { params: { path: key } }), { codes: PROCESS_CODES });
  } else if (save.process !== undefined) {
    await receiverCall(asking.PUT("/draft-processes/{provider}/{tier}/{agentName}", { params: { path: key }, body: { ...save.process } }), { codes: PROCESS_CODES });
  }

  for (const name of save.removed ?? []) {
    await receiverCall(asking.DELETE("/draft-questions/{agentName}/{name}", { params: { path: { agentName, name } } }), { codes: QUESTION_CODES });
  }

  return await readSupervisorDraft(agentName);
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

/** The values a set's body names, or null where one is missing or of the wrong sort; what the values say is the
 * receiver's to judge. */
export function draftValuesOf(body: Record<string, unknown> | null | undefined): DraftProcessValues | null {
  const names = (value: unknown): string[] | null => (Array.isArray(value) && value.every((one) => typeof one === "string") ? (value as string[]) : null);
  const whole = (value: unknown): number | null => (typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null);
  const rounds = names(body?.rounds);
  const ceilingSeconds = whole(body?.ceilingSeconds);
  const pastCeiling = body?.pastCeiling === "send" || body?.pastCeiling === "skip" ? (body.pastCeiling as PastCeiling) : null;
  // A value the process carries unshown: absent from an older body, empty.
  const sendFrom = body?.sendFrom === undefined ? "" : typeof body.sendFrom === "string" ? body.sendFrom : null;
  // The questions switched off: absent from a body that switches none off.
  const off = body?.off === undefined ? [] : names(body.off);

  if (rounds === null || off === null || ceilingSeconds === null || pastCeiling === null || sendFrom === null) return null;

  return { rounds, sendFrom, off, ceilingSeconds, pastCeiling };
}

/** One save a body names, or null where a part it names is of the wrong sort; a part it leaves out is left as it
 * stands. */
export function draftSaveOf(body: Record<string, unknown> | null | undefined): SupervisorDraftSave | null {
  if (typeof body !== "object" || body === null) return null;

  const save: SupervisorDraftSave = {};

  if (body.process === null) {
    save.process = null;
  } else if (body.process !== undefined) {
    const values = typeof body.process === "object" ? draftValuesOf(body.process as Record<string, unknown>) : null;

    if (values === null) return null;

    save.process = values;
  }

  if (body.texts !== undefined) {
    if (typeof body.texts !== "object" || body.texts === null || Array.isArray(body.texts)) return null;

    const texts = Object.entries(body.texts as Record<string, unknown>);

    if (texts.some(([name, text]) => name.trim() === "" || typeof text !== "string" || text.trim() === "")) return null;

    save.texts = Object.fromEntries(texts.map(([name, text]) => [name.trim(), text as string]));
  }

  if (body.removed !== undefined) {
    if (!Array.isArray(body.removed) || body.removed.some((one) => typeof one !== "string" || one.trim() === "")) return null;

    save.removed = (body.removed as string[]).map((one) => one.trim());
  }

  return save;
}
