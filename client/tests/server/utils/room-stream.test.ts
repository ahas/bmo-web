import { describe, expect, test } from "bun:test";

import { roomFrame, roomStreamFilter } from "../../../apps/web/server/utils/room-stream";
import { ROOM_ID } from "../../support/ids";

// The bot's stream as a user who reads only some rooms hears it (docs/web.md, 「Access」).

const rooms = new Set([ROOM_ID]);

function bot(event: Record<string, unknown>): string {
  return `id: ${String(event.id)}\nevent: bot\ndata: ${JSON.stringify(event)}\n\n`;
}

function data(frame: string | null): unknown {
  return frame === null ? null : JSON.parse(/^data: (.*)$/m.exec(frame)![1]!);
}

const turn = { chatId: ROOM_ID, since: 5, messages: 2, instructions: 1, waiting: { job: 9 }, stop: { execution: 4 } };
const picture = {
  at: 7,
  runs: [{ agent: "search" }],
  compacting: [{ chatId: ROOM_ID }],
  turns: [turn, { ...turn, chatId: -200 }],
  queued: [{ chatId: ROOM_ID, messageId: 13, since: 6 }, { chatId: -200, messageId: 2, since: 6 }]
};

describe("the bot's stream cut to the rooms a user reads", () => {
  test("a room's news carries the room, the message and who answered, and nothing else", () => {
    expect(data(roomFrame(bot({ id: 3, at: 1, type: "message", chatId: ROOM_ID, messageId: 12 }), rooms)))
      .toEqual({ id: 3, at: 1, type: "message", chatId: ROOM_ID, messageId: 12 });
    expect(data(roomFrame(bot({ id: 4, at: 1, type: "run-started", chatId: ROOM_ID, messageId: 12, received: { messages: 2, instructions: 1 }, speaker: { id: 8, name: "Carol" } }), rooms)))
      .toEqual({ id: 4, at: 1, type: "run-started", chatId: ROOM_ID, messageId: 12, received: { messages: 2, instructions: 1 }, speaker: { id: 8, name: "Carol" } });
    expect(data(roomFrame(bot({ id: 5, at: 1, type: "run-failed", chatId: ROOM_ID, messageId: null, detail: "engine refused", round: "r1" }), rooms)))
      .toEqual({ id: 5, at: 1, type: "run-failed", chatId: ROOM_ID, messageId: null });
    expect(data(roomFrame(bot({ id: 10, at: 1, type: "room-removed", chatId: ROOM_ID, messageId: null }), rooms)))
      .toEqual({ id: 10, at: 1, type: "room-removed", chatId: ROOM_ID, messageId: null });
  });

  test("who writes and who is here pass in the rooms read with no id, and never from another room", () => {
    const present = (event: Record<string, unknown>): string => `event: bot\ndata: ${JSON.stringify(event)}\n\n`;
    const typing = { id: null, at: 1, type: "typing", chatId: ROOM_ID, messageId: null, who: { kind: "account", account: 4 }, on: true, lastsMs: 6000 };
    const presence = { id: null, at: 1, type: "presence", chatId: ROOM_ID, messageId: null, who: { kind: "person", via: "chat-a", personId: 7 }, state: "away", lastSeenAt: 900 };
    const typed = roomFrame(present(typing), rooms);

    expect(typed).not.toMatch(/^id:/m);
    expect(data(typed)).toEqual(typing);
    expect(data(roomFrame(present(presence), rooms))).toEqual(presence);
    expect(roomFrame(present({ ...typing, chatId: -200 }), rooms)).toBeNull();
    expect(roomFrame(present({ ...presence, chatId: -200 }), rooms)).toBeNull();
  });

  test("another room's news, a turn's steps, the verdicts and the queue never pass", () => {
    for (const event of [
      { id: 6, at: 1, type: "message", chatId: -200, messageId: 1 },
      { id: 11, at: 1, type: "room-removed", chatId: -200, messageId: null },
      { id: 7, at: 1, type: "run-progress", chatId: ROOM_ID, messageId: null, progress: { phase: "tool", tool: "Bash" } },
      { id: 8, at: 1, type: "judgement", chatId: ROOM_ID, messageId: 12, stage: "gate", verdict: "pass" },
      { id: 9, at: 1, type: "todo", chatId: 0, messageId: null }
    ]) {
      expect(roomFrame(bot(event), rooms)).toBeNull();
    }
  });

  test("the bot's picture keeps only the turns going in the rooms read, how much each was handed, and the message each holds queued", () => {
    const cut = {
      at: 7,
      compacting: [],
      turns: [{ chatId: ROOM_ID, since: 5, messages: 2, instructions: 1 }],
      queued: [{ chatId: ROOM_ID, messageId: 13, since: 6 }]
    };

    expect(data(roomFrame(`event: live\ndata: ${JSON.stringify(picture)}\n\n`, rooms))).toEqual(cut);
    expect(data(roomFrame(bot({ id: 10, at: 7, type: "live", chatId: 0, messageId: null, live: picture }), rooms)))
      .toEqual({ id: 10, at: 7, type: "live", chatId: 0, messageId: null, live: cut });
  });

  test("the relay passes the run's word and the stopping word as they are, and none of the console's own", () => {
    const filter = roomStreamFilter(rooms);

    expect(filter.frame!("event: run\ndata: {\"run\":\"a\"}\n\n")).toBe(true);
    expect(filter.frame!("event: stopping\ndata: {}\n\n")).toBe(true);
    expect(filter.frame!(bot({ id: 3, at: 1, type: "message", chatId: ROOM_ID, messageId: 12 }))).toBe(false);
    expect(filter.consoleEvent!({ name: "mail", data: { account: "a" } })).toBe(false);
    expect(filter.consoleEvent!({ name: "deploy", data: {} })).toBe(true);
  });

  test("each frame is cut to the rooms as they stand when it passes, so a room taken away falls silent at once", () => {
    const held = new Set([ROOM_ID]);
    const derived = roomStreamFilter(held).derived!();
    const message = bot({ id: 3, at: 1, type: "message", chatId: ROOM_ID, messageId: 12 });

    expect(derived(message)).toHaveLength(1);

    held.delete(ROOM_ID);

    expect(derived(message)).toEqual([]);
  });
});
