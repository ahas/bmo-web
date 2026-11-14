import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import {
  draftAsked,
  draftChange,
  draftChanges,
  draftFormOf,
  draftListFault,
  draftOutcomeText,
  draftOwn,
  draftRound,
  draftTextSet,
  draftToPolicy,
  endLine,
  gateRoundLines,
  keptOff,
  readLabel,
  readList,
  roundLines,
  movedQuestion,
  questionNameFault,
  questionTextFault,
  splitDraftJudgements,
  switchedQuestion,
  withoutDraftText,
  withoutQuestion,
  withQuestion
} from "../../../apps/web/app/domain/draft-process";

import type { DraftProcessValues, DraftRow, SupervisorDraftView } from "../../../apps/web/shared/drafting";
import type { Judgement } from "../../../apps/web/shared/types";

// A supervisor's draft block and the room's draft chip (docs/web.md, the settings dialog's draft block and the room
// screen's draft chip): how a list of questions is picked in order, what a set is refused before it goes, what a save
// of the block sends, and what the chip counts and says.

const CATALOGUE = ["intent", "information", "facts", "promises", "fit", "final"];

const POLICY: DraftProcessValues = { rounds: ["intent", "facts", "final"], sendFrom: "", off: [], ceilingSeconds: 150, pastCeiling: "send" };

function view(over: Partial<SupervisorDraftView> = {}): SupervisorDraftView {
  return {
    source: "default",
    process: POLICY,
    policy: POLICY,
    questions: [
      { name: "supervisor", text: "Answer?", source: "default", policyText: "Answer?" },
      { name: "intent", text: "Why?", source: "default", policyText: "Why?" },
      { name: "facts", text: "True?", source: "default", policyText: "True?" },
      { name: "final", text: "Write it.", source: "default", policyText: "Write it." }
    ],
    ...over
  };
}

function judgement(id: number, verdict: string, stage = "draft"): Judgement {
  return { id, chatId: 5, messageId: "9", stage, verdict, detail: null, createdAt: 1_788_000_000 + id, round: "round-1" };
}

describe("an ordered pick of questions", () => {
  test("adds a question before final, and final with the first question of an empty list", () => {
    expect(withQuestion([], "facts")).toEqual(["facts", "final"]);
    expect(withQuestion(["intent", "final"], "facts")).toEqual(["intent", "facts", "final"]);
    expect(withQuestion(["intent", "final"], "intent")).toEqual(["intent", "final"]);
    expect(withQuestion([], "final")).toEqual(["final"]);
  });

  test("takes a question out, and final only where it stands alone", () => {
    expect(withoutQuestion(["intent", "final"], "intent")).toEqual(["final"]);
    expect(withoutQuestion(["intent", "final"], "final")).toEqual(["intent", "final"]);
    expect(withoutQuestion(["final"], "final")).toEqual([]);
  });

  test("moves a question among those before final and never past it", () => {
    expect(movedQuestion(["intent", "facts", "final"], "facts", -1)).toEqual(["facts", "intent", "final"]);
    expect(movedQuestion(["intent", "facts", "final"], "facts", 1)).toEqual(["intent", "facts", "final"]);
    expect(movedQuestion(["intent", "facts", "final"], "intent", -1)).toEqual(["intent", "facts", "final"]);
  });

  test("is refused before it goes where a name is not in the catalogue or final is not last", () => {
    expect(draftListFault(wording, ["intent", "final"], CATALOGUE)).toBeNull();
    expect(draftListFault(wording, [], CATALOGUE)).toBeNull();
    expect(draftListFault(wording, ["nothing", "final"], CATALOGUE)).toBe(wording("agents.error.draft_unknown_question"));
    expect(draftListFault(wording, ["final", "intent"], CATALOGUE)).toBe(wording("agents.error.draft_final_last"));
    expect(draftListFault(wording, ["intent"], CATALOGUE)).toBe(wording("agents.error.draft_final_last"));
  });

  test("switches a question off where it stands and on again, and never the one that writes the message", () => {
    expect(switchedQuestion([], "facts", false)).toEqual(["facts"]);
    expect(switchedQuestion(["facts"], "facts", false)).toEqual(["facts"]);
    expect(switchedQuestion(["facts", "intent"], "facts", true)).toEqual(["intent"]);
    expect(switchedQuestion([], "final", false)).toEqual([]);
  });

  test("leaves off only the questions a row's lists still hold", () => {
    expect(keptOff(["facts", "intent"], ["intent", "final"])).toEqual(["intent"]);
    expect(keptOff(["facts"], ["final"])).toEqual([]);
  });
});

