import { describe, expect, test } from "bun:test";

import { accountPresenceFrames, maskedPresence } from "../../../apps/web/server/utils/presence-frames";
import { ROOM_ID } from "../../support/ids";

// A presence as every reader is handed it (docs/web.md, 「Presence and typing」): an account that turned its presence
// off is handed with neither state nor last moment seen, and so is every account until the switches are read; the
// presence of an account of the reader's company is handed by account too, with no room.

function frame(event: Record<string, unknown>): string {
  return `event: bot\ndata: ${JSON.stringify(event)}\n\n`;
}

function data(written: string): unknown {
  return JSON.parse(/^data: (.*)$/m.exec(written)![1]!);
}

const shown = { id: null, at: 1, type: "presence", chatId: ROOM_ID, messageId: null, who: { kind: "account", account: 4 }, state: "online", lastSeenAt: 900 };

describe("a presence handed to a reader", () => {
  test("an account showing its presence is handed as it came", () => {
    expect(maskedPresence(frame(shown), new Set([5]))).toBe(frame(shown));
  });

  test("an account that turned it off is handed with no state and no moment", () => {
    expect(data(maskedPresence(frame(shown), new Set([4])))).toEqual({ ...shown, state: null, lastSeenAt: null });
  });

  test("every account is hidden until the switches are read, and a chat service's person and a typing mark are not touched", () => {
    const person = { ...shown, who: { kind: "person", via: "chat-a", personId: 4 } };
    const typing = { id: null, at: 1, type: "typing", chatId: ROOM_ID, messageId: null, who: { kind: "account", account: 4 }, on: true, lastsMs: 6000 };

    expect(data(maskedPresence(frame(shown), null))).toEqual({ ...shown, state: null, lastSeenAt: null });
    expect(maskedPresence(frame(person), null)).toBe(frame(person));
    expect(maskedPresence(frame(typing), null)).toBe(frame(typing));
  });
});

describe("a presence handed by account", () => {
  test("is handed for an account of the reader's company with no room, once for each change whatever the room", () => {
    const read = accountPresenceFrames(new Set([4]));
    const otherRoom = { ...shown, chatId: ROOM_ID + 1 };

    expect(read(frame(shown))).toEqual(['event: account-presence\ndata: {"account":4,"state":"online","lastSeenAt":900}\n\n']);
    expect(read(frame(otherRoom))).toEqual([]);
    expect(read(frame({ ...otherRoom, state: "away" })).map(data)).toEqual([{ account: 4, state: "away", lastSeenAt: 900 }]);
  });

  test("hands a hidden account's presence as unknown, since it reads the frame as masked", () => {
    const read = accountPresenceFrames(new Set([4]));

    read(frame(shown));
    expect(read(maskedPresence(frame(shown), new Set([4]))).map(data)).toEqual([{ account: 4, state: null, lastSeenAt: null }]);
  });

  test("hands nothing of another company's account, a chat service's person or a typing mark", () => {
    const read = accountPresenceFrames(new Set([5]));
    const typing = { id: null, at: 1, type: "typing", chatId: ROOM_ID, messageId: null, who: { kind: "account", account: 5 }, on: true, lastsMs: 6000 };

    expect(read(frame(shown))).toEqual([]);
    expect(read(frame({ ...shown, who: { kind: "person", via: "chat-a", personId: 5 } }))).toEqual([]);
    expect(read(frame(typing))).toEqual([]);
  });
});
