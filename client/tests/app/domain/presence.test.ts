import { describe, expect, test } from "bun:test";

import { avatarKey } from "../../../apps/web/app/domain/avatars";
import { accountEntry, expireTyping, memberPresence, nextExpiry, personChip, presenceChip, presenceWords, roomPresence, stepAccountPresence, stepPresence, stepTyping, typingPeople, typingWords, typistsOf } from "../../../apps/web/app/domain/presence";

import type { PresenceEvent, RoomMember, TypingEvent } from "../../../apps/web/shared/types";

// Who writes in a room and who is here, as the stream hands them and the room draws them (docs/web.md, 「Presence and
// typing」). Words are read by their keys, the figures beside them.

const t = (key: string, named?: Record<string, unknown>): string => (named === undefined ? key : `${key} ${JSON.stringify(named)}`);
const ROOM = 11;
const ME = 1;

const presence = (account: number, state: PresenceEvent["state"], lastSeenAt: number | null = null): PresenceEvent =>
  ({ id: null, type: "presence", chatId: ROOM, who: { kind: "account", account }, state, lastSeenAt });
const typing = (account: number, on: boolean, lastsMs: number | null = 6_000): TypingEvent =>
  ({ id: null, type: "typing", chatId: ROOM, who: { kind: "account", account }, on, lastsMs });

describe("an account's presence outside a room", () => {
  test("is held by account, unknown taking it away, and never drawn for the reader", () => {
    let accounts = stepAccountPresence(new Map(), { account: 2, state: "away", lastSeenAt: null });

    accounts = stepAccountPresence(accounts, { account: ME, state: "online", lastSeenAt: null });
    expect(accountEntry(accounts, 2, ME)?.state).toBe("away");
    expect(accountEntry(accounts, ME, ME)).toBeNull();

    accounts = stepAccountPresence(accounts, { account: 2, state: null, lastSeenAt: null });
    expect(accountEntry(accounts, 2, ME)).toBeNull();
  });

  test("stands for a member the room tells nothing of, and gives way to the room's where it tells", () => {
    const accounts = stepAccountPresence(new Map(), { account: 2, state: "away", lastSeenAt: null });
    const room = stepPresence(new Map(), presence(2, "online")).get(ROOM);
    const member = { person: null, account: "2" };

    expect(memberPresence(room, member, ME, accounts)?.state).toBe("online");
    expect(memberPresence(new Map(), member, ME, accounts)?.state).toBe("away");
    expect(memberPresence(new Map(), { person: 5, account: null }, ME, accounts)).toBeNull();
  });
});

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
  test("stands for its life, is renewed by a new telling, and ends by off, as the receiver tells once a message of theirs lands", () => {
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
});

describe("the room's typing picture", () => {
  const members: RoomMember[] = [
    { person: 501, name: "agent-a", status: null, account: "2", inConsole: true, grants: null },
    { person: 502, name: "agent-b", status: null, account: null, inConsole: false, grants: null },
    { person: 503, name: "agent-c", status: null, account: "3", inConsole: true, grants: null },
    { person: 504, name: "agent-d", status: null, account: "4", inConsole: true, grants: null },
    { person: 505, name: "agent-e", status: null, account: "5", inConsole: true, grants: null }
  ];
  const avatars = new Map([[avatarKey("person", 502), "/avatars/person-502"]]);
  const writersOf = (held: ReturnType<typeof stepTyping>) => typistsOf(typingPeople(held.get(ROOM), ME), members, avatars);
  const person = (personId: number, on: boolean): TypingEvent =>
    ({ id: null, type: "typing", chatId: ROOM, who: { kind: "person", via: "chat-a", personId }, on, lastsMs: 6_000 });

  test("names one writer and wears the face their row in the room's people wears", () => {
    const [one, ...rest] = writersOf(stepTyping(new Map(), person(502, true), 0));

    expect(rest).toEqual([]);
    expect(one?.name).toBe("agent-b");
    expect(one?.face.src).toBe("/avatars/person-502");
    expect(typingWords(t, one === undefined ? [] : [one])).toBe('room.label.typing_names {"names":"agent-b"}');
  });

  test("names every one of several writers, past the faces the picture stands, and never as a count", () => {
    let held = stepTyping(new Map(), person(502, true), 0);

    for (const account of [2, 3, 4, 5]) held = stepTyping(held, typing(account, true), 0);

    const writers = writersOf(held);

    expect(writers.map((writer) => writer.name)).toEqual(["agent-b", "agent-a", "agent-c", "agent-d", "agent-e"]);
    expect(writers.every((writer) => writer.face.text !== undefined || writer.face.src !== undefined)).toBe(true);
    expect(typingWords(t, writers)).toBe('room.label.typing_names {"names":"agent-b, agent-a, agent-c, agent-d, agent-e"}');
  });

  test("says a writer the room's people do not hold as someone, beside the others by their names", () => {
    const writers = writersOf(stepTyping(stepTyping(new Map(), typing(2, true), 0), person(999, true), 0));

    expect(writers.map((writer) => writer.name)).toEqual(["agent-a", null]);
    expect(writers[1]?.face.src).toBeUndefined();
    expect(typingWords(t, writers)).toBe('room.label.typing_names {"names":"agent-a, room.label.typing_unnamed"}');
  });

  test("drops a writer whose mark ends, by off or by its life, and says nothing once nobody writes", () => {
    let held = stepTyping(stepTyping(new Map(), typing(2, true), 0), typing(3, true, 2_000), 0);

    held = stepTyping(held, typing(2, false), 1_000);
    expect(writersOf(held).map((writer) => writer.name)).toEqual(["agent-c"]);

    held = expireTyping(held, 2_000);
    expect(writersOf(held)).toEqual([]);
    expect(typingWords(t, writersOf(held))).toBeNull();
  });
});
