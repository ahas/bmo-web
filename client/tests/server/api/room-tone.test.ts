import { describe, expect, test } from "bun:test";

import { createError } from "h3";

import { wording } from "../../../apps/web/shared/wording";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { RoomToneView } from "../../../apps/web/shared/types";

// A room's tone layer: read with the layers the receiver offers and set to one of them or to none under the
// administrator's name; a refusal of the receiver's is said by the pack's sentence for its code.

const globals: Record<string, unknown> = globalThis;

const TONES = ["tone-a", "tone-b"];

let tone: string | null = null;

const receiver = standIn("RECEIVER", (one) => {
  const path = one.path.split("?")[0] ?? "";

  // No room here is anyone's private room; a private room's refusal stands in room-private.test.ts.
  if (/^\/rooms\/-?\d+$/.test(path)) return answer({ id: Number(path.split("/")[2]), title: null, privateOf: null });

  if (path === "/rooms/-7/tone") {
    if (one.method === "PUT") {
      const asked = one.body?.tone;

      if (asked !== null && !TONES.includes(String(asked))) return answer({ code: "unknown-tone", error: "not offered" }, 400);

      tone = asked === null ? null : String(asked);
    }

    return answer({ room: -7, tone, tones: TONES });
  }

  return answer({ code: "not-found", error: "Not served here." }, 404);
});

const read = await routeOf<RoomToneView>("../../apps/web/server/api/rooms/[chatId]/tone.get");
const write = await routeOf<RoomToneView>("../../apps/web/server/api/rooms/[chatId]/tone.put");

describe("a room's tone layer", () => {
  test("reads the layer the room is set to and the layers offered", async () => {
    expect((await asked(read, { params: { chatId: "-7" } })).answer).toEqual({ tone: null, tones: TONES });
  });

  test("sets a layer and none on the receiver under the administrator's name and account", async () => {
    receiver.asked.length = 0;

    expect((await asked(write, { params: { chatId: "-7" }, body: { tone: "tone-a" } })).answer).toEqual({ tone: "tone-a", tones: TONES });
    expect((await asked(write, { params: { chatId: "-7" }, body: { tone: null } })).answer).toEqual({ tone: null, tones: TONES });
    expect(receiver.asked.filter((one) => one.method === "PUT").map((one) => [one.path, one.body])).toEqual([
      ["/rooms/-7/tone?by=tester", { tone: "tone-a", account: 1 }],
      ["/rooms/-7/tone?by=tester", { tone: null, account: 1 }]
    ]);
  });

  test("refuses a body naming no layer and never reaches the receiver", async () => {
    receiver.asked.length = 0;

    for (const body of [{ tone: 3 }, {}, null]) {
      expect(await asked(write, { params: { chatId: "-7" }, body })).toMatchObject({ status: 400, message: wording("room_info.error.tone_save_failed") });
    }

    expect(receiver.asked).toEqual([]);
  });

  test("says a layer the receiver does not offer by the pack's sentence", async () => {
    expect(await asked(write, { params: { chatId: "-7" }, body: { tone: "unoffered" } })).toMatchObject({ status: 400, message: wording("room_info.error.tone_unknown") });
  });

  test("is the administrator's alone, both ways", async () => {
    const administrator = globals.requireAdministrator;

    globals.requireAdministrator = async () => {
      throw createError({ statusCode: 403, statusMessage: "Forbidden" });
    };

    try {
      receiver.asked.length = 0;

      expect((await asked(read, { params: { chatId: "-7" } })).status).toBe(403);
      expect((await asked(write, { params: { chatId: "-7" }, body: { tone: null } })).status).toBe(403);
      expect(receiver.asked).toEqual([]);
    } finally {
      globals.requireAdministrator = administrator;
    }
  });
});
