import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";

import { endsJudging, instructionParts, judgedNow, judgementText, keptOffer, narrowedOffer, openedCards, openedTurns, roadName, roadOutcome, sortLabel, verdictState, verdictTone } from "../../../apps/web/app/domain/judgements";

import type { GateOfferRecord, Judgement, LiveRun, RoundOpening } from "../../../apps/web/shared/types";
import { WORKER } from "../../support/ids";
import KO from "../../fixtures/app/domain/judgements.test.ko.json";

describe("judgementText", () => {
  test("a list the two write differently is one text, not two", () => {
    // The classifier answers one slug to a line; the verdict keeps them on one line.
    expect(
      judgementText("room-founding, owner-habits, room-inside-jokes", "room-founding\nowner-habits\nroom-inside-jokes")
    ).toBe("room-founding\nowner-habits\nroom-inside-jokes");
    expect(judgementText("none", "none")).toBe("none");
  });

  test("a detail that says something else keeps both, the verdict first", () => {
    expect(judgementText(KO.line_20, KO.line_20_2)).toBe(KO.line_20_3);
  });

  test("a multi-line detail comes through with its lines intact", () => {
    expect(judgementText(KO.line_24, KO.line_24_2)).toBe(KO.line_24_3);
  });

  test("an empty detail changes nothing", () => {
    expect(judgementText("PASS", "")).toBe("PASS");
    expect(judgementText("PASS", null)).toBe("PASS");
    expect(judgementText("  PASS  ", "  PASS  ")).toBe("PASS");
  });

  test("the verdict's tone is read off its opening marker", () => {
    expect(verdictTone(KO.line_34)).toBe("error");
    expect(verdictTone(KO.line_35)).toBe("success");
    expect(verdictTone("PLAIN")).toBe("neutral");
  });

  test("only a marker standing whole counts, never a name that opens with one", () => {
    expect(verdictTone("PASS")).toBe("success");
    expect(verdictTone("FAIL")).toBe("error");
    expect(verdictTone(KO.line_42)).toBe("error");
    expect(verdictTone("failed-hold-release-by-bmo, job-failure-report")).toBe("neutral");
    expect(verdictTone("FAILED-HOLD-RELEASE-BY-AGENT")).toBe("neutral");
    expect(verdictTone("passage-notes")).toBe("neutral");
    // What went out or came out clean passed; a send that failed failed; a skip or a defuse did neither.
    expect(verdictTone("SENT")).toBe("success");
    expect(verdictTone("CLEAN")).toBe("success");
    expect(verdictTone("FAILED")).toBe("error");
    expect(verdictTone("SKIP: no candidates")).toBe("neutral");
    expect(verdictTone("DEFUSE")).toBe("neutral");
    expect(verdictTone(KO.line_46)).toBe("neutral");
  });
});



// Opening a message's judgements is one press, and the summary is the only thing that folds.
describe("what stands open when a row of judgements is opened", () => {
  function judgement(id: number, stage: string): Judgement {
    return { id, chatId: -1, messageId: 7, stage, verdict: "PASS", detail: null, createdAt: 100 };
  }

  const judgements = [judgement(1, "classifier"), judgement(2, "chat"), judgement(3, "content-judge")];

  test("every one of them, so one press says the whole of it", () => {
    expect(openedCards(judgements, true).map((one) => one.id)).toEqual([1, 2, 3]);
  });

  test("and closing the row puts them all away, so it goes back to the line it was", () => {
    expect(openedCards(judgements, false)).toEqual([]);
  });

  test("a message with no judgement opens to nothing either way", () => {
    expect(openedCards([], true)).toEqual([]);
  });

  test("a stage that arrives while the row is open stands open with the rest", () => {
    expect(openedCards([...judgements, judgement(4, "people-search")], true).map((one) => one.id)).toEqual([1, 2, 3, 4]);
  });
});

// The verdict mark says one thing of the message's verdicts as a whole.
describe("what the verdict mark says", () => {
  function judgement(id: number, verdict: string): Judgement {
    return { id, chatId: -1, messageId: 7, stage: "chat", verdict, detail: null, createdAt: 100 };
  }

  test("a message being judged is judging, whatever has arrived so far", () => {
    expect(verdictState([], true)).toBe("judging");
    expect(verdictState([judgement(1, KO.line_85)], true)).toBe("judging");
  });

  test("once judged: any failure is a failure, a pass among the rest a pass, and neither neutral", () => {
    expect(verdictState([judgement(1, "none"), judgement(2, KO.line_89), judgement(3, KO.line_89_2)], false)).toBe("success");
    expect(verdictState([judgement(1, "PASS"), judgement(2, KO.line_90)], false)).toBe("error");
    expect(verdictState([judgement(1, "SKIP"), judgement(2, "READ: #12")], false)).toBe("neutral");
    expect(verdictState([], false)).toBe("neutral");
  });
});

