import { describe, expect, test } from "bun:test";

import { createError } from "h3";

import { wording } from "../../../apps/web/shared/wording";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { RoomModeView } from "../../../apps/web/shared/types";

// A room's mode: read off its registration and set between avatar and record-only under the administrator's name; a
// room no one has set a mode for reads as none and takes one where its road offers the mode, and a refusal of the
// receiver's is said by the pack's sentence for its code.

const globals: Record<string, unknown> = globalThis;

// Each room's mode as the stand-in last wrote it; a room it does not hold stands in no mode.
const modes: Record<string, string> = { "-7": "record-only" };

const receiver = standIn("RECEIVER", (one) => {
  const path = one.path.split("?")[0] ?? "";

  // No room here is anyone's private room; a private room's refusal stands in room-private.test.ts.
  const held = /^\/rooms\/(-?\d+)$/.exec(path);
  if (held) return answer({ id: Number(held[1]), title: null, privateOf: null });

  const registration = /^\/rooms\/(-?\d+)\/registration$/.exec(path);
  if (registration === null) return answer({ code: "not-found", error: "Not served here." }, 404);

  const room = registration[1]!;
  const refused = { "-8": ["avatar-unoffered", "the service offers no avatar"], "-6": ["no-chat-service", "the room stands on no chat service"], "-5": ["room-takes-no-avatar", "the service never answers this room"] }[room];

  if (one.method === "PUT" && refused !== undefined) {
    return answer({ code: refused[0], error: refused[1] }, 409);
  }

  if (one.method === "PUT") modes[room] = String(one.body?.mode);

  return answer({
    room: Number(room),
    mode: modes[room] ?? null,
    providers: ["provider-a"],
    chosen: room === "-7",
    answerers: {},
    standingAgents: [],
    readOnly: false,
    readOnlyBy: []
  });
});

const read = await routeOf<RoomModeView>("../../apps/web/server/api/rooms/[chatId]/mode.get");
const write = await routeOf<RoomModeView>("../../apps/web/server/api/rooms/[chatId]/mode.put");

describe("a room's mode", () => {
  test("reads the mode off the registration, asked under the administrator's name", async () => {
    receiver.asked.length = 0;

    expect((await asked(read, { params: { chatId: "-7" } })).answer).toEqual({ mode: "record-only" });
    expect(receiver.asked[0]?.path).toBe("/rooms/-7/registration?by=1");
  });

  test("answers no mode for a room no one has set one for, and takes one written on it all the same", async () => {
    receiver.asked.length = 0;

    expect((await asked(read, { params: { chatId: "-9" } })).answer).toEqual({ mode: null });

    expect((await asked(write, { params: { chatId: "-9" }, body: { mode: "avatar" } })).answer).toEqual({ mode: "avatar" });
    expect(receiver.asked.filter((one) => one.method === "PUT").map((one) => [one.method, one.path, one.body])).toEqual([["PUT", "/rooms/-9/registration?by=1", { mode: "avatar", account: 1 }]]);
    expect((await asked(read, { params: { chatId: "-9" } })).answer).toEqual({ mode: "avatar" });
  });

  test("sets the mode on the receiver and answers it as the receiver now holds it", async () => {
    receiver.asked.length = 0;

    expect((await asked(write, { params: { chatId: "-7" }, body: { mode: "avatar" } })).answer).toEqual({ mode: "avatar" });
    expect(receiver.asked.filter((one) => one.method === "PUT").map((one) => [one.method, one.path, one.body])).toEqual([["PUT", "/rooms/-7/registration?by=1", { mode: "avatar", account: 1 }]]);
  });

  test("refuses a mode it does not know and never reaches the receiver", async () => {
    receiver.asked.length = 0;

    for (const body of [{ mode: "loud" }, {}, null]) {
      expect(await asked(write, { params: { chatId: "-7" }, body })).toMatchObject({ status: 400, message: wording("room.error.mode_save_failed") });
    }

    expect(receiver.asked).toEqual([]);
  });

  test("says the receiver's refusal by the pack's sentence for its code", async () => {
    expect(await asked(write, { params: { chatId: "-8" }, body: { mode: "avatar" } })).toMatchObject({ status: 409, message: wording("room.error.room_add_avatar") });
    expect(await asked(write, { params: { chatId: "-6" }, body: { mode: "avatar" } })).toMatchObject({ status: 409, message: wording("room.error.mode_no_chat_service") });
    expect(await asked(write, { params: { chatId: "-5" }, body: { mode: "avatar" } })).toMatchObject({ status: 409, message: wording("room.error.mode_takes_no_avatar") });
  });

  test("is the administrator's alone, both ways", async () => {
    const administrator = globals.requireAdministrator;

    globals.requireAdministrator = async () => {
      throw createError({ statusCode: 403, statusMessage: "Forbidden" });
    };

    try {
      receiver.asked.length = 0;

      expect((await asked(read, { params: { chatId: "-7" } })).status).toBe(403);
      expect((await asked(write, { params: { chatId: "-7" }, body: { mode: "avatar" } })).status).toBe(403);
      expect(receiver.asked).toEqual([]);
    } finally {
      globals.requireAdministrator = administrator;
    }
  });
});
