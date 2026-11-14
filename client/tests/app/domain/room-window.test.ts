import { describe, expect, test } from "bun:test";

import { SKIPPED_OUTCOME } from "../../../apps/web/app/domain/events";
import { groupRoom, listeningRuns, shownOutcome, WINDOW_NEWS } from "../../../apps/web/app/domain/room-window";

import type { RunState } from "../../../apps/web/app/domain/events";
import { OWNER_ID as owner, ROOM_ID } from "../../support/ids";

const other = { id: 4_218_992, name: "Carol" };
const bmoTurn: RunState = { messageId: "1", startedAt: 1_788_000_010, received: { messages: 1, instructions: 0 }, progress: null };
const otherTurn: RunState = { ...bmoTurn, speaker: other };
const open = { since: 1_788_000_000, closesAt: 1_788_000_180 };

// A group room is every room but the owner's own chat, and a room the screen cannot tell yet is not one
// (docs/web.md, 「A turn the chat agent chose not to answer」).
describe("which rooms are groups", () => {
  test("every room but the owner's own chat, and none while the owner's chat is unknown", () => {
    expect(groupRoom(ROOM_ID, owner)).toBe(true);
    expect(groupRoom(owner, owner)).toBe(false);
    expect(groupRoom(ROOM_ID, null)).toBe(false);
  });
});

// The chat agent's row while it only listens stands in its turn's place and never beside it (docs/web.md, 「The listening row」).
describe("the listening row", () => {
  test("stands while the window is open and no turn of the chat agent's runs, keyed to the moment it was seen open and carrying when it closes", () => {
    expect(listeningRuns([], open)).toEqual([{ messageId: null, startedAt: 1_788_000_000, received: null, progress: null, listening: { closesAt: 1_788_000_180 } }]);
    expect(listeningRuns([otherTurn], open)).toHaveLength(1);
  });

  test("gives way to the chat agent's own turn, and stands nowhere while the window is shut", () => {
    expect(listeningRuns([bmoTurn], open)).toEqual([]);
    expect(listeningRuns([], null)).toEqual([]);
  });
});

describe("the passing word for a silent turn", () => {
  test("a group room says nothing of a turn passed over and keeps every other ending", () => {
    const skipped = { key: SKIPPED_OUTCOME };
    const failed = { key: "room.status.outcome_run_failed" };

    expect(shownOutcome(skipped, true)).toBeNull();
    expect(shownOutcome(skipped, false)).toBe(skipped);
    expect(shownOutcome(failed, true)).toBe(failed);
  });
});

// The window is read again on each thing that may move it, its close among them: a window a conversation closes
// early is told closed once, and a screen that read only its writes would count on to the end it last read
// (docs/web.md, 「The listening row」).
describe("what moves the window", () => {
  test("is a message filed or queued, a turn beginning or ending, and the window written or closed", () => {
    for (const type of ["message", "queued", "run-started", "sent", "skipped", "window", "window-closed"] as const) {
      expect({ type, read: WINDOW_NEWS.includes(type) }).toEqual({ type, read: true });
    }
  });
});
