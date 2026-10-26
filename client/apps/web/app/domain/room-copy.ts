import { formatStamp, formatTime } from "bmo-ui/app/domain/time";

import { CHIP_LABELS } from "./chips";
import { DRAFT_STAGE, draftKindText, draftOutcomeText, draftReadsParts, draftRound, readGroups, readHowText, readName, splitDraftJudgements } from "./draft-process";
import { stageLabel } from "./judgements";
import { readRunLines } from "./log";
import { countText } from "./numbers";
import { toolName } from "./tool-view";
import { roundChip } from "./turns";
import { brainActions, turnActions } from "./working";

import type { DraftRead, DraftRow, DraftSummary } from "#shared/drafting";
import type { AgentLogLine, Judgement, RoundSpend, TurnActionsRef } from "#shared/types";
import type { Translate } from "#shared/wording";

// What the room screen copies of its messages: the record of several with every judgement left on them, the bare
// words of one, or the line that points at one.

// One message as the owner hands it on: when it was said, who said it, what it says, and every judgement the run
// left on it — all of them, whatever the screen is showing at the time.
export interface CopyItem {
  senderName: string;
  senderId: number | null;
  messageId: number;
  sentAt: number;
  text: string;
  judgements: Judgement[];
  // What the message's chips hold beyond its verdicts, read for the copy where a chip reads it only when opened.
  chips?: CopyChips;
}

// One call of the turn as a copy names it: its tool, and how much its result came to or that it failed.
export interface CopyCall {
  name: string;
  resultChars: number | null;
  failed: boolean;
}

export interface CopyChips {
  drafts: DraftRow[];
  calls: CopyCall[];
  // What the round's end names as read from the brain, and what the log says of the rest.
  reads: DraftRead[];
  brain: string[];
  spend: RoundSpend | null;
}

// What a message carries that its chips read: the round its draft process ran in, the runs its tools were called
// in, and what the round spent.
export interface ChipSource {
  judgements: readonly Judgement[];
  drafts: DraftSummary | null;
  actions: TurnActionsRef | null;
  spend: RoundSpend | null;
}

// Anything that carries words: the copy of a message, or the row standing for it.
export interface Said {
  text: string;
}

// What stands in for a sender whose id was never learned.
const MISSING = "-";

const DETAIL_INDENT = "      ";

export function reportOf(t: Translate, title: string, chatId: number, items: CopyItem[]): string {
  return [`# ${title} (${chatId})`, ...items.map((item) => blockOf(t, item))].join("\n\n");
}

// The message, then every chip's content in the order docs/web.md's 「What a copy holds」 gives: its verdicts, its
// draft process, its calls, what it read from the brain, what it spent, and its send last.
function blockOf(t: Translate, item: CopyItem): string {
  const head = `[${formatStamp(item.sentAt)}] ${item.senderName}(${item.senderId ?? MISSING}) #${item.messageId}: ${item.text}`;
  const sorted = [...item.judgements].sort((left, right) => left.createdAt - right.createdAt || left.id - right.id);
  const { drafts, verdicts } = splitDraftJudgements(sorted);
  const sent = verdicts.filter((one) => one.stage === SEND_STAGE);
  const judged = verdicts.filter((one) => one.stage !== SEND_STAGE);
  const chips = item.chips;

  return [
    head,
    ...judged.flatMap((judgement) => linesOf(t, judgement)),
    ...section(t(CHIP_LABELS.drafts), [
      ...drafts.map((judgement) => `${judgement.verdict}${judgement.detail !== null && judgement.detail.trim() !== "" && judgement.detail.trim() !== judgement.verdict.trim() ? ` ${judgement.detail.trim()}` : ""}`),
      ...(chips?.drafts ?? []).map((row) => draftLine(t, row))
    ]),
    ...section(t(CHIP_LABELS.tools), (chips?.calls ?? []).map((call) => callLine(t, call))),
    ...section(t(CHIP_LABELS.brain), [...readLines(t, chips?.reads ?? []), ...(chips?.brain ?? [])]),
    ...section(t(CHIP_LABELS.tokens), chips?.spend == null ? [] : spendLines(t, chips.spend)),
    ...sent.flatMap((judgement) => linesOf(t, judgement))
  ].join("\n");
}

// The stage a send's verdict stands under.
const SEND_STAGE = "send";

// A chip's content under its name, or nothing where the chip holds none.
function section(title: string, lines: readonly string[]): string[] {
  return lines.length === 0 ? [] : [`  - ${title}`, ...lines.map((line) => `${DETAIL_INDENT}${line}`)];
}

// One round row as the draft chip lists it.
function draftLine(t: Translate, row: DraftRow): string {
  const parts = [countText(row.number), row.question, draftKindText(t, row.kind), draftOutcomeText(t, row.outcome, row.kind)];

  if (row.kind !== "end") parts.push(t("room.label.draft_chars", { n: countText(row.answerChars) }), `${countText(row.ms)}ms`);
  else parts.push(...draftReadsParts(t, row.reads));

  return parts.filter((part) => part !== "").join(" ");
}

