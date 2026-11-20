import { describe, expect, test } from "bun:test";

import { globalsRestoredAfter } from "../../support/globals";

import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { DraftRow } from "../../../apps/web/shared/drafting";

// One round's rows of its instruction pipeline, read for the room's draft chip from the receiver's round log (the
// receiver's `docs/instruction.md`, 「The round log」), and the summary a page's rounds carry.

const globals: Record<string, unknown> = globalThis;

globalsRestoredAfter(["readableRooms", "requireReadableRoom"]);
globals.requireReadableRoom = async () => undefined;
globals.readableRooms = async () => "all";

const PIPELINE_ROWS = [
  {
    id: 1, agentName: "agent-a", number: 1, question: "message", kind: "turn", answerChars: 42, changed: false, outcome: "answered", detail: null, ms: 900, at: 1_788_000_000_000, answer: "message",
    reads: [], session: null, loaded: null,
    versions: [
      { text: "message", opened: "handed" },
      { text: "<<SKIP: nothing new>>", opened: "handed" },
      { text: "a notice", opened: "program" },
      { text: "odd", opened: "elsewhere" }
    ]
  },
  { id: 2, agentName: "agent-a", number: 1, question: "review", kind: "stage", answerChars: 4, changed: false, outcome: "pass", detail: null, ms: 700, at: 1_788_000_001_000, answer: "PASS", reads: [], session: null, loaded: null, versions: [] },
  {
    id: 3, agentName: "agent-a", number: 2, question: "", kind: "end", answerChars: 42, changed: false, outcome: "message", detail: "chain=review", ms: 0, at: 1_788_000_001_000, answer: null,
    session: "session-a", loaded: 2, versions: [],
    reads: [
      { path: "core/facts.md", holds: "core facts", how: "attached" },
      { path: "notes/today.md", holds: null, how: "read" },
      { path: "people/index.md", holds: "people", how: "held" },
      { path: "odd.md", holds: null, how: "glanced" }
    ]
  }
];

const receiver = standIn("RECEIVER", (one) => {
  const path = decodeURIComponent(one.path.split("?")[0] ?? "");

  if (path === "/rounds/pipeline") return answer({ items: [{ round: "round-1", rows: PIPELINE_ROWS }], more: false });

  return answer({ code: "no-route", error: "no route" }, 404);
});

const drafts = await routeOf<{ rows: DraftRow[] }>("../../apps/web/server/api/rooms/[chatId]/drafts.get");

describe("a round's summary", () => {
  test("counts the stages and the arrived check, never the message turn or the agent's judgement before the round, and carries the end's reads and running count", async () => {
    const { draftSummaryOf } = await import("../../../apps/web/server/utils/drafting");
    const row = (id: number, kind: string, outcome = "answered"): DraftRow => ({
      id, number: id, question: kind, kind, answerChars: 0, changed: false, outcome, detail: null, ms: 0, at: 0, answer: null,
      reads: kind === "end" ? [{ path: "core/facts.md", holds: null, how: "attached" }] : [],
      ...(kind === "end" ? { session: "session-a", loaded: 2 } : {})
    });

    expect(draftSummaryOf("round-1", [row(0, "supervisor"), row(1, "turn"), row(2, "arrived"), row(3, "stage", "pass"), row(4, "end", "message")])).toEqual({
      round: "round-1", asked: 2, end: "message", reads: [{ path: "core/facts.md", holds: null, how: "attached" }], loaded: 2
    });
    expect(draftSummaryOf("round-2", [row(0, "supervisor", "skip")])).toBeNull();
  });
});

describe("one round's rows", () => {
  test("reads the round from the receiver's round log in the room, its answers whole", async () => {
    receiver.asked.length = 0;

    const read = await asked(drafts, { params: { chatId: "-7" }, query: { round: "round-1" } });

    expect(read.status).toBe(200);
    expect(read.answer?.rows.map((row) => [row.kind, row.outcome])).toEqual([["turn", "answered"], ["stage", "pass"], ["end", "message"]]);
    expect(read.answer?.rows[0]?.answer).toBe("message");
    // The end names what the round read from the brain, a way the console does not know left out; other rows none.
    expect(read.answer?.rows[2]?.reads.map((one) => one.how)).toEqual(["attached", "read", "held"]);
    expect(read.answer?.rows[1]?.reads).toEqual([]);
    // A turn's row names each answer its turn wrote, one opened in a way the console does not know left out.
    expect(read.answer?.rows[0]?.versions?.map((one) => one.opened)).toEqual(["handed", "handed", "program"]);
    expect(read.answer?.rows[1]?.versions).toEqual([]);
    expect(receiver.asked[0]?.path).toBe("/rounds/pipeline?room=-7&rounds=round-1");
  });

  test("asks nothing for no round, or for more than one", async () => {
    receiver.asked.length = 0;

    for (const query of [{}, { round: "" }, { round: "a,b" }]) {
      expect(await asked(drafts, { params: { chatId: "-7" }, query })).toMatchObject({ status: 400 });
    }
    expect(receiver.asked).toEqual([]);
  });
});
