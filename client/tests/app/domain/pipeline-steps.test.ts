import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { stepRoomTurns } from "../../../apps/web/app/domain/events";
import { phaseDetail, phaseLook, receivedLine, subjectOf } from "../../../apps/web/app/domain/working";

import type { PipelineStep, RunState } from "../../../apps/web/app/domain/events";
import type { BotEvent, RunProgress } from "../../../apps/web/shared/types";
import { ROOM_ID } from "../../support/ids";

// A turn's running line through its round's instruction pipeline (docs/web.md, the room screen's running line): each
// turn's start puts the line on that turn, the rows written as turns are answered move nothing, and the pipeline's end
// brings the line back to the state alone. The message turn says the message being written; a system instruction says
// the stage it checks and stands no message received.

const thinking: RunProgress = { phase: "thinking", tool: null, thinkingTokens: null, contextTokens: null, cacheReadTokens: null, requestId: null, spent: null, writtenTokens: null, actions: [], droppedActions: 0, droppedContext: 0 };
const turn: RunState = { messageId: "1", startedAt: 1_788_000_010, received: { messages: 1, instructions: 0 }, progress: thinking };

const MESSAGE: PipelineStep = { number: 1, count: 1, question: "message", input: "message" };
const REVIEW: PipelineStep = { number: 1, count: 2, question: "review", input: "system" };

let lastId = 10;

function started(number: number, count: number, question: string, input?: string): BotEvent {
  lastId += 1;

  return { id: lastId, at: 1_788_000_020, type: "draft", chatId: ROOM_ID, messageId: null, round: "round-1", number, count, question, kind: "start", ...(input === undefined ? {} : { input }) };
}

function row(number: number, kind: string, question: string, outcome = "answered"): BotEvent {
  lastId += 1;

  return { id: lastId, at: 1_788_000_020, type: "draft", chatId: ROOM_ID, messageId: null, round: "round-1", number, question, kind, outcome };
}

describe("the pipeline's events on the room's turns", () => {
  test("each turn's start puts the turn on it with what it carries, its row moves nothing, and the end takes the step away", () => {
    let rooms: ReadonlyMap<number, RunState[]> = new Map([[ROOM_ID, [turn]]]);

    rooms = stepRoomTurns(rooms, started(1, 1, "message", "message"));
    expect(rooms.get(ROOM_ID)?.[0]?.step).toEqual(MESSAGE);

    const answered = stepRoomTurns(rooms, row(1, "turn", "message"));
    expect(answered).toBe(rooms);

    rooms = stepRoomTurns(rooms, started(1, 2, "review", "system"));
    expect(rooms.get(ROOM_ID)?.[0]?.step).toEqual(REVIEW);
    expect(rooms.get(ROOM_ID)?.[0]?.progress).toBe(thinking);

    rooms = stepRoomTurns(rooms, row(4, "end", "", "message"));
    expect(rooms.get(ROOM_ID)?.[0]).toEqual(turn);
  });

  test("a start that names no input is the message turn's", () => {
    const rooms = stepRoomTurns(new Map([[ROOM_ID, [turn]]]), started(1, 1, "message"));

    expect(rooms.get(ROOM_ID)?.[0]?.step?.input).toBe("message");
  });

  // A round whose message turn answers a wait tells that turn's start and writes no row (the receiver's
  // docs/instruction.md); the line stands on it until the turn ends, waiting on nothing.
  test("a start with no row after it leaves the turn on that step until the turn ends", () => {
    const rooms = stepRoomTurns(new Map([[ROOM_ID, [turn]]]), started(1, 1, "message", "message"));

    expect(rooms.get(ROOM_ID)?.[0]?.step).toEqual(MESSAGE);
    expect(stepRoomTurns(rooms, { id: 99, at: 1_788_000_030, type: "waited", chatId: ROOM_ID, messageId: "1" }).get(ROOM_ID)).toBeUndefined();
  });

  test("a start that names no count is no step the line can stand", () => {
    const rooms: ReadonlyMap<number, RunState[]> = new Map([[ROOM_ID, [turn]]]);
    const uncounted: BotEvent = { id: 98, at: 1_788_000_020, type: "draft", chatId: ROOM_ID, messageId: null, round: "round-1", number: 1, question: "message", kind: "start" };

    expect(stepRoomTurns(rooms, uncounted)).toBe(rooms);
    expect(stepRoomTurns(new Map(), started(1, 1, "message")).size).toBe(0);
  });
});

describe("the running line", () => {
  const state = wording("room.status.agent_thinking", { subject: subjectOf("agent-a") });
  const writing: RunProgress = { ...thinking, phase: "writing" };
  const working: RunProgress = { ...thinking, phase: "tool", tool: "Bash" };

  test("says the state through the message turn, its writing said as the message being written", () => {
    expect(phaseLook(wording, "agent-a", thinking, MESSAGE)).toEqual({ label: state });
    expect(phaseLook(wording, "agent-a", working, MESSAGE)).toEqual(phaseLook(wording, "agent-a", working));
    expect(phaseLook(wording, "agent-a", writing, MESSAGE)).toEqual({ label: wording("room.status.draft_writing") });
    expect(phaseLook(wording, "agent-a", writing)).not.toEqual({ label: wording("room.status.draft_writing") });

    expect(phaseDetail(wording, thinking, MESSAGE)).toBeNull();
    expect(phaseDetail(wording, working, MESSAGE)).toBe(phaseDetail(wording, working));
    expect(phaseDetail(wording, writing, MESSAGE)).toBe(wording("room.status.draft_writing"));
    expect(phaseDetail(wording, writing)).toBe(wording("room.status.step_writing"));
  });

  test("says the stage a system instruction checks the message on, whatever the turn is doing within it", () => {
    const stage = wording("room.status.step_stage", { name: "review" });

    for (const progress of [thinking, writing, working, null]) {
      expect(phaseDetail(wording, progress, REVIEW)).toBe(stage);
      expect(phaseLook(wording, "agent-a", progress, REVIEW)).toEqual({ label: stage });
    }
    expect(phaseDetail(wording, thinking, { number: 1, count: 1, question: "arrived", input: "system" })).toBe(wording("room.status.step_arrived"));
    expect(phaseDetail(wording, writing, { number: 1, count: 1, question: "audit", input: "system" })).toBe(wording("room.status.step_audit"));
  });

  test("stands what the turn received on the message turn, and no message received on a system instruction", () => {
    const received = { messages: 2, instructions: 1 };

    expect(receivedLine(received, MESSAGE)).toEqual(receivedLine(received));
    expect(receivedLine(received, REVIEW)).toBeNull();
  });

  test("says the state alone before the first turn starts", () => {
    expect(phaseLook(wording, "agent-a", thinking, null)).toEqual({ label: state });
    expect(phaseLook(wording, "agent-a", thinking)).toEqual({ label: state });
  });
});
