import type { Judgement, JudgementRoad, KeptCounts, LiveRun, QueuedMessage, RoundOpening, TurnSpeaker } from "#shared/types";
import { chatAgent } from "#shared/agent-names";
import { companionOf } from "./agents";

import type { Translate } from "#shared/wording";

export interface StageMeta {
  slug: string;
  label: string;
}

export type VerdictTone = "success" | "error" | "neutral";

// The stages the bot records, in the order a run produces them, each with the key of the name the
// owner uses for it. A gate's stage names the same key the gate list does, so a gate is never
// called two things.
export const STAGES: readonly StageMeta[] = [
  { slug: "chat", label: "room.label.stage_chat" },
  { slug: "companion", label: "room.label.stage_companion" },
  // The content gate, the leak check that no longer runs, the rewrite it asked for and an addition it
  // once asked for. Nothing records under these names any more and the turns that did are still
  // read, so they keep their names here.
  { slug: "content-judge", label: "gates.label.content_judge" },
  { slug: "content-rewrite", label: "room.label.stage_content_rewrite" },
  { slug: "content-append", label: "room.label.stage_content_append" },
  { slug: "owed-again", label: "room.label.stage_owed_again" },
  { slug: "language-again", label: "room.label.stage_language_again" },
  { slug: "record-again", label: "room.label.stage_record_again" },
  { slug: "wake-again", label: "room.label.stage_wake_again" },
  { slug: "rule-again", label: "room.label.stage_rule_again" },
  { slug: "wording-again", label: "room.label.stage_wording_again" },
  { slug: "output-format", label: "gates.label.output_format" },
  { slug: "system-documents", label: "gates.label.system_documents" },
  { slug: "room-rules", label: "gates.label.room_rules" },
  { slug: "library-knowledge", label: "gates.label.library_knowledge" },
  { slug: "situation-rules", label: "gates.label.situation_rules" },
  // The one gate that picked every kind of reference before the three did. Nothing records under
  // this name any more and the turns that did are still read, so it keeps its name here.
  { slug: "classifier", label: "gates.label.classifier" },
  // Two gates that no longer run, whose recorded turns are still read under their names.
  { slug: "output-decide", label: "gates.label.output_decide" },
  { slug: "output-verify", label: "gates.label.output_verify" },
  // The person book's search is a picker like the three and stands beside them, but it is not one
  // of the gates the gate screen tries by hand, so it is named here rather than in that list.
  { slug: "people-search", label: "room.label.stage_people_search" },
  { slug: "sanitizer", label: "room.label.stage_sanitizer" },
  { slug: "send", label: "room.label.stage_send" },
  // A message a turn read before the last one it read, pointing at the message its verdicts stand under.
  { slug: "read-with", label: "room.label.stage_read_with" },
  // The ending of a round that went silent, which the room also stands as a line of its own.
  { slug: "skipped", label: "room.label.stage_skipped" }
];

const STAGE_LABELS = new Map(STAGES.map((stage) => [stage.slug, stage.label]));

// A verdict that passed, answered, went out or came out clean reads as success, one that failed as
// error, and everything else — a skip, a defuse, a wait, a format decision, a list of slugs — stays
// neutral. A gate writes its marker in capitals as a word of its own, so only the marker standing
// whole — at the end, or before a colon or a space — counts: a slug list opening "failed-…" or prose
// opening "Fail …" is not a verdict mark.
const VERDICT_TONES: readonly [string, VerdictTone][] = [
  ["PASS", "success"],
  ["REPLY", "success"],
  ["SENT", "success"],
  ["CLEAN", "success"],
  ["FAIL", "error"],
  ["FAILED", "error"]
];

// The words a gate or a turn ends its work on (the gate's documents): a verdict opening with one of them
// is final, and the message it stands under is judged no longer (docs/web.md, the room screen's verdicts).
const ENDING_MARKERS: readonly string[] = ["SKIP", "CLEAN", "DEFUSE", "REPLY", "SENT", "PASS", "FAIL", "FAILED"];

