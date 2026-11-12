import { describe, expect, test } from "bun:test";

import { agencyEvent, jobEvent, voiceEvent } from "../../../apps/web/app/domain/unit-events";

// bmo-job's and the agency's events read into the console's own, so a screen that reads back on the TODO, a work
// order, an item's talk or a turn ending hears them as it hears the receiver's.

describe("bmo-job's events", () => {
  test("the queue moving is the TODO moving", () => {
    expect(jobEvent({ id: 3, at: 1_790_000_000_000, kind: "queue_moved", detail: "worker-b" })).toEqual({
      id: 3,
      at: 1_790_000_000_000,
      type: "todo",
      chatId: 0,
      messageId: null
    });
  });

  test("an order changing is that item's work order, its standing read into the console's shape", () => {
    const event = jobEvent({
      id: 4,
      at: 1,
      kind: "order_changed",
      item: 41,
      order: {
        status: "active",
        phase: "implementation",
        stage: 2,
        updated_at: 1_790_000_000_000,
        tasks: [{ id: "build-0", state: "running", attempt: 2, job: 9, model: "model-a" }, { id: "build-1", state: "pending", attempt: 0 }]
      }
    });

    expect(event).toEqual({
      id: 4,
      at: 1,
      type: "work-order",
      chatId: 0,
      messageId: null,
      todoId: 41,
      workOrder: {
        status: "active",
        phase: "implementation",
        stage: 2,
        updatedAt: 1_790_000_000_000,
        tasks: [
          { id: "build-0", state: "running", attempt: 2, jobId: 9, model: "model-a", error: null },
          { id: "build-1", state: "pending", attempt: 0, jobId: null, model: "", error: null }
        ]
      }
    });
  });

  test("the talk moving is that item's talk", () => {
    expect(jobEvent({ id: 5, at: 1, kind: "talk_moved", item: 41, failure: "resting" })).toMatchObject({ type: "todo-talk", todoId: 41 });
  });

  test("an event with no number, an order with no item and a kind the console reads nothing of are nothing", () => {
    expect(jobEvent({ at: 1, kind: "queue_moved" })).toBeNull();
    expect(jobEvent({ id: 6, at: 1, kind: "order_changed", order: {} })).toBeNull();
    expect(jobEvent({ id: 7, at: 1, kind: "something_else" })).toBeNull();
  });

  test("a member the stream names by its kind is the TODO, that item's work order or that item's talk", () => {
    expect(jobEvent({ id: 9, at: 2, kind: "item.changed", data: { id: 41, title: "a row" } })).toEqual({
      id: 9,
      at: 2,
      type: "todo",
      chatId: 0,
      messageId: null
    });
    expect(jobEvent({ id: 10, at: 2, kind: "queue.changed", data: { name: "todo" } })?.type).toBe("todo");
    expect(jobEvent({ id: 11, at: 2, kind: "work-order.changed", data: { itemId: 41, state: "active" } })).toEqual({
      id: 11,
      at: 2,
      type: "work-order",
      chatId: 0,
      messageId: null,
      todoId: 41
    });
    expect(jobEvent({ id: 12, at: 2, kind: "task.changed", data: { id: 4, itemId: 41 } })).toMatchObject({ type: "work-order", todoId: 41 });
    expect(jobEvent({ id: 13, at: 2, kind: "note.created", data: { id: 4, itemId: 41 } })).toMatchObject({ type: "todo-talk", todoId: 41 });
    expect(jobEvent({ id: 14, at: 2, kind: "subscription.changed", data: { id: 4 } })).toBeNull();
  });
});

