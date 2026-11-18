import { FINAL_QUESTION } from "#shared/drafting";
import { countText } from "./numbers";
import { draftQuestionLabel } from "./working";

import type { DraftProcessValues, DraftQuestionView, DraftRead, DraftReadHow, DraftRow, DraftSummary, SupervisorDraftSave, SupervisorDraftView } from "#shared/drafting";
import type { JudgementMark } from "#shared/types";
import type { Translate } from "#shared/wording";

// What a supervisor's draft block holds while it is edited and what its save sends, how its fields are checked, and
// what a message's draft chip stands and spreads (docs/web.md, the settings dialog's draft block and the room
// screen's draft chip).

/** The gate's stage its rows of a round's draft process stand under. */
export const DRAFT_STAGE = "draft";

// The longest text a question takes.
export const QUESTION_TEXT_MAX = 4_000;

// A question's name: a lowercase word of letters, digits and dashes.
const QUESTION_NAME = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// A row's kind and how it ended, each by the key of the words it is said in; one the receiver names that the
// pack does not hold stands as the receiver's word.
const KIND_LABELS: Record<string, string> = {
  supervisor: "room.label.draft_kind_supervisor",
  turn: "room.label.draft_kind_turn",
  question: "room.label.draft_kind_question",
  item: "room.label.draft_kind_item",
  check: "room.label.draft_kind_check",
  end: "room.label.draft_kind_end"
};