describe("the numbers and the questions", () => {
  test("a new question's name is a lowercase word of letters, digits and dashes no question holds", () => {
    expect(questionNameFault(wording, "tone-check", CATALOGUE)).toBeNull();
    expect(questionNameFault(wording, "Tone", CATALOGUE)).toBe(wording("agents.error.draft_question_name"));
    expect(questionNameFault(wording, "intent", CATALOGUE)).toBe(wording("agents.error.draft_question_taken"));
  });

  test("a text is not empty and at most 4,000 characters", () => {
    expect(questionTextFault(wording, "Why?")).toBeNull();
    expect(questionTextFault(wording, "  ")).not.toBeNull();
    expect(questionTextFault(wording, "x".repeat(4_001))).not.toBeNull();
  });
});

describe("a supervisor's draft block", () => {
  test("follows the policy's process until a list or the bound differs from it, and sends nothing while nothing changed", () => {
    const form = draftFormOf(view());

    expect(draftOwn(form, POLICY)).toBe(false);
    expect(draftChanges(draftChange(view(), form))).toBe(false);

    form.rounds = ["facts", "final"];

    expect(draftOwn(form, POLICY)).toBe(true);
    expect(draftChange(view(), form)).toEqual({ process: { ...POLICY, rounds: ["facts", "final"] } });
  });

  test("counts what is switched off as a change, and drops from it a question neither list holds", () => {
    const form = draftFormOf(view());

    form.off = ["facts", "promises"];

    expect(draftOwn(form, POLICY)).toBe(true);
    expect(draftChange(view(), form).process?.off).toEqual(["facts"]);
  });

  test("keeps a process of its own that says what the policy's says, and takes it away once put back to the policy's", () => {
    const held = view({ source: "set", process: { ...POLICY, rounds: ["facts", "final"] } });
    const same = view({ source: "set" });

    expect(draftOwn(draftFormOf(same), POLICY)).toBe(true);
    expect(draftChanges(draftChange(same, draftFormOf(same)))).toBe(false);

    const back = draftToPolicy(draftFormOf(held), POLICY);

    expect(back).toMatchObject({ keepOwn: false, rounds: ["intent", "facts", "final"] });
    expect(draftOwn(back, POLICY)).toBe(false);
    expect(draftChange(held, back)).toEqual({ process: null });
  });

  test("sends a changed text and a question added, and nothing for a text as the receiver holds it", () => {
    const form = draftFormOf(view());

    form.questions[1]!.text = "Why was it said?";
    form.questions.push({ name: "tone", text: "Does it fit?", source: "set", policyText: null });
    form.rounds = ["intent", "tone", "final"];

    expect(draftChange(view(), form)).toEqual({ texts: { intent: "Why was it said?", tone: "Does it fit?" }, process: { ...POLICY, rounds: ["intent", "tone", "final"] } });
    expect(draftTextSet(form.questions[1]!)).toBe(true);
    expect(draftTextSet(form.questions[2]!)).toBe(false);
  });

  test("takes the console's text of a question away: the policy's text stands again, and one the console added leaves the catalogue and the list", () => {
    const set = view({
      source: "set",
      process: { ...POLICY, rounds: ["intent", "tone", "final"], off: ["tone"] },
      questions: [...view().questions.map((one) => (one.name === "intent" ? { ...one, text: "Why was it said?", source: "set" as const } : one)), { name: "tone", text: "Does it fit?", source: "set", policyText: null }]
    });
    const back = withoutDraftText(draftFormOf(set), "intent");

    expect(back.questions.find((one) => one.name === "intent")).toMatchObject({ text: "Why?", source: "default" });
    expect(draftChange(set, back)).toEqual({ removed: ["intent"] });

    const gone = withoutDraftText(draftFormOf(set), "tone");

    expect(gone.questions.map((one) => one.name)).not.toContain("tone");
    expect(gone).toMatchObject({ rounds: ["intent", "final"], off: [] });
    expect(draftChange(set, gone)).toEqual({ removed: ["tone"], process: { ...POLICY, rounds: ["intent", "final"], off: [] } });
    expect(withoutDraftText(draftFormOf(set), "nothing")).toEqual(draftFormOf(set));
  });
});