describe("the agency's turns", () => {
  test("a turn going out and a turn ending, with its session and run", () => {
    expect(agencyEvent({ kind: "turn-started", session: "worker-b", run: "run-a", at: 1_790_000_000_000 })).toEqual({
      id: 0,
      at: 1_790_000_000_000,
      type: "agency-turn",
      chatId: 0,
      messageId: null,
      phase: "started",
      session: "worker-b",
      run: "run-a"
    });
    expect(agencyEvent({ kind: "turn-ended", session: "worker-b", run: "run-a", outcome: "answered" })).toMatchObject({ type: "agency-turn", phase: "ended" });
  });

  test("another kind, or a turn naming no session, is nothing", () => {
    expect(agencyEvent({ kind: "turn-question", session: "worker-b", run: "run-a" })).toBeNull();
    expect(agencyEvent({ kind: "turn-ended", run: "run-a" })).toBeNull();
  });

  test("the stream's own kind and what it carries name the turn or the job", () => {
    expect(agencyEvent({
      id: 28,
      at: 1_790_000_000_100,
      kind: "turn.created",
      data: { session: "worker-b", run: "run-a", turnId: 1, at: 1_790_000_000_000 }
    })).toEqual({
      id: 28,
      at: 1_790_000_000_000,
      type: "agency-turn",
      chatId: 0,
      messageId: null,
      phase: "started",
      session: "worker-b",
      run: "run-a"
    });

    expect(agencyEvent({
      id: 29,
      at: 1_790_000_000_100,
      kind: "job.created",
      data: { id: 8, roomId: -100_387_496_9077, state: "starting", startedAt: 1_790_000_000_000 }
    })).toEqual({
      id: 29,
      at: 1_790_000_000_000,
      type: "worker-run",
      chatId: -100_387_496_9077,
      messageId: null
    });

    expect(agencyEvent({ id: 30, at: 1, kind: "account.changed", data: { id: 4 } })).toBeNull();
  });

  test("a run or a session that moved names its agent and its run, where the event carries them", () => {
    expect(agencyEvent({ id: 31, at: 7, kind: "run.changed", data: { id: 4, agentName: "worker-b", unitName: "run-a" } })).toEqual({
      id: 31,
      at: 7,
      type: "agency-run",
      chatId: 0,
      messageId: null,
      agent: "worker-b",
      run: "run-a"
    });
    expect(agencyEvent({ id: 32, at: 8, kind: "session.changed", data: { agentName: "worker-b" } })).toMatchObject({ type: "agency-run", agent: "worker-b", run: null });
    expect(agencyEvent({ id: 33, at: 9, kind: "run.stopped", data: { id: 4 } })).toMatchObject({ type: "agency-run", agent: null, run: null });
  });
});

// The voice engine's briefing events (its docs/boundary-api.md, 「Events」), as the screens read them.
describe("the voice engine's briefings", () => {
  test("an ended briefing names its room, its line, its kind and where it stands", () => {
    expect(voiceEvent({
      id: 40,
      at: 1_800_000_000_000,
      kind: "briefing.ended",
      data: { id: 7, chatId: 42, messageId: 548, kind: "summary", title: "t", state: "done", durationMs: 9000, plays: true, voiceMessageId: null, synthesisId: 3, finishedAt: 1_799_999_999_000 }
    })).toEqual({
      id: 40,
      at: 1_800_000_000_000,
      type: "voice-briefing",
      chatId: 42,
      messageId: 548,
      phase: "ended",
      voice: { id: 7, chatId: 42, messageId: 548, kind: "summary", title: "t", state: "done", durationMs: 9000, plays: true, voiceMessageId: null, spoken: true, finishedAt: 1_799_999_999_000 }
    });
  });

  test("a briefing ends done, failed or stopped, and any other state of the engine's is still waiting", () => {
    const stateOf = (state: unknown) => {
      const event = voiceEvent({ id: 1, at: 1, kind: "briefing.ended", data: { id: 7, chatId: 42, messageId: 548, kind: "full", state } });

      return event?.type === "voice-briefing" ? event.voice.state : null;
    };

    expect(["done", "failed", "stopped", "speaking", undefined].map(stateOf)).toEqual(["done", "failed", "stopped", "waiting", "waiting"]);
  });

  test("a kind of no briefing, or a briefing that does not read, is none", () => {
    expect(voiceEvent({ id: 1, at: 1, kind: "synthesis.ended", data: { id: 1, chatId: 2 } })).toBeNull();
    expect(voiceEvent({ id: 1, at: 1, kind: "briefing.created", data: { chatId: 2 } })).toBeNull();
  });

  test("a stop names the room whose briefings it stopped, or none for every room's, and the briefings", () => {
    const at = 1_800_000_000_000;

    expect(voiceEvent({ id: 41, at, kind: "briefings.stopped", data: { chatId: 42, briefingIds: [7, 8] } })).toEqual({
      id: 41, at, type: "voice-briefings-stopped", chatId: 0, messageId: null, stoppedRoom: 42, briefingIds: [7, 8]
    });
    expect(voiceEvent({ id: 42, at, kind: "briefings.stopped", data: { chatId: null, briefingIds: [] } })).toMatchObject({ stoppedRoom: null, briefingIds: [] });
    expect(voiceEvent({ id: 43, at, kind: "briefings.stopped", data: { briefingIds: [9] } })).toMatchObject({ stoppedRoom: null, briefingIds: [9] });
    expect(voiceEvent({ id: 44, at, kind: "briefings.stopped", data: { chatId: "42", briefingIds: [] } })).toBeNull();
  });
});
