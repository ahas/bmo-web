import { describe, expect, test } from "bun:test";

import { createError } from "h3";

import { wording } from "../../../apps/web/shared/wording";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { RoomNamedSupervisors, RoomSupervisorAnswering, RoomSupervisorsView } from "../../../apps/web/shared/types";

// A room's supervisors: read off the room as the receiver holds it, with the ones it may still be told to call —
// every supervisor the agency registers less the agents already standing in the room — and written whole as the
// administrator's account, the receiver's own name order answered back; an empty list is the setting left unset, and
// a name the agency does not register is said by the pack's sentence for the receiver's code.

const globals: Record<string, unknown> = globalThis;

let named = ["agent-a"];
let standing = ["agent-a", "agent-c"];

const agency = standIn("AGENCY", (one) =>
  one.path === "/supervisors"
    ? answer({
        items: [
          { name: "agent-a", label: "Agent A", ownerAccount: 1 },
          { name: "agent-b", label: null, ownerAccount: 2 },
          { name: "agent-c", label: "Agent C", ownerAccount: null },
          { name: "agent-d", label: "Agent D", ownerAccount: null }
        ],
        more: false
      })
    : answer({ code: "not-found", error: "no such route" }, 404)
);

const receiver = standIn("RECEIVER", (one) => {
  const path = one.path.split("?")[0] ?? "";

  // No room here is anyone's private room; a private room's refusal stands in room-private.test.ts.
  if (/^\/rooms\/-?\d+$/.test(path)) return answer({ id: Number(path.split("/")[2]), title: null, privateOf: null, supervisors: named });

  if (path === "/rooms/-7/registration") {
    return answer({ room: -7, mode: "avatar", providers: ["service-a"], chosen: true, answerers: {}, standingAgents: standing, readOnly: false, readOnlyBy: [] });
  }

  // The supervisors standing in the room: the one it names, in the owner's account, and one by its own account, off.
  if (path === "/rooms/-7/answerers") {
    return answer({
      default: "agent-a",
      voice: "agent-a",
      items: [
        ...named.map((name) => ({ agentName: name, defaultAnswerer: name === "agent-a", named: true, byAccount: false, on: true, voice: "owner-account" })),
        { agentName: "agent-d", defaultAnswerer: false, named: false, byAccount: true, on: false, voice: "own-account" }
      ],
      more: false
    });
  }

  if (path === "/rooms/-7/supervisors/agent-d/answering" && one.method === "PUT") {
    return answer({ agentName: "agent-d", on: one.body?.on === true });
  }

  if (path === "/rooms/-7/supervisors" && one.method === "PUT") {
    const names = (one.body?.supervisors as string[]) ?? [];

    if (names.includes("agent-x")) return answer({ code: "unknown-supervisor", error: "no such supervisor", supervisor: "agent-x" }, 404);

    named = [...names].sort();

    return answer({ supervisors: named });
  }

  return answer({ code: "no-route", error: "Not served here." }, 404);
});

const read = await routeOf<RoomSupervisorsView>("../../apps/web/server/api/rooms/[chatId]/supervisors.get");
const write = await routeOf<RoomNamedSupervisors>("../../apps/web/server/api/rooms/[chatId]/supervisors.put");
const answering = await routeOf<RoomSupervisorAnswering>("../../apps/web/server/api/rooms/[chatId]/supervisors/[name]/answering.put");

describe("a room's supervisors", () => {
  test("reads the list the room names off the room itself", async () => {
    receiver.asked.length = 0;

    expect((await asked(read, { params: { chatId: "-7" } })).answer?.supervisors).toEqual(["agent-a"]);
  });

  test("offers every registered supervisor less the agents standing in the room, each by its label", async () => {
    named = ["agent-a"];
    standing = ["agent-a", "agent-c"];
    agency.asked.length = 0;

    // agent-c stands in the room and is named by nobody, and agent-d stands by its own account, so neither is
    // offered; agent-b carries no label and is offered by its name.
    expect((await asked(read, { params: { chatId: "-7" } })).answer?.candidates).toEqual([{ name: "agent-b", label: "agent-b" }]);
    expect(agency.asked.map((one) => one.path)).toEqual(["/supervisors"]);
  });

  test("stands every supervisor in the room with how it stands and the account it answers in, each by its label", async () => {
    named = ["agent-a"];

    expect((await asked(read, { params: { chatId: "-7" } })).answer?.standing).toEqual([
      { name: "agent-a", label: "Agent A", named: true, byAccount: false, on: true, voice: "owner-account" },
      { name: "agent-d", label: "Agent D", named: false, byAccount: true, on: false, voice: "own-account" }
    ]);
  });

  test("turns a supervisor on in the room as the administrator's account, answering as the receiver holds it", async () => {
    receiver.asked.length = 0;

    const turned = await asked(answering, { params: { chatId: "-7", name: "agent-d" }, body: { on: true } });

    expect(turned.answer).toEqual({ name: "agent-d", on: true });
    expect(receiver.asked.at(-1)?.path).toBe("/rooms/-7/supervisors/agent-d/answering?account=1");
    expect(receiver.asked.at(-1)?.body).toEqual({ on: true });
  });

  test("refuses a switch that names no state and never reaches the receiver", async () => {
    receiver.asked.length = 0;

    expect((await asked(answering, { params: { chatId: "-7", name: "agent-d" }, body: {} })).status).toBe(400);
    expect(receiver.asked).toEqual([]);
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
      agency.asked.length = 0;

      expect((await asked(read, { params: { chatId: "-7" } })).status).toBe(403);
      expect((await asked(write, { params: { chatId: "-7" }, body: { supervisors: [] } })).status).toBe(403);
      expect(receiver.asked).toEqual([]);
      expect(agency.asked).toEqual([]);
    } finally {
      globals.requireAdministrator = administrator;
    }
  });
});