// Whether a verdict opens with this marker as a word of its own.
function opensWith(verdict: string, marker: string): boolean {
  const head = verdict.trim();

  return head.startsWith(marker) && /^(?:$|[:\s])/.test(head.slice(marker.length));
}

// Whether a verdict ends what its stage was doing.
export function endsJudging(verdict: string): boolean {
  return ENDING_MARKERS.some((marker) => opensWith(verdict, marker));
}

// A stage the app does not know keeps its own name rather than disappearing.
export function stageLabel(t: Translate, stage: string): string {
  // The chat stage is the chat agent's own turn, called by the label the deployment gives it.
  if (stage === "chat" && chatAgent().label !== "") return chatAgent().label;

  const key = STAGE_LABELS.get(stage);

  return key === undefined ? stage : t(key);
}

// A quiet instruction's sort in the owner's words: the key its producer named, worded here as every
// screen word is (the receiver's docs/bmo-window.md, 「Quiet instruction」). A key the app does not know keeps its own
// name, and a row that names none stands as a quiet instruction.
const INSTRUCTION_SORTS = new Map([
  ["browse", "room.label.sort_browse"],
  ["companion_cut", "room.label.sort_companion_cut"],
  ["console_talk", "room.label.sort_console_talk"],
  ["document_reload", "room.label.sort_document_reload"],
  ["impact_mismatch", "room.label.sort_impact_mismatch"],
  ["notice", "room.label.sort_notice"],
  ["overtime", "room.label.sort_overtime"],
  ["raised_row", "room.label.sort_raised_row"],
  ["random_draw", "room.label.sort_random_draw"],
  ["relay", "room.label.sort_relay"],
  ["reminder", "room.label.sort_reminder"],
  ["remote_browser", "room.label.sort_remote_browser"],
  ["resume_condition", "room.label.sort_resume_condition"],
  ["run_failure", "room.label.sort_run_failure"],
  ["run_state", "room.label.sort_run_state"],
  ["say", "room.label.sort_say"],
  ["search", "room.label.sort_search"],
  ["song", "room.label.sort_song"],
  ["unfinished", "room.label.sort_unfinished"],
  ["watch", "room.label.sort_watch"]
]);

export function sortLabel(t: Translate, sort: string | null): string {
  if (sort === null) {
    return t("room.label.quiet_instruction");
  }

  const key = INSTRUCTION_SORTS.get(sort);

  return key === undefined ? sort : t(key);
}

// One stretch of an instruction's whole text: words as they were written, or a line of facts the
// system recorded — a JSON object or array standing alone on its line — read into its names and
// values, so a reader sees the facts rather than the record's punctuation.
export type InstructionPart = { kind: "words"; text: string } | { kind: "facts"; rows: FactRow[] };

// One recorded fact: where it stands in the record, a nested name after its parent's and a list's
// member by its place, and its value.
export interface FactRow {
  label: string;
  value: string;
}

export function instructionParts(text: string): InstructionPart[] {
  const parts: InstructionPart[] = [];
  let words: string[] = [];

  for (const line of text.split("\n")) {
    const facts = factsOf(line);

    if (facts === null) {
      words.push(line);
      continue;
    }

    if (words.length > 0) {
      parts.push({ kind: "words", text: words.join("\n") });
      words = [];
    }

    parts.push({ kind: "facts", rows: factRows(facts, []) });
  }

  if (words.length > 0) {
    parts.push({ kind: "words", text: words.join("\n") });
  }

  return parts;
}

function factsOf(line: string): object | null {
  const trimmed = line.trim();

  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return null;
  }

  try {
    const value: unknown = JSON.parse(trimmed);

    return typeof value === "object" && value !== null ? value : null;
  } catch {
    return null;
  }
}

// A list of plain values stands as one fact; a list of records stands each member's facts under its
// place, counted from one.
function factRows(value: unknown, path: string[]): FactRow[] {
  const label = path.join(" › ");

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return [{ label, value: "[]" }];
    }

    if (value.every((item) => typeof item !== "object" || item === null)) {
      return [{ label, value: value.map(String).join(", ") }];
    }

    const parent = path.slice(0, -1);
    const name = path.at(-1);

    return value.flatMap((item, at) => factRows(item, [...parent, name === undefined ? String(at + 1) : `${name} ${at + 1}`]));
  }

  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value);

    return entries.length === 0 ? [{ label, value: "{}" }] : entries.flatMap(([key, item]) => factRows(item, [...path, key]));
  }

  return [{ label, value: String(value) }];
}

