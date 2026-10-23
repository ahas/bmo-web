import { ANY_KEY, FINAL_QUESTION } from "#shared/drafting";
import { agentProviderNames } from "#shared/types";
import { countText } from "./numbers";
import { modeLabel } from "./status";

import type { DraftKey, DraftProcessValues, DraftProcessView, DraftRow, DraftSource, DraftSummary, PastCeiling } from "#shared/drafting";
import type { AgentMode, Judgement } from "#shared/types";
import type { Translate } from "#shared/wording";

// What the agents screen's draft-process table says and how its cells are checked and sent, and what a message's
// draft chip stands and spreads (docs/web.md, the tier tab's draft-process table and the room screen's draft chip).

/** The gate's stage its rows of a round's draft process stand under. */
export const DRAFT_STAGE = "draft";

// The bounds the receiver holds a row's two numbers to.
export const LIGHT_CHARS_MIN = 0;
export const LIGHT_CHARS_MAX = 1_000;
export const CEILING_SECONDS_MIN = 1;
export const CEILING_SECONDS_MAX = 3_600;

// The longest text a question takes.
export const QUESTION_TEXT_MAX = 4_000;

// A question's name: a lowercase word of letters, digits and dashes.
const QUESTION_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const SOURCE_LABELS: Record<DraftSource, string> = {
  set: "agents.label.draft_source_set",
  default: "agents.label.draft_source_default"
};

const PAST_CEILING_LABELS: Record<PastCeiling, string> = {
  send: "agents.label.draft_past_send",
  skip: "agents.label.draft_past_skip"
};

export const PAST_CEILINGS: readonly PastCeiling[] = ["send", "skip"];

// A row's kind and how it ended, each by the key of the words it is said in; one the receiver names that the
// pack does not hold stands as the receiver's word.
const KIND_LABELS: Record<string, string> = {
  turn: "room.label.draft_kind_turn",
  question: "room.label.draft_kind_question",
  item: "room.label.draft_kind_item",
  check: "room.label.draft_kind_check",
  end: "room.label.draft_kind_end"
};

const OUTCOME_LABELS: Record<string, string> = {
  answered: "room.label.draft_outcome_answered",
  skip: "room.label.draft_outcome_skip",
  failed: "room.label.draft_outcome_failed"
};

const END_LABELS: Record<string, string> = {
  message: "room.label.draft_end_message",
  skip: "room.label.draft_end_skip",
  withheld: "room.label.draft_end_withheld",
  "ceiling-message": "room.label.draft_end_ceiling_message",
  "ceiling-skip": "room.label.draft_end_ceiling_skip"
};

/** One place of a key, in words: `*` in the pack's word for any. */
export function draftKeyText(t: Translate, part: string): string {
  return part === ANY_KEY ? t("agents.label.draft_any") : part;
}

/** A provider's place of a key, in words: any, a provider the console carries by its label, or the name as it is. */
export function draftProviderText(t: Translate, provider: string): string {
  if (provider === ANY_KEY) return draftKeyText(t, provider);

  return (agentProviderNames as readonly string[]).includes(provider) ? modeLabel(t, provider as AgentMode) : provider;
}

/** A key as a box names it: its three places, each a name or any. */
export function draftKeyLabel(t: Translate, key: DraftKey): string {
  return [draftProviderText(t, key.provider), draftKeyText(t, key.tier), draftKeyText(t, key.agentName)].join(" · ");
}

/** A key's identity, for a row's place in a list. */
export function draftKeyId(key: DraftKey): string {
  return `${key.provider}/${key.tier}/${key.agentName}`;
}

export function sameDraftKey(one: DraftKey, other: DraftKey): boolean {
  return one.provider === other.provider && one.tier === other.tier && one.agentName === other.agentName;
}

export function draftSourceText(t: Translate, source: DraftSource): string {
  return t(SOURCE_LABELS[source]);
}

export function pastCeilingText(t: Translate, past: PastCeiling): string {
  return t(PAST_CEILING_LABELS[past]);
}

/** A list of questions, in order, or the pack's words for none. */
export function draftListText(t: Translate, list: readonly string[]): string {
  return list.length === 0 ? t("agents.label.draft_no_questions") : list.join(" → ");
}

/** The row a key's turn reads now: the most specific of those matching it, an agent's before a provider's and a
 * provider's before a tier's, as the receiver matches. */
export function draftRowFor(rows: readonly DraftProcessView[], key: DraftKey): DraftProcessView | null {
  const fits = (held: string, asked: string): boolean => held === ANY_KEY || held === asked;
  const weight = (row: DraftKey): number => (row.agentName === ANY_KEY ? 0 : 4) + (row.provider === ANY_KEY ? 0 : 2) + (row.tier === ANY_KEY ? 0 : 1);
  let best: DraftProcessView | null = null;

  for (const row of rows) {
    if (!fits(row.provider, key.provider) || !fits(row.tier, key.tier) || !fits(row.agentName, key.agentName)) continue;
    if (best === null || weight(row) > weight(best)) best = row;
  }

  return best;
}

