import { describe, expect, test } from "bun:test";

import { createError } from "h3";

import { wording } from "../../../apps/web/shared/wording";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { RoomProvidersView } from "../../../apps/web/shared/types";

// A room's chat providers as the room information shows them: the ones the room is on, each by its name in the pack, and whether one
// of them offers the avatar mode; the administrator's alone, and a refusal of the receiver's said by the pack's
// sentence for its code. Which providers carry a room is fixed as it is added, so the console offers no write. Nothing
// here reads which provider a key names, so the keys are neutral.

const globals: Record<string, unknown> = globalThis;

const listed = [
  { key: "record", label: "Record", roomModes: [] },
  { key: "provider-a", label: "Provider A", roomModes: ["record-only", "avatar"] },
  { key: "provider-b", label: "Provider B", roomModes: ["record-only"] }
];
// Each provider as the tab reads it: by its name in the pack, never the receiver's label; a key the pack holds no
// words for is called by the pack's word for a messenger.
const named = (key: string) => ({ key, label: wording("room.label.road_other", { key }) });
const rooms: Record<string, string[]> = { "-7": ["provider-a", "record"], "-8": ["provider-b", "record"], "-9": ["record"] };

const receiver = standIn("RECEIVER", (one) => {
  const path = one.path.split("?")[0] ?? "";
  const room = /^\/rooms\/(-?\d+)\/providers$/.exec(path)?.[1];

  if (path === "/providers") return answer({ items: listed, more: false });
  if (room !== undefined && rooms[room] !== undefined) return answer({ providers: rooms[room], chosen: true, fileLimit: null });
  if (room !== undefined) return answer({ code: "not-found", error: "The record holds no such room." }, 404);

  return answer({ code: "not-found", error: "Not served here." }, 404);
});

const read = await routeOf<RoomProvidersView>("../../apps/web/server/api/rooms/[chatId]/providers.get");

describe("a room's chat providers", () => {
  test("reads the providers the room is on, in its order, each by its name", async () => {
    expect((await asked(read, { params: { chatId: "-7" } })).answer).toEqual({ on: [named("provider-a"), { key: "record", label: wording("room.label.road_record") }], avatarOffered: true });
  });

  test("offers the avatar mode only where a provider the room is on offers it", async () => {
    expect((await asked(read, { params: { chatId: "-8" } })).answer).toMatchObject({ avatarOffered: false });
    expect((await asked(read, { params: { chatId: "-9" } })).answer).toMatchObject({ avatarOffered: false });
  });

  test("says the receiver's refusal by the pack's sentence for its code", async () => {
    expect(await asked(read, { params: { chatId: "-404" } })).toMatchObject({ status: 404, message: wording("room.error.receiver_not_found") });
  });

  test("is the administrator's alone", async () => {
    const administrator = globals.requireAdministrator;

    globals.requireAdministrator = async () => {
      throw createError({ statusCode: 403, statusMessage: "Forbidden" });
    };

    try {
      receiver.asked.length = 0;

      expect((await asked(read, { params: { chatId: "-7" } })).status).toBe(403);
      expect(receiver.asked).toEqual([]);
    } finally {
      globals.requireAdministrator = administrator;
    }
  });
});