// How a road ended, in the owner's words. An outcome the app does not know keeps the word the
// record used, the same way a stage does.
const ROAD_OUTCOMES = new Map([
  ["answered", "room.label.road_answered"],
  ["timeout", "room.label.road_timeout"],
  ["busy-skip", "room.label.road_busy_skip"],
  ["too-large", "room.label.road_too_large"],
  ["error", "room.label.road_error"],
  ["stopped", "room.label.road_stopped"],
  ["unavailable", "room.label.road_unavailable"]
]);

export function roadOutcome(t: Translate, outcome: string): string {
  const key = ROAD_OUTCOMES.get(outcome);

  return key === undefined ? outcome : t(key);
}

// Which road it was, as the record names it: the provider, and the model where the road got as
// far as naming one — a provider that was not there to ask names none.
export function roadName(road: JudgementRoad): string {
  return road.model === "" ? road.provider : `${road.provider} · ${road.model}`;
}

export function verdictTone(verdict: string): VerdictTone {
  const match = VERDICT_TONES.find(([marker]) => opensWith(verdict, marker));

  return match?.[1] ?? "neutral";
}

// What a stage said, whole. The verdict is the short line the archive keeps — a first line,
// cut where the bot cut it — and the detail is everything the stage wrote. Where the detail
// carries the verdict's own words it is the fuller of the two and stands alone, keeping the
// marker the verdict puts in front (REPLY, PASS, FAIL); where the two say different things
// both are kept, the verdict first. Nothing here shortens anything.
export function judgementText(verdict: string, detail: string | null): string {
  const line = verdict.trim();
  const whole = detail?.trim() ?? "";

  if (whole === "" || whole === line) {
    return line;
  }

  const wholeSaid = said(whole);
  const opening = said(line.replace(/…$/, ""));

  if (opening !== "" && wholeSaid.startsWith(opening)) {
    return whole;
  }

  const marker = /^([A-Z][A-Z-]*):[ \t]*/.exec(line);
  const behind = marker === null ? "" : said(line.slice(marker[0].length).replace(/…$/, ""));

  if (marker !== null && behind !== "" && wholeSaid.startsWith(behind)) {
    return `${marker[1]}: ${whole}`;
  }

  return `${line}\n${whole}`;
}

// The words of a text with its punctuation between them levelled, so the same list written one
// slug to a line and the same list written with commas are seen for what they are: one text.
function said(text: string): string {
  return text.replace(/[\s,]+/g, " ").trim();
}

// Where a message's chips stand: under its words, not under its picture. The picture takes the
// outer edge on whichever side the bubble is, so the chips are held off that same edge by the
// width of it.
// Which of a row's detail cards stand. The summary is the row's one fold: open, every stage's
// card stands, including one that arrives while it is open; closed, none does. No card folds on
// its own and nothing of this is remembered between openings — which message was left open a
// minute ago is where a reader had got to, not a standing choice.
export function openedCards(judgements: readonly Judgement[], expanded: boolean): Judgement[] {
  return expanded ? [...judgements] : [];
}

// What the verdict mark says of a message as a whole (docs/web.md, 「Room screen」): that it is still being
// judged, and once it is not, that something passed or answered and nothing failed, that anything
// failed, or that none of them did either — a skip, a pick, a `none`, a message read with another.
export type VerdictState = "judging" | VerdictTone;

export function verdictState(judgements: readonly Judgement[], judging: boolean): VerdictState {
  if (judging) {
    return "judging";
  }

  const tones = judgements.map((judgement) => verdictTone(judgement.verdict));

  return tones.includes("error") ? "error" : tones.includes("success") ? "success" : "neutral";
}