const OUTCOME_LABELS: Record<string, string> = {
  answered: "room.label.draft_outcome_answered",
  send: "room.label.draft_outcome_send",
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

/** A row's values, as a set sends them. */
export function draftValues(row: DraftProcessValues): DraftProcessValues {
  return {
    rounds: [...row.rounds],
    sendFrom: row.sendFrom,
    off: [...row.off],
    ceilingSeconds: row.ceilingSeconds,
    pastCeiling: row.pastCeiling
  };
}

/** The questions switched off with one switched off or on again; `final` writes the message and is never off. */
export function switchedQuestion(off: readonly string[], name: string, on: boolean): string[] {
  if (name === FINAL_QUESTION) return off.filter((one) => one !== name);
  if (on) return off.filter((one) => one !== name);

  return off.includes(name) ? [...off] : [...off, name];
}

/** The questions switched off that a row's list still holds, in the order given: one taken out of the list is off
 * no more. */
export function keptOff(off: readonly string[], rounds: readonly string[]): string[] {
  return off.filter((name) => rounds.includes(name));
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

/** The list with the question at `from` carried to the place of the one at `to`, among those before `final`, which
 * stays last: a question carried onto `final` stands just before it, and `final` itself is never carried. */
export function placedQuestion(list: readonly string[], from: number, to: number): string[] {
  const asked = list.filter((one) => one !== FINAL_QUESTION);

  if (list[from] === FINAL_QUESTION || from >= asked.length) return [...list];

  const [carried] = asked.splice(from, 1);

  asked.splice(Math.min(to, asked.length), 0, carried!);

  return list.includes(FINAL_QUESTION) ? [...asked, FINAL_QUESTION] : asked;
}

/** Why a list cannot be sent, or null where it can: every name in the catalogue, and a list that holds questions
 * ends in `final` and holds it nowhere else. */
export function draftListFault(t: Translate, list: readonly string[], catalogue: readonly string[]): string | null {
  if (list.some((name) => !catalogue.includes(name))) return t("agents.error.draft_unknown_question");
  if (list.length > 0 && (list.at(-1) !== FINAL_QUESTION || list.indexOf(FINAL_QUESTION) !== list.length - 1)) return t("agents.error.draft_final_last");

  return null;
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

// A supervisor's draft block while it is edited.

/** What the block holds: the list, what is switched off, whether the supervisor keeps a process of its own whatever
 * those say, and its catalogue as it will stand. */
export interface DraftForm {
  keepOwn: boolean;
  rounds: string[];
  off: string[];
  questions: DraftQuestionView[];
}

/** The block as the receiver holds it. */
export function draftFormOf(view: SupervisorDraftView): DraftForm {
  return {
    keepOwn: view.source === "set",
    rounds: [...view.process.rounds],
    off: [...view.process.off],
    questions: view.questions.map((one) => ({ ...one }))
  };
}

const sameList = (one: readonly string[], other: readonly string[]): boolean => one.length === other.length && one.every((name, at) => name === other[at]);

// Whether what the block shows of a process is what another process holds; what is switched off counts only for the
// questions the list holds.
function sameProcess(form: DraftForm, process: DraftProcessValues): boolean {
  const off = (list: readonly string[], rounds: readonly string[]): string[] => keptOff(list, rounds).toSorted();

  return sameList(form.rounds, process.rounds) && sameList(off(form.off, form.rounds), off(process.off, process.rounds));
}

/** Whether the supervisor follows a process of its own as the block stands: one it keeps, or one that differs from
 * the policy's. */
export function draftOwn(form: DraftForm, policy: DraftProcessValues): boolean {
  return form.keepOwn || !sameProcess(form, policy);
}

/** The block put back to the policy's process, the supervisor keeping none of its own. */
export function draftToPolicy(form: DraftForm, policy: DraftProcessValues): DraftForm {
  return { ...form, keepOwn: false, rounds: [...policy.rounds], off: [...policy.off] };
}

/** The block with the console's text of one question taken away: a question the policy holds stands again in the
 * policy's text, and one the console added leaves the catalogue and the list. */
export function withoutDraftText(form: DraftForm, name: string): DraftForm {
  const question = form.questions.find((one) => one.name === name);

  if (question === undefined) return form;

  if (question.policyText !== null) {
    const policyText = question.policyText;

    return { ...form, questions: form.questions.map((one) => (one.name === name ? { ...one, text: policyText, source: "default" as const } : one)) };
  }

  return {
    ...form,
    rounds: withoutQuestion(form.rounds, name),
    off: form.off.filter((one) => one !== name),
    questions: form.questions.filter((one) => one.name !== name)
  };
}

/** Whether a question of the block carries a text of the console's: one the console added, or one whose text is not
 * the policy's. */
export function draftTextSet(question: DraftQuestionView): boolean {
  return question.policyText === null || question.text !== question.policyText;
}

/** What a save of the block sends, against what the receiver holds: the texts set, the process set or taken away,
 * and the texts taken away; a part with no change is left out. */
export function draftChange(view: SupervisorDraftView, form: DraftForm): SupervisorDraftSave {
  const save: SupervisorDraftSave = {};
  const held = new Map(view.questions.map((one) => [one.name, one]));
  const texts: Record<string, string> = {};
  const removed: string[] = [];

  for (const question of form.questions) {
    const before = held.get(question.name);

    if (!draftTextSet(question)) {
      if (before?.source === "set") removed.push(question.name);
    } else if (before === undefined || before.text !== question.text) {
      texts[question.name] = question.text;
    }
  }

  for (const before of view.questions) {
    if (before.source === "set" && !form.questions.some((one) => one.name === before.name)) removed.push(before.name);
  }

  if (Object.keys(texts).length > 0) save.texts = texts;
  if (removed.length > 0) save.removed = removed;

  if (!draftOwn(form, view.policy)) {
    if (view.source === "set") save.process = null;
  } else if (view.source === "default" || !sameProcess(form, view.process)) {
    save.process = { ...draftValues(view.process), rounds: [...form.rounds], off: keptOff(form.off, form.rounds) };
  }

  return save;
}

// The chip of a message's draft process.

/** The gate's rows of the process among a message's verdicts, and the verdicts that are not. */
export function splitDraftJudgements<J extends JudgementMark>(judgements: readonly J[]): { drafts: J[]; verdicts: J[] } {
  return { drafts: judgements.filter((one) => one.stage === DRAFT_STAGE), verdicts: judgements.filter((one) => one.stage !== DRAFT_STAGE) };
}

/** The round the chip reads: the page's summary's, else the gate's rows'. */
export function draftRound(summary: DraftSummary | null, drafts: readonly JudgementMark[]): string | null {
  return summary?.round ?? drafts.find((one) => one.round != null)?.round ?? null;
}

/** The chip's figure: the rounds the process asked, from the page's summary or, without it, the gate's rows of them. */
export function draftAsked(summary: DraftSummary | null, drafts: readonly JudgementMark[]): number {
  return summary?.asked ?? drafts.filter((one) => one.verdict.startsWith("ROUND ")).length;
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

// How a round read a piece of the brain, in the order the brain chip lists them: what went whole with the turn, what
// the agent pulled itself during the round, and what went as a mark of a version the session already held.
export const READ_ORDER: readonly DraftReadHow[] = ["attached", "read", "held"];

const READ_LABELS: Record<DraftReadHow, string> = {
  attached: "room.label.brain_read_attached",
  read: "room.label.brain_read_read",
  held: "room.label.brain_read_before"
};

/** How a piece was read, in its way's word. */
export function readHowText(t: Translate, how: DraftReadHow): string {
  return t(READ_LABELS[how]);
}

/** A piece's name: the index's words for it, or its path where the index does not list it. */
export function readName(read: DraftRead): string {
  const holds = read.holds?.trim() ?? "";

  return holds === "" ? read.path : holds;
}

/** A piece's name as the brain list says it to a person: the index's words for it, the room's own due memories by
 * what they are (the gate's docs/reference-selection.md, 「What a turn is given」), or its path. */
export function readLabel(t: Translate, read: DraftRead, chatId: number): string {
  const holds = read.holds?.trim() ?? "";

  if (holds !== "") return holds;
  if (read.path === `memories/${chatId}`) return t("room.label.brain_read_due");
  // The room's own situation note, which the round reads before it judges a line (the receiver's `docs/drafting.md`,
  // 「The situation note」), is named by what it is rather than by its path.
  if (read.path === `room-situations/${chatId}`) return t("room.label.brain_read_situation");

  return read.path;
}

/** Whether a piece was read new on the round — whole, or by the agent itself — rather than held from before. */
export function readNew(read: DraftRead): boolean {
  return read.how !== "held";
}

/** The pieces in the brain list's order: what the round read new, then what the session held. */
export function readList(reads: readonly DraftRead[]): DraftRead[] {
  return [...reads.filter(readNew), ...reads.filter((read) => !readNew(read))];
}

// The draft spread's lines (docs/web.md, the room screen's draft chip), in a person's words.

/** One round of the process as its line says it. */
export interface RoundLine {
  key: string;
  number: number;
  asked: string;
  decided: string;
  failed: boolean;
  // How long its answer is and how long it took, where the line knows them.
  chars: number | null;
  ms: number | null;
  changed: boolean;
  slow: boolean;
  answer: string | null;
}

/** What the round asked, in the pack's word for the question, its judgement before the round as a judgement. */
function askedText(t: Translate, kind: string, question: string): string {
  if (kind === "supervisor") return t("room.label.draft_kind_supervisor");

  return question === "" ? draftKindText(t, kind) : draftQuestionLabel(t, question);
}

// A round is the slow one where more than one ran and it took at least twice as long as any other.
function markSlow(lines: RoundLine[]): RoundLine[] {
  const timed = [...lines.filter((line) => line.ms !== null)].sort((one, other) => other.ms! - one.ms!);
  const [longest, next] = timed;

  if (longest === undefined || next === undefined || longest.ms! < next.ms! * 2) return lines;

  return lines.map((line) => (line === longest ? { ...line, slow: true } : line));
}

/** The round log's rows other than the end, each as its line says it. */
export function roundLines(t: Translate, rows: readonly DraftRow[]): RoundLine[] {
  return markSlow(
    rows
      .filter((row) => row.kind !== "end")
      .map((row) => ({
        key: `row:${row.id}`,
        number: row.number,
        asked: askedText(t, row.kind, row.question),
        decided: draftOutcomeText(t, row.outcome, row.kind),
        failed: row.outcome === "failed",
        chars: row.answerChars,
        ms: row.ms,
        changed: row.changed,
        slow: false,
        answer: draftAnswerShown(row) ? row.answer : null
      }))
  );
}

// The gate's own form of a round's row and its end (`ROUND <number> <name>: <outcome>`, `END: <outcome>`).
const GATE_ROUND = /^ROUND\s+(\d+)\s+(\S+):\s*(\S+)/;
const GATE_END = /^END:\s*(\S+)/;

/** The gate's `draft` verdicts as round lines, where the round log holds no row of the round. */
export function gateRoundLines(t: Translate, drafts: readonly JudgementMark[]): RoundLine[] {
  return [...drafts]
    .sort((one, other) => one.createdAt - other.createdAt || one.id - other.id)
    .flatMap((judgement) => {
      const round = GATE_ROUND.exec(judgement.verdict.trim());

      if (round === null) return [];

      return [{
        key: `judgement:${judgement.id}`,
        number: Number(round[1]),
        asked: draftQuestionLabel(t, round[2]!),
        decided: draftOutcomeText(t, round[3]!, "question"),
        failed: round[3] === "failed",
        chars: null,
        ms: null,
        changed: false,
        slow: false,
        answer: null
      }];
    });
}

/** How the round ended, as its end line says it: what went out and how long the whole took, from the round log's end
 * row, else from the gate's end verdict, else from the page's summary. */
export function endLine(t: Translate, rows: readonly DraftRow[] | null, drafts: readonly JudgementMark[], summary: DraftSummary | null): { outcome: string; withheld: boolean; ms: number | null } | null {
  const end = rows?.findLast((row) => row.kind === "end");

  if (end !== undefined) return { outcome: draftOutcomeText(t, end.outcome, "end"), withheld: end.outcome === "withheld", ms: end.ms };

  const gate = drafts.map((judgement) => GATE_END.exec(judgement.verdict.trim())?.[1]).findLast((outcome) => outcome !== undefined);
  const outcome = gate ?? summary?.end ?? null;

  return outcome === null ? null : { outcome: draftOutcomeText(t, outcome, "end"), withheld: outcome === "withheld", ms: null };
}

/** The pieces a round read, by how it read them, in the chip's order; a way it read none of stands as no group. */
export function readGroups(reads: readonly DraftRead[]): { how: DraftReadHow; reads: DraftRead[] }[] {
  return READ_ORDER.map((how) => ({ how, reads: reads.filter((read) => read.how === how) })).filter((group) => group.reads.length > 0);
}

/** A group's heading: its way's word, the held group's with how many it holds. */
export function readGroupText(t: Translate, how: DraftReadHow, count: number): string {
  return how === "held" ? t("room.label.brain_read_held", { n: countText(count) }) : t(READ_LABELS[how]);
}

/** What the round line of the draft log says of the brain: the names it read on this round, then how many it held. */
export function draftReadsParts(t: Translate, reads: readonly DraftRead[]): string[] {
  const named = reads.filter((read) => read.how !== "held").map(readName);
  const held = reads.filter((read) => read.how === "held").length;

  return [
    ...(named.length === 0 ? [] : [t("room.label.draft_reads", { names: named.join(", ") })]),
    ...(held === 0 ? [] : [t("room.label.brain_read_held", { n: countText(held) })])
  ];
}

/** One line of a message as it changed: the line as it stood, as it stands, or both where it is unchanged. */
export interface DraftDiffLine {
  kind: "same" | "removed" | "added";
  text: string;
}

/**
 * A message's own lines as a change from what stood before it (docs/web.md, the room screen's draft chip): a line the
 * rewrite kept stands plain, one it dropped stands as removed, and one it brought stands as added. Lines are compared
 * in order with a small longest-common-subsequence walk, so a repair that moved nothing says so plainly.
 */
export function draftDiff(before: string, after: string): DraftDiffLine[] {
  const was = before.split("\n");
  const now = after.split("\n");
  const kept: number[][] = Array.from({ length: was.length + 1 }, () => new Array<number>(now.length + 1).fill(0));

  for (let from = was.length - 1; from >= 0; from -= 1) {
    for (let to = now.length - 1; to >= 0; to -= 1) {
      kept[from]![to] = was[from] === now[to] ? kept[from + 1]![to + 1]! + 1 : Math.max(kept[from + 1]![to]!, kept[from]![to + 1]!);
    }
  }

  const lines: DraftDiffLine[] = [];
  let from = 0;
  let to = 0;

  while (from < was.length && to < now.length) {
    if (was[from] === now[to]) {
      lines.push({ kind: "same", text: was[from]! });
      from += 1;
      to += 1;
    } else if (kept[from + 1]![to]! >= kept[from]![to + 1]!) {
      lines.push({ kind: "removed", text: was[from]! });
      from += 1;
    } else {
      lines.push({ kind: "added", text: now[to]! });
      to += 1;
    }
  }

  for (; from < was.length; from += 1) lines.push({ kind: "removed", text: was[from]! });
  for (; to < now.length; to += 1) lines.push({ kind: "added", text: now[to]! });

  return lines;
}
