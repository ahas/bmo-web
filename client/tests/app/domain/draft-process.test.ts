import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import {
  draftAsked,
  draftKeyLabel,
  draftListFault,
  draftListText,
  draftNumberFault,
  draftOutcomeText,
  draftRound,
  draftRowFor,
  draftSummaryLines,
  movedQuestion,
  questionNameFault,
  questionTextFault,
  splitDraftJudgements,
  withoutQuestion,
  withQuestion
} from "../../../apps/web/app/domain/draft-process";

import type { DraftProcessView } from "../../../apps/web/shared/drafting";
import type { Judgement } from "../../../apps/web/shared/types";

// The draft-process table's cells and the room's draft chip (docs/web.md, the tier tab's draft-process table and the
// room screen's draft chip): how a list of questions is picked in order, what a set is refused before it goes, which
// row a key's turn reads, and what the chip counts and says.

const CATALOGUE = ["intent", "information", "facts", "promises", "fit", "final"];

function row(over: Partial<DraftProcessView>): DraftProcessView {
  return { provider: "*", tier: "*", agentName: "*", rounds: ["intent", "final"], sendFrom: "", light: ["final"], lightChars: 12, ceilingSeconds: 150, turnSeconds: null, pastCeiling: "send", source: "default", ...over };
}

function judgement(id: number, verdict: string, stage = "draft"): Judgement {
  return { id, chatId: 5, messageId: 9, stage, verdict, detail: null, createdAt: 1_788_000_000 + id, round: "round-1" };
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

  test("stands in order, or as no questions", () => {
    expect(draftListText(wording, ["intent", "final"])).toBe("intent → final");
    expect(draftListText(wording, [])).toBe(wording("agents.label.draft_no_questions"));
  });
});

describe("the numbers and the questions", () => {
  test("a number is a whole number within its bounds", () => {
    expect(draftNumberFault(wording, "150", 1, 3_600)).toBeNull();
    for (const text of ["0", "3601", "1.5", "", "x"]) expect(draftNumberFault(wording, text, 1, 3_600)).not.toBeNull();
  });

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

describe("the row a key's turn reads", () => {
  const rows = [row({}), row({ provider: "claude-code", rounds: ["information", "final"] }), row({ agentName: "agent-a", rounds: ["final"] }), row({ tier: "Light", rounds: [] })];

  test("is the most specific that matches: an agent's before a provider's before a tier's", () => {
    expect(draftRowFor(rows, { provider: "claude-code", tier: "Light", agentName: "agent-a" })?.agentName).toBe("agent-a");
    expect(draftRowFor(rows, { provider: "claude-code", tier: "Light", agentName: "agent-b" })?.provider).toBe("claude-code");
    expect(draftRowFor(rows, { provider: "codex", tier: "Light", agentName: "agent-b" })?.tier).toBe("Light");
    expect(draftRowFor(rows, { provider: "codex", tier: "Fine", agentName: "agent-b" })).toBe(rows[0]!);
  });

  test("names its key by its three places, any in the pack's word for it", () => {
    expect(draftKeyLabel(wording, { provider: "*", tier: "Light", agentName: "agent-a" })).toBe(`${wording("agents.label.draft_any")} · Light · agent-a`);
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

  test("says the gate's rows as it wrote them, else how the process ended", () => {
    const { drafts } = splitDraftJudgements(gate);

    expect(draftSummaryLines(wording, null, drafts)).toEqual(["ROUND 1 final: answered", "END: message"]);
    expect(draftSummaryLines(wording, { round: "round-1", asked: 1, end: "withheld", reads: [] }, [])).toEqual([
      wording("room.label.draft_ended", { outcome: wording("room.label.draft_end_withheld") })
    ]);
    expect(draftSummaryLines(wording, { round: "round-1", asked: 1, end: null, reads: [] }, [])).toEqual([]);
  });

  test("says a turn's outcome and the end's apart, and an outcome it does not know as it came", () => {
    expect(draftOutcomeText(wording, "skip", "question")).toBe(wording("room.label.draft_outcome_skip"));
    expect(draftOutcomeText(wording, "skip", "end")).toBe(wording("room.label.draft_end_skip"));
    expect(draftOutcomeText(wording, "later", "end")).toBe("later");
  });
});
