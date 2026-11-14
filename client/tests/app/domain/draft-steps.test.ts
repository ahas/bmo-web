import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { stepRoomTurns } from "../../../apps/web/app/domain/events";
import { draftQuestionLabel, phaseDetail, phaseLook, subjectOf } from "../../../apps/web/app/domain/working";

import type { RunState } from "../../../apps/web/app/domain/events";
import type { BotEvent, RunProgress } from "../../../apps/web/shared/types";
import { ROOM_ID } from "../../support/ids";

// The chat agent's running line through its draft process (docs/web.md, the room screen's running line): each
// question's start puts the line on that question, the rows written as questions are answered move nothing, and the
// process's end brings the line back to the state alone.

const thinking: RunProgress = { phase: "thinking", tool: null, thinkingTokens: null, contextTokens: null, cacheReadTokens: null, requestId: null, spent: null, writtenTokens: null, actions: [], droppedActions: 0, droppedContext: 0 };
const turn: RunState = { messageId: "1", startedAt: 1_788_000_010, received: { messages: 1, instructions: 0 }, progress: thinking };
const other: RunState = { ...turn, speaker: { id: 4_218_992, name: "Carol" } };

let lastId = 10;

function started(number: number, count: number, question: string): BotEvent {
  lastId += 1;

  return { id: lastId, at: 1_788_000_020, type: "draft", chatId: ROOM_ID, messageId: null, round: "round-1", number, count, question, kind: "start" };
}

function row(number: number, kind: string, question: string, outcome = "answered"): BotEvent {
  lastId += 1;

  return { id: lastId, at: 1_788_000_020, type: "draft", chatId: ROOM_ID, messageId: null, round: "round-1", number, question, kind, outcome };
}

describe("the draft events on the room's turns", () => {
  test("each question's start puts the chat agent's turn on it, its row moves nothing, and the end takes the step away", () => {
    let rooms: ReadonlyMap<number, RunState[]> = new Map([[ROOM_ID, [turn]]]);

    rooms = stepRoomTurns(rooms, started(1, 3, "intent"));
    expect(rooms.get(ROOM_ID)?.[0]?.draft).toEqual({ number: 1, count: 3, question: "intent" });

    const answered = stepRoomTurns(rooms, row(1, "question", "intent"));
    expect(answered).toBe(rooms);

    rooms = stepRoomTurns(rooms, started(2, 3, "facts"));
    expect(rooms.get(ROOM_ID)?.[0]?.draft).toEqual({ number: 2, count: 3, question: "facts" });
    expect(rooms.get(ROOM_ID)?.[0]?.progress).toBe(thinking);

    rooms = stepRoomTurns(rooms, row(4, "end", "", "message"));
    expect(rooms.get(ROOM_ID)?.[0]).toEqual(turn);
  });

  // A round whose first answer is a wait tells its first question's start and writes no row (the receiver's
  // docs/drafting.md); the line stands on that question until the turn ends, waiting on nothing.
  test("a start with no row after it leaves the turn on that question", () => {
    const rooms = stepRoomTurns(new Map([[ROOM_ID, [turn]]]), started(1, 4, "intent"));

    expect(rooms.get(ROOM_ID)?.[0]?.draft).toEqual({ number: 1, count: 4, question: "intent" });
    expect(stepRoomTurns(rooms, { id: 99, at: 1_788_000_030, type: "waited", chatId: ROOM_ID, messageId: "1" }).get(ROOM_ID)).toBeUndefined();
  });

  test("a start that names no count is no step the line can stand", () => {
    const rooms: ReadonlyMap<number, RunState[]> = new Map([[ROOM_ID, [turn]]]);

    const uncounted: BotEvent = { id: 98, at: 1_788_000_020, type: "draft", chatId: ROOM_ID, messageId: null, round: "round-1", number: 1, question: "intent", kind: "start" };

    expect(stepRoomTurns(rooms, uncounted)).toBe(rooms);
  });

  test("a room with no turn of the chat agent's going is left as it was", () => {
    const rooms: ReadonlyMap<number, RunState[]> = new Map([[ROOM_ID, [other]]]);

    expect(stepRoomTurns(rooms, started(1, 3, "intent"))).toBe(rooms);
    expect(stepRoomTurns(new Map(), started(1, 3, "intent")).size).toBe(0);
  });
});

describe("the running line", () => {
  const state = wording("room.status.agent_thinking", { subject: subjectOf("Bob") });

  test("says the state the turn is at through the draft turn, its writing said as the message being written", () => {
    const draft = { number: 1, count: 1, question: "intent+facts+final" };
    const writing: RunProgress = { ...thinking, phase: "writing" };
    const working: RunProgress = { ...thinking, phase: "tool", tool: "Bash" };

    expect(phaseLook(wording, "Bob", thinking, draft)).toEqual({ label: state });
    expect(phaseLook(wording, "Bob", working, draft)).toEqual(phaseLook(wording, "Bob", working));
    expect(phaseLook(wording, "Bob", writing, draft)).toEqual({ label: wording("room.status.draft_writing") });
    expect(phaseLook(wording, "Bob", writing)).not.toEqual({ label: wording("room.status.draft_writing") });

    expect(phaseDetail(wording, thinking, draft)).toBeNull();
    expect(phaseDetail(wording, working, draft)).toBe(phaseDetail(wording, working));
    expect(phaseDetail(wording, working, draft)).not.toBe(wording("room.status.draft_writing"));
    expect(phaseDetail(wording, writing, draft)).toBe(wording("room.status.draft_writing"));
    expect(phaseDetail(wording, writing)).toBe(wording("room.status.step_writing"));
  });

  test("names each question in the table's lists by the pack's word, the last as the step it is", () => {
    expect(draftQuestionLabel(wording, "memory")).toBe(wording("room.status.draft_question_memory"));
    expect(draftQuestionLabel(wording, "final")).toBe(wording("agents.label.draft_question_final"));
    expect(draftQuestionLabel(wording, "tone")).toBe("tone");
  });

  test("names the draft turn by the words of every question it followed, in their order", () => {
    expect(draftQuestionLabel(wording, "intent+tone+final")).toBe([wording("room.status.draft_question_intent"), "tone", wording("agents.label.draft_question_final")].join(" · "));
  });

  test("says the state alone before the first question starts and for a turn that runs no process", () => {
    expect(phaseLook(wording, "Bob", thinking, null)).toEqual({ label: state });
    expect(phaseLook(wording, "Bob", thinking)).toEqual({ label: state });
  });
});
