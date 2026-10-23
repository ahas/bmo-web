import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { stepRoomTurns } from "../../../apps/web/app/domain/events";
import { phaseLook, subjectOf } from "../../../apps/web/app/domain/working";

import type { RunState } from "../../../apps/web/app/domain/events";
import type { BotEvent, RunProgress } from "../../../apps/web/shared/types";
import { ROOM_ID } from "../../support/ids";

// The chat agent's running line through its draft process (docs/web.md, the room screen's running line): the receiver's
// `draft` events move the step the line names, and the process's end brings the line back to the state alone.

const thinking: RunProgress = { phase: "thinking", tool: null, thinkingTokens: null, contextTokens: null, cacheReadTokens: null, requestId: null, spent: null, writtenTokens: null, actions: [], droppedActions: 0, droppedContext: 0 };
const turn: RunState = { messageId: 1, startedAt: 1_788_000_010, received: { messages: 1, instructions: 0 }, progress: thinking };
const companion: RunState = { ...turn, speaker: { id: 4_218_992, name: "Carol" } };

function draft(number: number, kind: string, question: string, outcome = "answered"): BotEvent {
  return { id: 10 + number, at: 1_788_000_020, type: "draft", chatId: ROOM_ID, messageId: null, round: "round-1", number, question, kind, outcome };
}

function step(rooms: ReadonlyMap<number, RunState[]>, event: BotEvent): ReadonlyMap<number, RunState[]> {
  return stepRoomTurns(rooms, event);
}

describe("the draft events on the room's turns", () => {
  test("each row moves the chat agent's turn to the step after it, and the end takes the step away", () => {
    let rooms: ReadonlyMap<number, RunState[]> = new Map([[ROOM_ID, [turn]]]);

    rooms = step(rooms, draft(0, "turn", "turn"));
    expect(rooms.get(ROOM_ID)?.[0]?.draft).toEqual({ number: 0, question: "turn", kind: "turn", outcome: "answered" });

    rooms = step(rooms, draft(1, "question", "information"));
    expect(rooms.get(ROOM_ID)?.[0]?.draft?.number).toBe(1);
    expect(rooms.get(ROOM_ID)?.[0]?.progress).toBe(thinking);

    rooms = step(rooms, draft(2, "end", "", "message"));
    expect(rooms.get(ROOM_ID)?.[0]).toEqual(turn);
  });

  test("a room with no turn of the chat agent's going is left as it was", () => {
    const rooms: ReadonlyMap<number, RunState[]> = new Map([[ROOM_ID, [companion]]]);

    expect(step(rooms, draft(0, "turn", "turn"))).toBe(rooms);
    expect(step(new Map(), draft(0, "turn", "turn")).size).toBe(0);
  });
});

describe("the running line", () => {
  const state = wording("room.status.agent_thinking", { subject: subjectOf("Bob") });

  const round = (n: string) => wording("room.status.draft_step", { step: wording("room.status.draft_step_round", { n }), state });

  test("says the first round until the process writes a row, and after a row of the round's own turn", () => {
    expect(phaseLook(wording, "Bob", thinking, null)).toEqual({ label: round("1") });
    expect(phaseLook(wording, "Bob", thinking, { number: 0, question: "turn", kind: "turn", outcome: "answered" })).toEqual({ label: round("1") });
  });

  test("says the round after the last row written, ahead of the state", () => {
    const label = phaseLook(wording, "Bob", thinking, { number: 1, question: "information", kind: "question", outcome: "answered" }).label;

    expect(label).toBe(round("2"));
    expect(label).toContain("2");
  });

  test("says the state alone for a turn that runs no process", () => {
    expect(phaseLook(wording, "Bob", thinking)).toEqual({ label: state });
  });
});
