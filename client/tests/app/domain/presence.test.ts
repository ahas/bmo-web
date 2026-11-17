import { describe, expect, test } from "bun:test";

import { expireTyping, memberPresence, nextExpiry, personChip, presenceChip, presenceWords, roomPresence, stepPresence, stepTyping, typingPeople, typingWords } from "../../../apps/web/app/domain/presence";

import type { PresenceEvent, TypingEvent } from "../../../apps/web/shared/types";

// Who writes in a room and who is here, as the stream hands them and the room draws them (docs/web.md, 「Presence and
// typing」). Words are read by their keys, the figures beside them.

const t = (key: string, named?: Record<string, unknown>): string => (named === undefined ? key : `${key} ${JSON.stringify(named)}`);
const ROOM = 11;
const ME = 1;

const presence = (account: number, state: PresenceEvent["state"], lastSeenAt: number | null = null): PresenceEvent =>
  ({ id: null, type: "presence", chatId: ROOM, who: { kind: "account", account }, state, lastSeenAt });
const typing = (account: number, on: boolean, lastsMs: number | null = 6_000): TypingEvent =>
  ({ id: null, type: "typing", chatId: ROOM, who: { kind: "account", account }, on, lastsMs });

describe("a room's presence", () => {
  test("is the best state among the people other than the reader, and unknown takes a person away", () => {
    let held = stepPresence(new Map(), presence(ME, "online"));

    held = stepPresence(held, presence(2, "away"));
    expect(roomPresence(held.get(ROOM), ME)).toMatchObject({ best: "away", online: 0 });

    held = stepPresence(held, presence(3, "online"));
    expect(roomPresence(held.get(ROOM), ME)).toMatchObject({ best: "online", online: 1 });

    held = stepPresence(stepPresence(held, presence(3, null)), presence(2, "offline", 5_000));
    expect(roomPresence(held.get(ROOM), ME)).toMatchObject({ best: null, online: 0 });
    expect(presenceChip(roomPresence(held.get(ROOM), ME)).show).toBe(false);
  });

  test("is said as one person's state or last moment seen, and as how many are online for several", () => {
    const one = stepPresence(new Map(), presence(2, "offline", 1_000));

    expect(presenceWords(t, roomPresence(one.get(ROOM), ME), 301_000)).toBe('room.label.presence_last_seen {"ago":"common.label.minutes {\\"m\\":5}"}');
    expect(presenceWords(t, roomPresence(stepPresence(one, presence(2, "away")).get(ROOM), ME), 0)).toBe("room.label.presence_away");

    const several = stepPresence(stepPresence(one, presence(3, "online")), presence(4, "online"));

    expect(presenceWords(t, roomPresence(several.get(ROOM), ME), 0)).toBe('room.label.presence_online_count {"n":"2"}');
    expect(presenceWords(t, roomPresence(stepPresence(new Map(), presence(2, "offline")).get(ROOM), ME), 0)).toBeNull();
  });
});

describe("a room's member", () => {
  test("is found by their account where the platform knows one, else by their number, and the reader by nobody", () => {
    let held = stepPresence(new Map(), presence(2, "away"));

    held = stepPresence(held, { id: null, type: "presence", chatId: ROOM, who: { kind: "person", via: "chat-a", personId: 9 }, state: "online", lastSeenAt: null });
    held = stepPresence(held, presence(ME, "online"));

    expect(memberPresence(held.get(ROOM), { person: 50, account: "2" }, ME)?.state).toBe("away");
    expect(memberPresence(held.get(ROOM), { person: 9, account: null }, ME)?.state).toBe("online");
    expect(memberPresence(held.get(ROOM), { person: 9, account: "7" }, ME)).toBeNull();
    expect(memberPresence(held.get(ROOM), { person: 1, account: String(ME) }, ME)).toBeNull();
    expect(personChip(null).show).toBe(false);
    expect(personChip({ who: { kind: "account", account: 2 }, state: "away", lastSeenAt: null })).toMatchObject({ show: true, color: "warning" });
  });
});

describe("who writes in a room", () => {
  test("stands for its life, is renewed by a new telling and ends by off", () => {
    let held = stepTyping(new Map(), typing(2, true), 1_000);

    expect(nextExpiry(held)).toBe(7_000);
    held = stepTyping(held, typing(2, true), 5_000);
    expect(expireTyping(held, 7_000)).toBe(held);
    expect(expireTyping(held, 11_000).size).toBe(0);
    expect(stepTyping(held, typing(2, false), 6_000).size).toBe(0);
    expect(nextExpiry(stepTyping(new Map(), typing(2, true, null), 0))).toBeNull();
  });

  test("leaves out the reader and the room's answerer", () => {
    let held = stepTyping(new Map(), typing(ME, true), 0);

    held = stepTyping(held, { id: null, type: "typing", chatId: ROOM, who: { kind: "answerer" }, on: true, lastsMs: null }, 0);
    expect(typingPeople(held.get(ROOM), ME)).toEqual([]);

    held = stepTyping(held, { id: null, type: "typing", chatId: ROOM, who: { kind: "person", via: "chat-a", personId: 9 }, on: true, lastsMs: 6_000 }, 0);
    expect(typingPeople(held.get(ROOM), ME)).toEqual([{ kind: "person", via: "chat-a", personId: 9 }]);
  });

  test("is said by one name, two, the first and how many more, or nobody named", () => {
    expect(typingWords(t, [])).toBeNull();
    expect(typingWords(t, [null])).toBe("room.label.typing_someone");
    expect(typingWords(t, ["agent-a"])).toBe('room.label.typing_one {"name":"agent-a"}');
    expect(typingWords(t, ["agent-a", "agent-b"])).toBe('room.label.typing_two {"first":"agent-a","second":"agent-b"}');
    expect(typingWords(t, ["agent-a", null, "agent-b"])).toBe('room.label.typing_many {"name":"agent-a","n":"2"}');
  });
});
