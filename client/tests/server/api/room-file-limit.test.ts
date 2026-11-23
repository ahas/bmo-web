import { afterEach, describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { RoomFileLimit } from "../../../apps/web/shared/types";

// The largest file a room takes, as its input box reads it (docs/web.md, the room screen's input box): the receiver's
// `fileLimit` for the room, its chat service named by its name in the pack, never the receiver's label, or none where none declares one.

const ROOM = -7;

let roomProviders: () => Response = () => answer({ providers: ["chat-a"], chosen: false, fileLimit: { provider: "chat-a", bytes: 50_000_000 } });

standIn("RECEIVER", (one) => {
  const path = one.path.split("?")[0] ?? "";

  if (path === `/rooms/${ROOM}/providers`) return roomProviders();
  if (path === "/providers") return answer({ items: [{ key: "chat-a", label: "Chat A", can: [] }] });
  if (/^\/rooms\/-?\d+$/.test(path)) return answer({ id: ROOM, title: null, privateOf: null });

  return answer({ code: "failed", error: "Not served here." }, 500);
});

const limit = await routeOf<RoomFileLimit>("../../apps/web/server/api/rooms/[chatId]/file-limit.get");

afterEach(() => {
  roomProviders = () => answer({ providers: ["chat-a"], chosen: false, fileLimit: { provider: "chat-a", bytes: 50_000_000 } });
});

describe("the largest file a room takes", () => {
  test("is the receiver's limit for the room, its chat service named by its name in the pack", async () => {
    expect((await asked(limit, { params: { chatId: String(ROOM) }, context: { readableRooms: new Set([ROOM]) } })).answer).toEqual({ limit: { bytes: 50_000_000, by: wording("room.label.road_other", { key: "chat-a" }) } });
  });

  test("is none where none of the room's chat services declares one", async () => {
    roomProviders = () => answer({ providers: ["record"], chosen: true, fileLimit: null });

    const read = await asked(limit, { params: { chatId: String(ROOM) }, context: { readableRooms: new Set([ROOM]) } });

    expect(read).toMatchObject({ status: 200, answer: { limit: null } });
  });
});
