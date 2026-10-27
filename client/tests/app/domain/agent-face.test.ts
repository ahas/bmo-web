import { describe, expect, test } from "bun:test";

import { agentFacesOf, agentPicture, wearsFace } from "../../../apps/web/app/domain/agent-face";
import { avatarIndex } from "../../../apps/web/app/domain/avatars";

import type { RoomSummary } from "../../../apps/web/shared/types";

// Every chat agent stands as its own face, decided in one place (docs/web.md, 「Profile photos」): the picture of the
// person number its words stand under, then of a room made for it, and failing both its label's letter; never a mark
// of its own. A room's own session wears the room's picture, and every other agent its group's mark.

const avatars = avatarIndex(
  [
    { kind: "person", id: 501, url: "/api/avatars/person/501?v=1" },
    { kind: "room", id: -900, url: "/api/avatars/room/-900?v=1" },
    { kind: "room", id: -800, url: "/api/avatars/room/-800?v=1" }
  ],
  (path) => path
);
const room = (chatId: number, companions: string[]): RoomSummary => ({
  chatId, title: `room ${chatId}`, messageCount: 1, lastMessageAt: null, pinned: false, madeForCompanions: true, companions
});
const rooms = [room(-700, ["agent-b"]), room(-900, ["agent-b"])];

describe("an agent's face", () => {
  test("is the picture of the person number its words stand under", () => {
    expect(agentPicture({ name: "agent-a", label: "Agent A", chatId: null }, avatars, agentFacesOf([{ name: "agent-a", personId: 501 }]), rooms).src).toBe(
      "/api/avatars/person/501?v=1"
    );
  });

  test("is the picture of a room made for it where its number has none, the first such room that keeps one", () => {
    expect(agentPicture({ name: "agent-b", label: "Agent B", chatId: null }, avatars, agentFacesOf([{ name: "agent-b", personId: 502 }]), rooms).src).toBe(
      "/api/avatars/room/-900?v=1"
    );
  });

  test("is its label's letter where neither keeps a picture, never a mark of its own", () => {
    const face = agentPicture({ name: "agent-c", label: "Agent C", chatId: null }, avatars, agentFacesOf([]), rooms);

    expect(face.src).toBeUndefined();
    expect(face.icon).toBeUndefined();
    expect(face.text).toBe("A");
  });

  test("is the agent's own, never a room's: a session registered for a room wears the agent's face", () => {
    const face = agentPicture({ name: "chat-800", label: "room -800", chatId: -800 }, avatars, agentFacesOf([]), rooms);

    expect(face.src).not.toBe("/api/avatars/room/-800?v=1");
  });

  test("is worn by the chat agents alone", () => {
    expect(wearsFace({ group: "designated" })).toBe(true);
    expect(wearsFace({ group: "worker" })).toBe(false);
    expect(wearsFace({ group: "gate" })).toBe(false);
  });
});
