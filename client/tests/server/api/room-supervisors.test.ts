import { describe, expect, test } from "bun:test";

import { createError } from "h3";

import { wording } from "../../../apps/web/shared/wording";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { RoomSupervisorsView } from "../../../apps/web/shared/types";

// A room's supervisors: read off the room as the receiver holds it, and written whole as the administrator's
// account, the receiver's own name order answered back; an empty list is the setting left unset, and a name the
// agency does not register is said by the pack's sentence for the receiver's code.

const globals: Record<string, unknown> = globalThis;

let named = ["agent-a"];

const receiver = standIn("RECEIVER", (one) => {
  const path = one.path.split("?")[0] ?? "";

  // No room here is anyone's private room; a private room's refusal stands in room-private.test.ts.
  if (/^\/rooms\/-?\d+$/.test(path)) return answer({ id: Number(path.split("/")[2]), title: null, privateOf: null, supervisors: named });

  if (path === "/rooms/-7/supervisors" && one.method === "PUT") {
    const names = (one.body?.supervisors as string[]) ?? [];

    if (names.includes("agent-x")) return answer({ code: "unknown-supervisor", error: "no such supervisor", supervisor: "agent-x" }, 404);

    named = [...names].sort();

    return answer({ supervisors: named });
  }

  return answer({ code: "no-route", error: "Not served here." }, 404);
});

const read = await routeOf<RoomSupervisorsView>("../../apps/web/server/api/rooms/[chatId]/supervisors.get");
const write = await routeOf<RoomSupervisorsView>("../../apps/web/server/api/rooms/[chatId]/supervisors.put");

describe("a room's supervisors", () => {
  test("reads the list the room names off the room itself", async () => {
    receiver.asked.length = 0;

    expect((await asked(read, { params: { chatId: "-7" } })).answer).toEqual({ supervisors: ["agent-a"] });
  });

  test("writes the whole list as the administrator's account, with no name asked on the road", async () => {
    receiver.asked.length = 0;

    expect((await asked(write, { params: { chatId: "-7" }, body: { supervisors: ["agent-b", "agent-a"] } })).answer).toEqual({ supervisors: ["agent-a", "agent-b"] });
    expect(receiver.asked.filter((one) => one.method === "PUT").map((one) => [one.path, one.body])).toEqual([["/rooms/-7/supervisors", { supervisors: ["agent-b", "agent-a"], account: 1 }]]);
  });

  test("answers the list the receiver now holds, and an empty one leaves the setting unset", async () => {
    expect((await asked(write, { params: { chatId: "-7" }, body: { supervisors: [] } })).answer).toEqual({ supervisors: [] });

    named = ["agent-a"];
  });

  test("refuses a body that names no list of names and never reaches the receiver", async () => {
    receiver.asked.length = 0;

    for (const body of [{ supervisors: "agent-a" }, { supervisors: ["agent-a", 7] }, {}, null]) {
      expect(await asked(write, { params: { chatId: "-7" }, body })).toMatchObject({ status: 400, message: wording("room.error.supervisors_save_failed") });
    }

    expect(receiver.asked).toEqual([]);
  });

  test("says the receiver's refusal of an unregistered name by the pack's sentence for its code", async () => {
    expect(await asked(write, { params: { chatId: "-7" }, body: { supervisors: ["agent-x"] } })).toMatchObject({
      status: 404,
      message: wording("agents.error.supervisor_unknown", { supervisor: "agent-x" })
    });
  });

  test("is the administrator's alone, both ways", async () => {
    const administrator = globals.requireAdministrator;

    globals.requireAdministrator = async () => {
      throw createError({ statusCode: 403, statusMessage: "Forbidden" });
    };

    try {
      receiver.asked.length = 0;

      expect((await asked(read, { params: { chatId: "-7" } })).status).toBe(403);
      expect((await asked(write, { params: { chatId: "-7" }, body: { supervisors: [] } })).status).toBe(403);
      expect(receiver.asked).toEqual([]);
    } finally {
      globals.requireAdministrator = administrator;
    }
  });
});
