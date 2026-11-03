import { describe, expect, test } from "bun:test";

import { removable, removalGroups, removedRoom, rowsTally } from "../../../apps/web/app/domain/room-removal";

import type { RoomRemovalPreview } from "../../../apps/web/shared/types";

// What the registration removal dialog lists of bmo-server's preview (docs/web.md, the room
// screen's registration removal).

const preview: RoomRemovalPreview = {
  chat: -1005,
  refused: null,
  warnings: ["agent-b answers here"],
  goes: [
    { table: "messages", rows: 120 },
    { table: "chat_titles", rows: 1 },
    { table: "notes", rows: 0 },
    { table: "memories", rows: 7 },
  ],
  stays: [
    { table: "todos", rows: 2 },
    { table: "agents", rows: 1, cleared: ["chat_id"] },
    { table: "jobs", rows: 0 },
  ],
  pictures: ["/data/avatars/room.png"],
  settings: { taken: ["people_digest_since:agent-a:-1005"], undeclared: ["mystery:-1005"] },
  folders: [
    { path: "collected/-1005", files: 3 },
    { path: "brain/agents/chat/rooms/-1005", files: 2, documents: ["people/agent-a.md", "rules/room.md"] },
    { path: "images/-1005", files: 0 },
  ],
  copies: [{ path: "workbench/worker/bmo.db", rows: 40, failure: null }],
};

describe("what the dialog lists of a removal", () => {
  test("adds up each group's rows, leaving out tables it holds nothing in, the largest first", () => {
    expect(rowsTally(preview.goes)).toEqual({
      total: 128,
      tables: [
        { table: "messages", rows: 120 },
        { table: "memories", rows: 7 },
        { table: "chat_titles", rows: 1 },
      ],
    });
  });

  test("lists the brain's documents apart from the data root's folders, and what stays apart from what goes", () => {
    const groups = removalGroups(preview);

    expect(groups.folders.map((folder) => folder.path)).toEqual(["collected/-1005", "images/-1005"]);
    expect(groups.documents).toEqual([preview.folders[1]!]);
    expect(groups.stays).toEqual({ total: 3, tables: [{ table: "todos", rows: 2 }, { table: "agents", rows: 1, cleared: ["chat_id"] }] });
    expect([groups.pictures, groups.settings, groups.undeclared, groups.warnings]).toEqual([
      1,
      ["people_digest_since:agent-a:-1005"],
      ["mystery:-1005"],
      ["agent-b answers here"],
    ]);
  });

  test("offers the removal only for a read preview no declaration refuses, and carries the refusal's reason", () => {
    const refusal = "the owner's private chat";
    const refused = { ...preview, refused: refusal };

    expect(removable(preview)).toBe(true);
    expect(removable(refused)).toBe(false);
    expect(removable(null)).toBe(false);
    expect(removalGroups(refused).refused).toBe(refusal);
  });

  test("a removal closes its room only where it was made after the tab opened", () => {
    const removal = { id: 7, at: 1_000, type: "room-removed", chatId: -100, messageId: null } as const;

    expect(removedRoom(removal, 1_000)).toBe(-100);
    expect(removedRoom(removal, 1_001)).toBeNull();
    expect(removedRoom({ ...removal, type: "message" }, 1_000)).toBeNull();
    // An event stamped in milliseconds reads the same.
    expect(removedRoom({ ...removal, at: 1_700_000_000_500 }, 1_700_000_000)).toBe(-100);
    expect(removedRoom({ ...removal, at: 1_699_999_999_500 }, 1_700_000_000)).toBeNull();
  });
});
