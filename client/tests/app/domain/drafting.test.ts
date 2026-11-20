import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import {
  draftAsked,
  draftKindText,
  draftOutcomeText,
  draftRound,
  endLine,
  gateRoundLines,
  readLabel,
  readList,
  roundLines,
  splitDraftJudgements
} from "../../../apps/web/app/domain/drafting";

import type { DraftRow } from "../../../apps/web/shared/drafting";
import type { Judgement } from "../../../apps/web/shared/types";

// The room's draft chip (docs/web.md, the room screen's draft chip): what it counts of a round's instruction pipeline
// and how it says each turn.

function judgement(id: number, verdict: string, stage = "draft"): Judgement {
  return { id, chatId: 5, messageId: "9", stage, verdict, detail: null, createdAt: 1_788_000_000 + id, round: "round-1" };
}

const logRow = (id: number, over: Partial<DraftRow>): DraftRow => ({
  id, number: id, question: "review", kind: "stage", answerChars: 110, changed: false, outcome: "pass", detail: null, ms: 1_000, at: 0, answer: "PASS", reads: [], ...over
});

describe("the draft chip", () => {
  const gate = [judgement(2, "END: message"), judgement(1, "ROUND 1 review: pass"), judgement(3, "PASS", "send")];

  test("takes the gate's draft rows off the verdict chip", () => {
    const { drafts, verdicts } = splitDraftJudgements(gate);

    expect(drafts.map((one) => one.id)).toEqual([2, 1]);
    expect(verdicts.map((one) => one.id)).toEqual([3]);
  });

  test("counts the turns asked once the message stood, from the page's summary or else the gate's rows", () => {
    const { drafts } = splitDraftJudgements(gate);

    expect(draftAsked({ round: "round-1", asked: 2, end: "message", reads: [] }, drafts)).toBe(2);
    expect(draftAsked(null, drafts)).toBe(1);
    expect(draftRound(null, drafts)).toBe("round-1");
    expect(draftRound(null, [])).toBeNull();
  });

  test("words each turn in a person's words, stands only a revision's message, and marks the slow one where it took twice any other", () => {
    const lines = roundLines(wording, [
      logRow(1, { question: "message", kind: "turn", outcome: "answered", ms: 11_818, answer: "the message" }),
      logRow(2, { question: "arrived", kind: "arrived", outcome: "no-verdict", ms: 900, answer: "the message, with the new words" }),
      logRow(3, { question: "audit", kind: "audit", outcome: "revised", changed: true, answer: "the message, its names right", ms: 1_500 }),
      logRow(4, { ms: 3_515 }),
      logRow(5, { question: "tone", outcome: "revised", changed: true, answer: "the message, revised", ms: 2_000 }),
      logRow(6, { question: "sources", outcome: "failed", answer: "a broken answer", ms: 400 }),
      logRow(7, { question: "", kind: "end", outcome: "message", ms: 15_333, answer: "" })
    ]);

    expect(lines.map((line) => [line.number, line.asked, line.decided, line.slow, line.changed, line.answer])).toEqual([
      [1, wording("room.label.draft_turn_message"), wording("room.label.draft_outcome_answered"), true, false, null],
      [2, wording("room.label.draft_turn_arrived"), wording("room.label.draft_outcome_no_verdict"), false, false, null],
      [3, wording("room.label.draft_turn_audit"), wording("room.label.draft_outcome_revised"), false, true, "the message, its names right"],
      [4, "review", wording("room.label.draft_outcome_pass"), false, false, null],
      [5, "tone", wording("room.label.draft_outcome_revised"), false, true, "the message, revised"],
      [6, "sources", wording("room.label.draft_outcome_failed"), false, false, null]
    ]);
    expect(endLine(wording, [logRow(5, { kind: "end", outcome: "message", ms: 15_333 })], [], null)).toEqual({ outcome: wording("room.label.draft_end_message"), ms: 15_333 });
    expect(roundLines(wording, [logRow(1, { ms: 100 }), logRow(2, { ms: 120 })]).some((line) => line.slow)).toBe(false);
  });

  test("stands the gate's rows for the turns where the log holds none, with no length and no time", () => {
    const { drafts } = splitDraftJudgements(gate);
    const lines = gateRoundLines(wording, drafts);

    expect(lines.map((line) => [line.number, line.asked, line.decided, line.chars, line.ms])).toEqual([[1, "review", wording("room.label.draft_outcome_pass"), null, null]]);
    expect(endLine(wording, null, drafts, null)?.outcome).toBe(wording("room.label.draft_end_message"));
    expect(endLine(wording, null, [], { round: "round-1", asked: 1, end: "skip", reads: [] })).toEqual({ outcome: wording("room.label.draft_end_skip"), ms: null });
  });

  test("lists what was read new before what was held, and names the room's due memories", () => {
    const reads = [
      { path: "memories/5", holds: null, how: "held" as const },
      { path: "knowledge/x.md", holds: "X", how: "read" as const },
      { path: "threads/user-1", holds: null, how: "attached" as const }
    ];

    expect(readList(reads).map((read) => read.path)).toEqual(["knowledge/x.md", "threads/user-1", "memories/5"]);
    expect(readList(reads).map((read) => readLabel(wording, read, 5))).toEqual(["X", "threads/user-1", wording("room.label.brain_read_due")]);
  });

  test("names the room's own situation note by what it is rather than by its path", () => {
    const read = { path: "room-situations/5", holds: null, how: "attached" as const };

    expect(readLabel(wording, read, 5)).toBe(wording("room.label.brain_read_situation"));
    // Another room's note keeps its path: this screen names only this room's note.
    expect(readLabel(wording, read, 6)).toBe("room-situations/5");
  });

  test("names the audit's kind in the pack's word", () => {
    expect(draftKindText(wording, "audit")).toBe(wording("room.label.draft_kind_audit"));
  });

  test("says a turn's outcome and the end's apart, and an outcome it does not know as it came", () => {
    expect(draftOutcomeText(wording, "skip", "turn")).toBe(wording("room.label.draft_outcome_skip"));
    expect(draftOutcomeText(wording, "skip", "end")).toBe(wording("room.label.draft_end_skip"));
    expect(draftOutcomeText(wording, "later", "end")).toBe("later");
  });
});