// A message is being judged while a gate of its room judges it, while it waits queued for the chat agent's turn,
// and while the chat agent's turn that read it last runs; a companion's turn judges nothing it read, and another
// room's gate or queue nothing here.
describe("which messages are being judged", () => {
  const gate = (chatId: number, messageId: number | null, kind: LiveRun["kind"] = "gate") => ({ kind, chatId, messageId }) as LiveRun;

  test("a gate of the room names its message, and the chat agent's turn the message it read last", () => {
    const judged = judgedNow(5, [gate(5, 11), gate(6, 12), gate(5, 13, "runner"), gate(5, null)], [], [{ messageId: 14 }]);

    expect([...judged].sort()).toEqual([11, 14]);
  });

  test("the message the room holds queued for a turn is judged before any turn has begun", () => {
    const queued = [{ chatId: 5, messageId: 15, since: 1 }, { chatId: 6, messageId: 16, since: 1 }];

    expect([...judgedNow(5, [], queued, [])]).toEqual([15]);
  });

  test("a companion's turn and a turn whose start the screen did not see name none", () => {
    expect([...judgedNow(5, [], [], [{ messageId: 21, speaker: { id: 3, name: KO.line_115 } }, { messageId: null }])]).toEqual([]);
  });

  // A verdict that ends a stage's work is final: a message holding one written since its judging began is judged no
  // longer, whatever the queue or the turns still say; one written before it, or a verdict that ends nothing, leaves
  // it judged.
  test("a final verdict written since the judging began ends it", () => {
    const verdict = (messageId: number, verdict: string, createdAt: number): Judgement =>
      ({ id: createdAt, chatId: 5, messageId, stage: "people-search", verdict, detail: null, createdAt }) as Judgement;
    const queued = [{ chatId: 5, messageId: 31, since: 100 }, { chatId: 5, messageId: 32, since: 100 }, { chatId: 5, messageId: 33, since: 100 }];
    const turns = [{ messageId: 34, startedAt: 100 }, { messageId: 35 }];
    const held = new Map<number, Judgement[]>([
      [31, [verdict(31, "SKIP: no candidates", 120)]],
      [32, [verdict(32, "CLEAN", 90)]],
      [33, [verdict(33, "room-founding, owner-habits", 130)]],
      [34, [verdict(34, "SENT", 150)]],
      [35, [verdict(35, "REPLY", 150)]]
    ]);

    expect([...judgedNow(5, [], queued, turns, held)]).toEqual([32, 33, 35]);
  });

  test("the words that end a stage's work stand whole", () => {
    for (const word of ["SKIP", "SKIP: no candidates", "CLEAN", "DEFUSE: 2 spans", "REPLY", "SENT", "PASS", "FAIL", "FAILED"]) {
      expect(endsJudging(word)).toBe(true);
    }

    for (const word of ["none", "room-founding", "SKIPPED-SOMETHING", "Clean words", ""]) {
      expect(endsJudging(word)).toBe(false);
    }
  });
});