// Which of a room's messages are being judged right now: one a gate of the room is judging, the one
// the room holds queued for the chat agent's turn, from the moment it was put into the queue, and the one the chat agent's
// turn going in the room read last, from the turn's start until the room has read its answer, so
// the gaps between its gates count too. A companion's turn writes its verdict on its own answer, so
// the message it read is judged by none of it. A turn whose start the screen did not see names no
// message, and is known by its gates alone (docs/web.md, 「Room screen」). A message already holding a
// final verdict written since its judging began is judged no longer, whatever the picture still says of
// it; a judging whose beginning is not known is ended by none.
export function judgedNow(
  chatId: number,
  runs: readonly LiveRun[],
  queued: readonly QueuedMessage[],
  turns: readonly { messageId: number | null; speaker?: TurnSpeaker; startedAt?: number }[],
  judgements: ReadonlyMap<number, readonly Judgement[]> = new Map()
): Set<number> {
  // Each message being judged, with the moment the earliest of what judges it began.
  const since = new Map<number, number>();
  const judging = (messageId: number, from: number | undefined): void => {
    since.set(messageId, Math.min(since.get(messageId) ?? Infinity, from ?? Infinity));
  };

  for (const run of runs) {
    if (run.kind === "gate" && run.chatId === chatId && run.messageId !== null) {
      judging(run.messageId, run.startedAt);
    }
  }

  for (const message of queued) {
    if (message.chatId === chatId) {
      judging(message.messageId, message.since);
    }
  }

  for (const turn of turns) {
    if (companionOf(turn.speaker) === undefined && turn.messageId !== null) {
      judging(turn.messageId, turn.startedAt);
    }
  }

  const judged = new Set<number>();

  for (const [messageId, from] of since) {
    const ended = (judgements.get(messageId) ?? []).some((judgement) => judgement.createdAt >= from && endsJudging(judgement.verdict));

    if (!ended) {
      judged.add(messageId);
    }
  }

  return judged;
}

// The cards of one turn, with what opened it said once above them (docs/web.md, 「Room screen」).
export interface OpenedTurn {
  key: string;
  opening: RoundOpening | null;
  judgements: Judgement[];
}

// A row's cards in the turns they belong to, in the order they stand. A card whose round the record
// does not name is a turn of its own.
export function openedTurns(judgements: readonly Judgement[]): OpenedTurn[] {
  const turns: OpenedTurn[] = [];

  for (const judgement of judgements) {
    const key = judgement.round ?? `judgement:${judgement.id}`;
    const last = turns.at(-1);

    if (last?.key === key) {
      last.judgements.push(judgement);
      last.opening ??= judgement.opening ?? null;
      continue;
    }

    turns.push({ key, opening: judgement.opening ?? null, judgements: [judgement] });
  }

  return turns;
}

// What a gate's card says of the narrowing where the gate was asked about none: how many candidates
// its libraries held before it and how many it left, and whether it kept by the item rule alone.
export interface NarrowedOffer {
  held: number;
  left: number;
  itemRule: boolean;
}

export function narrowedOffer(judgement: Judgement): NarrowedOffer | null {
  const offer = judgement.opening?.offers.findLast((one) => one.stage === judgement.stage && one.asked === 0);

  if (offer === undefined) {
    return null;
  }

  return { held: offer.held, left: offer.asked, itemRule: offer.rules?.length === 1 && offer.rules[0] === "item" };
}

// What each rule kept for a gate's card, from its round's offers record: null where the record holds no row for
// the card's gate.
export function keptOffer(judgement: Judgement): KeptCounts | null {
  return judgement.opening?.offers.findLast((one) => one.stage === judgement.stage)?.kept ?? null;
}

export function judgementsByMessage(judgements: Judgement[]): Map<number, Judgement[]> {
  const index = new Map<number, Judgement[]>();

  for (const judgement of judgements) {
    if (judgement.messageId === null) {
      continue;
    }

    const bucket = index.get(judgement.messageId);

    if (bucket === undefined) {
      index.set(judgement.messageId, [judgement]);
      continue;
    }

    bucket.push(judgement);
  }

  for (const bucket of index.values()) {
    bucket.sort((left, right) => left.createdAt - right.createdAt || left.id - right.id);
  }

  return index;
}