function callLine(t: Translate, call: CopyCall): string {
  if (call.failed) return `${call.name}: ${t("room.label.copy_call_failed")}`;

  return call.resultChars === null ? call.name : `${call.name}: ${t("room.label.copy_result_chars", { n: countText(call.resultChars) })}`;
}

// What the round spent, the chip's figure and each road its runs took.
function spendLines(t: Translate, spend: RoundSpend): string[] {
  const chip = roundChip(t, spend);

  return [
    chip.text,
    ...chip.lines.map((line) =>
      [line.stage, line.road, line.outcome ?? "", line.took, t("room.label.copy_tokens", { n: countText(line.tally.tokens) }), line.requests ?? ""].filter((part) => part !== "").join(" · ")
    )
  ];
}

/** The calls of a turn's runs as a copy names them, each with its result's size where the result came back. */
export function copyCalls(lines: readonly AgentLogLine[]): CopyCall[] {
  const results = new Map(lines.filter((line) => line.kind === "tool-result" && line.ref !== null).map((line) => [line.ref!, line]));

  return lines
    .filter((line) => line.kind === "tool")
    .map((line) => {
      const result = line.ref === null ? undefined : results.get(line.ref);

      return { name: line.tool?.name ?? toolName(line.name), resultChars: result === undefined ? null : result.text.length, failed: result?.state === "failed" };
    });
}

/**
 * What the turn's log says it read from the brain: each document it was handed — where its round's end names no piece,
 * since the end's pieces stand in their place — and each call that read the brain.
 */
export function copyBrain(lines: readonly AgentLogLine[], reads: readonly DraftRead[] = []): string[] {
  const actions = brainActions(turnActions(lines)).filter((action) => reads.length === 0 || action.kind !== "context");

  return actions.map((action) => (action.kind === "context" ? (action.name ?? action.text) : `${action.tool?.name ?? toolName(action.name)} ${action.text}`.trim()));
}

// Each piece the round's end names, by how it was read, with its path where the index's words stand for it.
function readLines(t: Translate, reads: readonly DraftRead[]): string[] {
  return readGroups(reads).flatMap((group) =>
    group.reads.map((read) => `${readHowText(t, group.how)}: ${readName(read) === read.path ? read.path : `${readName(read)} (${read.path})`}`)
  );
}

/**
 * What one message's chips hold, read for its copy: its round's rows and its runs' calls, each read as its chip reads
 * it when opened. A read that fails leaves that chip's content out rather than holding the copy.
 */
export async function copyChipsOf(chatId: number, source: ChipSource): Promise<CopyChips> {
  const round = draftRound(source.drafts, source.judgements.filter((one) => one.stage === DRAFT_STAGE));
  const at = source.actions;
  const [drafts, lines] = await Promise.all([
    round === null ? Promise.resolve([]) : $fetch<{ rows: DraftRow[] }>(`/api/rooms/${chatId}/drafts`, { query: { round } }).then((answer) => answer.rows).catch((): DraftRow[] => []),
    at === null ? Promise.resolve([]) : Promise.all(at.runs.map((run) => readRunLines(at.agent, run))).then((runs) => runs.flat()).catch((): AgentLogLine[] => [])
  ]);

  const reads = source.drafts?.reads ?? [];

  return { drafts, calls: copyCalls(lines), reads, brain: copyBrain(lines, reads), spend: source.spend };
}

// The verdicts that are the answer a message drew: what they carry is the answering message's own words.
const ANSWER_MARKERS = new Set(["REPLY", "SENT"]);

// The detail is the whole of what the stage said; when the verdict already is that whole, repeating it under
// itself says nothing. A verdict that is the message's answer stands as its word alone, since the answer's words
// are another message's (docs/web.md, 「What a copy holds」).
function linesOf(t: Translate, judgement: Judgement): string[] {
  const marker = /^([A-Z][A-Z-]*)(?::|$)/.exec(judgement.verdict.trim())?.[1] ?? null;
  const label = `  - ${stageLabel(t, judgement.stage)} (${formatTime(judgement.createdAt)})`;

  if (marker !== null && ANSWER_MARKERS.has(marker)) {
    return [`${label}: ${marker}`];
  }

  const head = `${label}: ${judgement.verdict}`;
  const detail = judgement.detail?.trim() ?? "";

  if (detail === "" || detail === judgement.verdict.trim()) {
    return [head];
  }

  return [head, ...detail.split("\n").map((line) => `${DETAIL_INDENT}${line}`)];
}

// The bare words of one message, with nothing the screen stands around them: no room, no name, no time, no
// judgement. What is taken when the words themselves are wanted somewhere else, rather than the record of the
// message.
export function bodyOf(item: Said): string {
  return item.text;
}

// Which room and which message a row is, and nothing of what it says: the line the owner hands an agent to point
// at one message. The two numbers are what find it; the name is for whoever reads the line.
export function messageRef(t: Translate, room: string, chatId: number, messageId: number): string {
  return t("room.message.message_ref", { room, chatId, messageId });
}

// A message kept with no words has nothing to take.
export function hasBody(item: Said): boolean {
  return item.text.trim() !== "";
}