// What opened a turn is said once above its cards, and a gate asked about none says what it narrowed.
describe("what opened a turn", () => {
  const offer = (stage: string, asked: number, rules: string[] | null): GateOfferRecord =>
    ({ stage, held: 20, asked, kept: { item: 0, keyword: asked, word: 2, person: 0, recent: 1 }, capped: 0, rules });
  const opening: RoundOpening = {
    instructions: [{ id: 5, sort: "run_state", summary: "#12 · queue-waiting", createdAt: 1 }],
    offers: [offer("people-search", 0, ["item"]), offer("room-rules", 3, null), offer("library-knowledge", 0, null)],
  };
  const judgement = (id: number, stage: string, round: string | null, opened: RoundOpening | null = opening): Judgement =>
    ({ id, chatId: -1, messageId: 7, stage, verdict: KO.line_128, detail: null, createdAt: 100, round, ...(opened === null ? {} : { opening: opened }) });

  test("stands each turn's cards together under the one opening, in the order they stand", () => {
    const turns = openedTurns([judgement(1, "people-search", "r1"), judgement(2, "room-rules", "r1"), judgement(3, "chat", "r2", null), judgement(4, "chat", null)]);

    expect(turns.map((turn) => [turn.key, turn.judgements.map((one) => one.id), turn.opening === opening])).toEqual([
      ["r1", [1, 2], true],
      ["r2", [3], false],
      ["judgement:4", [4], true],
    ]);
  });

  test("a gate asked about none says how many it narrowed from and whether it kept by the item rule alone", () => {
    expect(narrowedOffer(judgement(1, "people-search", "r1"))).toEqual({ held: 20, left: 0, itemRule: true });
    expect(narrowedOffer(judgement(2, "library-knowledge", "r1"))).toEqual({ held: 20, left: 0, itemRule: false });
  });

  test("a gate's card carries what each of its rules kept where its round's record holds a row for it, and none where not", () => {
    expect(keptOffer(judgement(2, "room-rules", "r1"))).toEqual({ item: 0, keyword: 3, word: 2, person: 0, recent: 1 });
    expect(keptOffer(judgement(5, "situation-rules", "r1"))).toBeNull();
    expect(keptOffer(judgement(6, "room-rules", "r2", null))).toBeNull();
  });

  test("an instruction's sort reads in the owner's words, an unknown one as its own key and none as a quiet instruction", () => {
    expect(sortLabel(wording, "run_state")).toBe(wording("room.label.sort_run_state"));
    expect(sortLabel(wording, "new_kind")).toBe("new_kind");
    expect(sortLabel(wording, null)).toBe(wording("room.label.quiet_instruction"));
  });

  test("an instruction's whole text reads its recorded facts as names and values, and its words as written", () => {
    const facts = { state: "queue-waiting", workers: [{ worker: WORKER, cwd: "/repo", waiting: 1 }, { worker: "helper", waiting: 0 }], tags: ["a", 2, null], held: [], note: {} };
    const text = `${KO.line_153}${JSON.stringify(facts)}${KO.line_153_2}`;

    expect(instructionParts(text)).toEqual([
      { kind: "words", text: KO.line_156 },
      {
        kind: "facts",
        rows: [
          { label: "state", value: "queue-waiting" },
          { label: "workers 1 › worker", value: "worker" },
          { label: "workers 1 › cwd", value: "/repo" },
          { label: "workers 1 › waiting", value: "1" },
          { label: "workers 2 › worker", value: "helper" },
          { label: "workers 2 › waiting", value: "0" },
          { label: "tags", value: "a, 2, null" },
          { label: "held", value: "[]" },
          { label: "note", value: "{}" },
        ],
      },
      { kind: "words", text: KO.line_171 },
      { kind: "facts", rows: [{ label: "", value: "1, 2" }] },
    ]);
  });

  test("a text with no facts in it is one stretch of words", () => {
    expect(instructionParts(KO.line_177)).toEqual([{ kind: "words", text: KO.line_177 }]);
  });

  test("and a gate that was asked, or left no offer, says nothing of it", () => {
    expect(narrowedOffer(judgement(1, "room-rules", "r1"))).toBeNull();
    expect(narrowedOffer(judgement(2, "situation-rules", "r1"))).toBeNull();
    expect(narrowedOffer(judgement(3, "people-search", "r1", null))).toBeNull();
  });
});

// The road is what the item this screen serves was asked to measure: which provider answered, and
// what was waited out before it.
describe("how a road reads", () => {
  test("says how it ended in the owner's words, and keeps a word it does not know", () => {
    expect(roadOutcome(wording, "answered")).toBe(wording("room.label.road_answered"));
    expect(roadOutcome(wording, "timeout")).toBe(KO.line_192);
    expect(roadOutcome(wording, "busy-skip")).toBe(wording("room.label.road_busy_skip"));
    expect(roadOutcome(wording, "stopped")).toBe(KO.line_194);
    expect(roadOutcome(wording, "something-new")).toBe("something-new");
  });

  test("names the provider and its model, and the provider alone where the road named no model", () => {
    expect(roadName({ id: 1, provider: "registered", model: "model-a", outcome: "answered", ms: 1_300 }))
      .toBe("registered · model-a");
    expect(roadName({ id: 2, provider: "stand-in", model: "", outcome: "unavailable", ms: 1 })).toBe("stand-in");
  });
});
