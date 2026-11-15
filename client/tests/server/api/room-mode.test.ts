import { describe, expect, test } from "bun:test";

import { createError } from "h3";

import { wording } from "../../../apps/web/shared/wording";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { RoomModeView } from "../../../apps/web/shared/types";

// A room's mode: read off its registration and set between avatar and record-only under the administrator's name;
// a room never added has none, and a refusal of the receiver's is said by the pack's sentence for its code.

const globals: Record<string, unknown> = globalThis;

let mode = "record-only";

const receiver = standIn("RECEIVER", (one) => {
  const path = one.path.split("?")[0] ?? "";

  if (path === "/rooms/-9/registration") return answer({ code: "room-not-added", error: "never added" }, 409);

  if (path === "/rooms/-8/registration" && one.method === "PUT") {
    return answer({ code: "avatar-unoffered", error: "the service offers no avatar" }, 409);
  }

  if (path === "/rooms/-7/registration") {
    if (one.method === "PUT") mode = String(one.body?.mode);

    return answer({ room: -7, mode, providers: ["provider-a"], chosen: "provider-a", answerers: {}, readOnly: false, readOnlyBy: [] });
  }

  return answer({ code: "not-found", error: "Not served here." }, 404);
});

const read = await routeOf<RoomModeView>("../../apps/web/server/api/rooms/[chatId]/mode.get");
const write = await routeOf<RoomModeView>("../../apps/web/server/api/rooms/[chatId]/mode.put");

describe("a room's mode", () => {
  test("reads the mode off the registration, asked under the administrator's name", async () => {
    receiver.asked.length = 0;

    expect((await asked(read, { params: { chatId: "-7" } })).answer).toEqual({ mode: "record-only" });
    expect(receiver.asked[0]?.path).toBe("/rooms/-7/registration?by=tester");
  });

  test("answers no mode for a room that was never added", async () => {
    expect((await asked(read, { params: { chatId: "-9" } })).answer).toEqual({ mode: null });
  });

  test("sets the mode on the receiver and answers it as the receiver now holds it", async () => {
    receiver.asked.length = 0;

    expect((await asked(write, { params: { chatId: "-7" }, body: { mode: "avatar" } })).answer).toEqual({ mode: "avatar" });
    expect(receiver.asked.map((one) => [one.method, one.path, one.body])).toEqual([["PUT", "/rooms/-7/registration?by=tester", { mode: "avatar" }]]);
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
    expect(await asked(write, { params: { chatId: "-9" }, body: { mode: "avatar" } })).toMatchObject({ status: 409, message: wording("room.error.mode_not_added") });
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
