import { describe, expect, test } from "bun:test";

import KO from "../../fixtures/app/domain/room-list-name.ko.json";
import { roomListName } from "../../../apps/web/app/domain/screens";

import type { ListedRoom } from "../../../apps/web/shared/types";

// What the room list calls a room (docs/web.md, the naming rule): the agents answering it, by the labels the rest of the
// console gives them, and a room no agent answers under its own title.

const room = (over: Partial<ListedRoom>): ListedRoom => ({
  chatId: -9_000_000_000_002, title: "kakia", messageCount: 1, lastMessageAt: null, pinned: false, unread: 0, firstUnread: null, readTo: null, ...over
});

describe("the name a room list stands a room under", () => {
  test("is the agent answering it, by its own label", () => {
    expect(roomListName(room({ answeredBy: [KO.kakia] }))).toBe(KO.kakia);
  });

  test("names every agent that answers it, where two do", () => {
    expect(roomListName(room({ answeredBy: [KO.chat, KO.kakia] }))).toBe(`${KO.chat} · ${KO.kakia}`);
  });

  test("keeps the room's own title where no agent answers it", () => {
    expect(roomListName(room({ title: "a room with nobody" }))).toBe("a room with nobody");
    expect(roomListName(room({ title: "a room with nobody", answeredBy: [] }))).toBe("a room with nobody");
  });
});