describe("the draft chip", () => {
  const gate = [judgement(2, "END: message"), judgement(1, "ROUND 1 final: answered"), judgement(3, "PASS", "send")];

  test("takes the gate's draft rows off the verdict chip", () => {
    const { drafts, verdicts } = splitDraftJudgements(gate);

    expect(drafts.map((one) => one.id)).toEqual([2, 1]);
    expect(verdicts.map((one) => one.id)).toEqual([3]);
  });

  test("counts the turns asked after the round's own, from the page's summary or else the gate's rows", () => {
    const { drafts } = splitDraftJudgements(gate);

    expect(draftAsked({ round: "round-1", asked: 2, end: "message", reads: [] }, drafts)).toBe(2);
    expect(draftAsked(null, drafts)).toBe(1);
    expect(draftRound(null, drafts)).toBe("round-1");
    expect(draftRound(null, [])).toBeNull();
  });

  test("words each round in a person's words, and marks the slow one where it took twice any other", () => {
    const logRow = (id: number, over: Partial<DraftRow>): DraftRow => ({
      id, number: id, question: "information", kind: "question", answerChars: 110, changed: false, outcome: "answered", detail: null, ms: 1_000, at: 0, answer: "notes", reads: [], ...over
    });
    const lines = roundLines(wording, [
      logRow(1, { ms: 11_818 }),
      logRow(2, { question: "facts", outcome: "send", ms: 3_515, changed: true }),
      logRow(3, { question: "", kind: "end", outcome: "message", ms: 15_333, answer: "" })
    ]);

    expect(lines.map((line) => [line.number, line.asked, line.decided, line.chars, line.ms, line.slow, line.changed])).toEqual([
      [1, wording("room.status.draft_question_information"), wording("room.label.draft_outcome_answered"), 110, 11_818, true, false],
      [2, wording("room.status.draft_question_facts"), wording("room.label.draft_outcome_send"), 110, 3_515, false, true]
    ]);
    expect(endLine(wording, [logRow(3, { kind: "end", outcome: "message", ms: 15_333 })], [], null)).toEqual({ outcome: wording("room.label.draft_end_message"), withheld: false, ms: 15_333 });
    expect(roundLines(wording, [logRow(1, { ms: 100 }), logRow(2, { ms: 120 })]).some((line) => line.slow)).toBe(false);
  });

  test("stands the gate's rows for the rounds where the log holds none, with no length and no time", () => {
    const { drafts } = splitDraftJudgements(gate);
    const lines = gateRoundLines(wording, drafts);

    expect(lines.map((line) => [line.number, line.asked, line.decided, line.chars, line.ms])).toEqual([[1, wording("agents.label.draft_question_final"), wording("room.label.draft_outcome_answered"), null, null]]);
    expect(endLine(wording, null, drafts, null)?.outcome).toBe(wording("room.label.draft_end_message"));
    expect(endLine(wording, null, [], { round: "round-1", asked: 1, end: "withheld", reads: [] })).toEqual({ outcome: wording("room.label.draft_end_withheld"), withheld: true, ms: null });
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

  test("says a turn's outcome and the end's apart, and an outcome it does not know as it came", () => {
    expect(draftOutcomeText(wording, "skip", "question")).toBe(wording("room.label.draft_outcome_skip"));
    expect(draftOutcomeText(wording, "skip", "end")).toBe(wording("room.label.draft_end_skip"));
    expect(draftOutcomeText(wording, "later", "end")).toBe("later");
  });
});
