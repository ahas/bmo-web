import { describe, expect, test } from "bun:test";

import { agentFacesOf, agentPicture, wearsFace } from "../../../apps/web/app/domain/agent-face";
import { avatarIndex } from "../../../apps/web/app/domain/avatars";

// Every chat agent stands as its own face, decided in one place (docs/web.md, 「Profile photos」): the picture of the
// person number its words stand under, then of the newest room it speaks in that keeps one, and failing both its label's
// letter; never a mark of its own. A room's own session wears the room's picture, and every other agent its group's mark.

const avatars = avatarIndex(
  [
    { kind: "person", id: 501, url: "/api/avatars/person/501?v=1" },
    { kind: "room", id: -900, url: "/api/avatars/room/-900?v=1" },
    { kind: "room", id: -800, url: "/api/avatars/room/-800?v=1" }
  ],
  (path) => path
);

describe("an agent's face", () => {
  test("is the picture of the person number its words stand under", () => {
    expect(agentPicture({ name: "agent-a", label: "Agent A", chatId: null }, avatars, agentFacesOf([{ name: "agent-a", personId: 501, rooms: [-900] }])).src).toBe(
      "/api/avatars/person/501?v=1"
    );
  });

  test("is the picture of a room it speaks in where its number has none, the newest such room that keeps one", () => {
    expect(agentPicture({ name: "agent-b", label: "Agent B", chatId: null }, avatars, agentFacesOf([{ name: "agent-b", personId: 502, rooms: [-700, -900, -800] }])).src).toBe(
      "/api/avatars/room/-900?v=1"
    );
  });

  test("is its label's letter where neither keeps a picture, never a mark of its own", () => {
    const face = agentPicture({ name: "agent-c", label: "Agent C", chatId: null }, avatars, agentFacesOf([]));

    expect(face.src).toBeUndefined();
    expect(face.icon).toBeUndefined();
    expect(face.text).toBe("A");
  });

  test("is the agent's own, never a room's: a session registered for a room wears the agent's face", () => {
    const face = agentPicture({ name: "chat-800", label: "room -800", chatId: -800 }, avatars, agentFacesOf([]));

    expect(face.src).not.toBe("/api/avatars/room/-800?v=1");
  });

  test("is worn by the supervisors alone", () => {
    expect(wearsFace({ group: "supervisor" })).toBe(true);
    expect(wearsFace({ group: "role" })).toBe(false);
    expect(wearsFace({ group: "repository" })).toBe(false);
  });
});