/** A row's values, as a set sends them. */
export function draftValues(row: DraftProcessValues): DraftProcessValues {
  return { rounds: [...row.rounds], light: [...row.light], lightChars: row.lightChars, ceilingSeconds: row.ceilingSeconds, pastCeiling: row.pastCeiling };
}

/** A list with a question added before `final`, `final` joining it where the list was empty. */
export function withQuestion(list: readonly string[], name: string): string[] {
  if (name === FINAL_QUESTION) return list.length === 0 ? [FINAL_QUESTION] : [...list];
  if (list.includes(name)) return [...list];

  const asked = list.filter((one) => one !== FINAL_QUESTION);

  return [...asked, name, FINAL_QUESTION];
}

/** A list with a question taken out: `final` only where it stands alone, which empties the list. */
export function withoutQuestion(list: readonly string[], name: string): string[] {
  if (name === FINAL_QUESTION) return list.length === 1 ? [] : [...list];

  return list.filter((one) => one !== name);
}

/** A list with one question moved up (-1) or down (+1) among the questions before `final`. */
export function movedQuestion(list: readonly string[], name: string, by: -1 | 1): string[] {
  const asked = list.filter((one) => one !== FINAL_QUESTION);
  const at = asked.indexOf(name);
  const to = at + by;

  if (at < 0 || to < 0 || to >= asked.length) return [...list];

  [asked[at], asked[to]] = [asked[to]!, asked[at]!];

  return list.includes(FINAL_QUESTION) ? [...asked, FINAL_QUESTION] : asked;
}

/** Why a list cannot be sent, or null where it can: every name in the catalogue, and a list that holds questions
 * ends in `final` and holds it nowhere else. */
export function draftListFault(t: Translate, list: readonly string[], catalogue: readonly string[]): string | null {
  if (list.some((name) => !catalogue.includes(name))) return t("agents.error.draft_unknown_question");
  if (list.length > 0 && (list.at(-1) !== FINAL_QUESTION || list.indexOf(FINAL_QUESTION) !== list.length - 1)) return t("agents.error.draft_final_last");

  return null;
}

/** Why a typed whole number cannot be sent, or null where it can. */
export function draftNumberFault(t: Translate, text: string, min: number, max: number): string | null {
  const value = text.trim() === "" ? Number.NaN : Number(text);

  return Number.isInteger(value) && value >= min && value <= max ? null : t("agents.error.draft_number", { min: countText(min), max: countText(max) });
}

/** Why a new question's name cannot be sent, or null where it can. */
export function questionNameFault(t: Translate, name: string, taken: readonly string[]): string | null {
  if (!QUESTION_NAME.test(name)) return t("agents.error.draft_question_name");
  if (taken.includes(name)) return t("agents.error.draft_question_taken");

  return null;
}

/** Why a question's text cannot be sent, or null where it can. */
export function questionTextFault(t: Translate, text: string): string | null {
  return text.trim() === "" || text.length > QUESTION_TEXT_MAX ? t("agents.error.draft_question_text", { max: countText(QUESTION_TEXT_MAX) }) : null;
}

// The chip of a message's draft process.

/** The gate's rows of the process among a message's verdicts, and the verdicts that are not. */
export function splitDraftJudgements(judgements: readonly Judgement[]): { drafts: Judgement[]; verdicts: Judgement[] } {
  return { drafts: judgements.filter((one) => one.stage === DRAFT_STAGE), verdicts: judgements.filter((one) => one.stage !== DRAFT_STAGE) };
}

/** The round the chip reads: the page's summary's, else the gate's rows'. */
export function draftRound(summary: DraftSummary | null, drafts: readonly Judgement[]): string | null {
  return summary?.round ?? drafts.find((one) => one.round != null)?.round ?? null;
}

/** The chip's figure: the rounds the process asked, from the page's summary or, without it, the gate's rows of them. */
export function draftAsked(summary: DraftSummary | null, drafts: readonly Judgement[]): number {
  return summary?.asked ?? drafts.filter((one) => one.verdict.startsWith("ROUND ")).length;
}

/** The summary's lines: the gate's rows as it wrote them, else how the process ended. */
export function draftSummaryLines(t: Translate, summary: DraftSummary | null, drafts: readonly Judgement[]): string[] {
  if (drafts.length > 0) return [...drafts].sort((one, other) => one.createdAt - other.createdAt || one.id - other.id).map((one) => one.verdict);

  return summary?.end == null ? [] : [t("room.label.draft_ended", { outcome: draftOutcomeText(t, summary.end, "end") })];
}

export function draftKindText(t: Translate, kind: string): string {
  const key = KIND_LABELS[kind];

  return key === undefined ? kind : t(key);
}

/** How a row ended: a turn's outcome, or the process's end's where the row is its end. */
export function draftOutcomeText(t: Translate, outcome: string, kind: string): string {
  const key = (kind === "end" ? END_LABELS : OUTCOME_LABELS)[outcome];

  return key === undefined ? outcome : t(key);
}

/** Whether a row's answer stands folded under it: a question's that wrote one. */
export function draftAnswerShown(row: DraftRow): boolean {
  return row.kind === "question" && row.answer !== null && row.answer !== "";
}
