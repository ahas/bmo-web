import { countText } from "./numbers";

import type { DraftRead, DraftReadHow, DraftRow, DraftSummary } from "#shared/drafting";
import type { JudgementMark } from "#shared/types";
import type { Translate } from "#shared/wording";

// What a message's draft chip stands and spreads (docs/web.md, the room screen's draft chip): the rows the round's
// instruction pipeline wrote (the receiver's `docs/instruction.md`, 「The round log」), in a person's words.

/** The gate's stage its rows of a round's pipeline stand under. */
export const DRAFT_STAGE = "draft";

// A row's kind and how it ended, each by the key of the words it is said in; one the receiver names that the
// pack does not hold stands as the receiver's word.
const KIND_LABELS: Record<string, string> = {
  supervisor: "room.label.draft_kind_supervisor",
  turn: "room.label.draft_kind_turn",
  arrived: "room.label.draft_kind_arrived",
  audit: "room.label.draft_kind_audit",
  stage: "room.label.draft_kind_stage",
  end: "room.label.draft_kind_end"
};

// A turn's and the arrived check's outcomes, and the audit's and a stage's, which pass the message or revise it.
const OUTCOME_LABELS: Record<string, string> = {
  answered: "room.label.draft_outcome_answered",
  send: "room.label.draft_outcome_send",
  "no-verdict": "room.label.draft_outcome_no_verdict",
  skip: "room.label.draft_outcome_skip",
  failed: "room.label.draft_outcome_failed",
  pass: "room.label.draft_outcome_pass",
  revised: "room.label.draft_outcome_revised"
};

const END_LABELS: Record<string, string> = {
  message: "room.label.draft_end_message",
  skip: "room.label.draft_end_skip"
};

// The names a row goes by that are no stage's: the round's message turn, the check of the words that arrived
// meanwhile and the audit before the stages, each said in the pack's word for it. A stage stands under its own name, as
// the supervisor's settings name it.
const TURN_LABELS: Record<string, string> = {
  message: "room.label.draft_turn_message",
  arrived: "room.label.draft_turn_arrived",
  audit: "room.label.draft_turn_audit"
};

// What a row of the round log is named by: the pack's word for the message turn, the arrived check and the audit, and
// a stage's own name.
function draftTurnLabel(t: Translate, question: string): string {
  const key = TURN_LABELS[question];

  return key === undefined ? question : t(key);
}

// The chip of a message's draft.

/** The gate's rows of the pipeline among a message's verdicts, and the verdicts that are not. */
export function splitDraftJudgements<J extends JudgementMark>(judgements: readonly J[]): { drafts: J[]; verdicts: J[] } {
  return { drafts: judgements.filter((one) => one.stage === DRAFT_STAGE), verdicts: judgements.filter((one) => one.stage !== DRAFT_STAGE) };
}

/** The round the chip reads: the page's summary's, else the gate's rows'. */
export function draftRound(summary: DraftSummary | null, drafts: readonly JudgementMark[]): string | null {
  return summary?.round ?? drafts.find((one) => one.round != null)?.round ?? null;
}

/** The chip's figure: the turns the pipeline asked once the message stood, from the page's summary or, without it,
 * the gate's rows of them. */
export function draftAsked(summary: DraftSummary | null, drafts: readonly JudgementMark[]): number {
  return summary?.asked ?? drafts.filter((one) => one.verdict.startsWith("ROUND ")).length;
}

export function draftKindText(t: Translate, kind: string): string {
  const key = KIND_LABELS[kind];

  return key === undefined ? kind : t(key);
}

/** How a row ended: a turn's or a stage's outcome, or the pipeline's end's where the row is its end. */
export function draftOutcomeText(t: Translate, outcome: string, kind: string): string {
  const key = (kind === "end" ? END_LABELS : OUTCOME_LABELS)[outcome];

  return key === undefined ? outcome : t(key);
}

/** Whether a row's answer stands under it: the audit's or a stage's that revised the message, its answer being the
 * message as revised. One that passed answered `PASS` alone and one that failed wrote no message, which its outcome
 * already says; every other turn's answer is the message the bubble holds or none. */
export function draftAnswerShown(row: DraftRow): boolean {
  return (row.kind === "stage" || row.kind === "audit") && row.outcome === "revised" && row.answer !== null && row.answer !== "";
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
  // The room's own situation note, which the round reads before it judges a line (the receiver's
  // `docs/instruction.md`, 「The situation note」), is named by what it is rather than by its path.
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

/** One turn of the pipeline as its line says it. */
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

  return question === "" ? draftKindText(t, kind) : draftTurnLabel(t, question);
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
        asked: draftTurnLabel(t, round[2]!),
        decided: draftOutcomeText(t, round[3]!, "stage"),
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
export function endLine(t: Translate, rows: readonly DraftRow[] | null, drafts: readonly JudgementMark[], summary: DraftSummary | null): { outcome: string; ms: number | null } | null {
  const end = rows?.findLast((row) => row.kind === "end");

  if (end !== undefined) return { outcome: draftOutcomeText(t, end.outcome, "end"), ms: end.ms };

  const gate = drafts.map((judgement) => GATE_END.exec(judgement.verdict.trim())?.[1]).findLast((outcome) => outcome !== undefined);
  const outcome = gate ?? summary?.end ?? null;

  return outcome === null ? null : { outcome: draftOutcomeText(t, outcome, "end"), ms: null };
}

/** The pieces a round read, by how it read them, in the chip's order; a way it read none of stands as no group. */
export function readGroups(reads: readonly DraftRead[]): { how: DraftReadHow; reads: DraftRead[] }[] {
  return READ_ORDER.map((how) => ({ how, reads: reads.filter((read) => read.how === how) })).filter((group) => group.reads.length > 0);
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
