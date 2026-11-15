import { describe, expect, test } from "bun:test";

import { createError } from "h3";

import { wording } from "../../../apps/web/shared/wording";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { RoomProvidersView } from "../../../apps/web/shared/types";

// A room's chat providers: the dialog reads every provider the receiver names with the ones the room is on, and sets
// the whole list; both are the administrator's alone, and a refusal of the receiver's is said by the pack's sentence
// for its code. Nothing here reads which provider a key names, so the keys are neutral.

const globals: Record<string, unknown> = globalThis;

const listed = [{ key: "provider-a", label: "Provider A" }, { key: "provider-b", label: "Provider B" }];
let on: string[] = ["provider-a"];
let chosen = false;

const receiver = standIn("RECEIVER", (one) => {
  const path = one.path.split("?")[0] ?? "";

  if (path === "/providers") return answer({ items: listed, more: false });
  // No room here is anyone's private room; a private room's refusal stands in room-private.test.ts.
  if (/^\/rooms\/-?\d+$/.test(path)) return answer({ id: Number(path.split("/")[2]), title: null, privateOf: null });
  if (path === "/rooms/-404/providers") return answer({ code: "not-found", error: "The record holds no such room." }, 404);

  if (path === "/rooms/-7/providers" && one.method === "PUT") {
    const asked = (one.body?.providers ?? []) as string[];

    if (asked.some((key) => !listed.some((provider) => provider.key === key))) return answer({ code: "bad-request", error: "No such provider." }, 400);

    on = asked;
    chosen = true;
  }

  if (path === "/rooms/-7/providers") return answer({ providers: on, chosen });

  return answer({ code: "not-found", error: "Not served here." }, 404);
});

const read = await routeOf<RoomProvidersView>("../../apps/web/server/api/rooms/[chatId]/providers.get");
const write = await routeOf<RoomProvidersView>("../../apps/web/server/api/rooms/[chatId]/providers.put");

describe("a room's chat providers", () => {
  test("reads every provider the receiver names and the ones the room is on", async () => {
    expect((await asked(read, { params: { chatId: "-7" } })).answer).toEqual({ providers: listed, on: ["provider-a"], chosen: false });
  });

  test("sets the whole list on the receiver and answers it as the receiver now holds it", async () => {
    receiver.asked.length = 0;

    const answered = await asked(write, { params: { chatId: "-7" }, body: { providers: ["provider-a", "provider-b"] } });

    expect(answered.answer).toEqual({ providers: listed, on: ["provider-a", "provider-b"], chosen: true });
    expect(receiver.asked.filter((one) => one.method === "PUT").map((one) => [one.path, one.body])).toEqual([
      ["/rooms/-7/providers", { providers: ["provider-a", "provider-b"], account: 1 }]
    ]);
  });

  test("refuses a list that names none, or names something other than keys, and never reaches the receiver", async () => {
    receiver.asked.length = 0;

    for (const body of [{ providers: [] }, { providers: "provider-a" }, { providers: [3] }, null]) {
      expect(await asked(write, { params: { chatId: "-7" }, body })).toMatchObject({ status: 400, message: wording("room.error.providers_shape") });
    }

    expect(receiver.asked).toEqual([]);
  });

  test("says the receiver's refusal by the pack's sentence for its code", async () => {
    expect(await asked(read, { params: { chatId: "-404" } })).toMatchObject({ status: 404, message: wording("room.error.receiver_not_found") });
    expect(await asked(write, { params: { chatId: "-7" }, body: { providers: ["provider-c"] } })).toMatchObject({ status: 400, message: wording("room.error.receiver_bad_request") });
  });

  test("is the administrator's alone, both ways", async () => {
    const administrator = globals.requireAdministrator;

    globals.requireAdministrator = async () => {
      throw createError({ statusCode: 403, statusMessage: "Forbidden" });
    };

    try {
      receiver.asked.length = 0;

      expect((await asked(read, { params: { chatId: "-7" } })).status).toBe(403);
      expect((await asked(write, { params: { chatId: "-7" }, body: { providers: ["provider-b"] } })).status).toBe(403);
      expect(receiver.asked).toEqual([]);
    } finally {
      globals.requireAdministrator = administrator;
    }
  });
});
