import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { RoomAdded } from "../../../apps/web/shared/types";

// A group started from a chat service's contacts (docs/web.md, 「Sidebar」): it carries only the supervisor the
// person adding it owns, named on the room as the room stands, or none at all. A supervisor another person owns
// is refused before the receiver is asked, so no room stands on it.

const GROUP = { provider: "service-a", contactIds: [51, 52], mode: "record-only", title: "Plans" };

const agency = standIn("AGENCY", (call) => {
  if (call.path === "/supervisors") {
    return answer({
      items: [
        { name: "agent-a", label: "Agent A", ownerAccount: 1 },
        { name: "agent-b", label: "Agent B", ownerAccount: 2 }
      ],
      more: false
    });
  }

  return answer({ code: "not-found", error: "no such route" }, 404);
});

const receiver = standIn("RECEIVER", (call) => {
  if (call.method === "POST" && call.path === "/rooms") {
    return answer({ id: 7, title: "Plans", messageCount: 0, lastMessageAt: null, pinned: false, senders: [], supervisors: [], ownerRoom: false, registered: true, workRoom: null, mode: "record-only" }, 201);
  }

  if (call.method === "PUT" && call.path === "/rooms/7/supervisors") {
    return answer({ supervisors: call.body?.supervisors });
  }

  return answer({ code: "no-route", error: "no route" }, 404);
});

const add = await routeOf<RoomAdded>("../../apps/web/server/api/rooms.post");

describe("a group room's supervisor", () => {
  test("names the creator's own supervisor on the room as it stands", async () => {
    receiver.asked.length = 0;
    agency.asked.length = 0;

    const read = await asked(add, { body: { ...GROUP, supervisor: "agent-a" } });

    expect(read.answer).toEqual({ chatId: 7, title: "Plans" });
    expect(receiver.asked.map((one) => [one.method, one.path, one.body])).toEqual([
      ["POST", "/rooms", { ...GROUP, accountId: 1 }],
      ["PUT", "/rooms/7/supervisors", { supervisors: ["agent-a"] }]
    ]);
    expect(agency.asked.map((one) => one.path)).toEqual(["/supervisors"]);
  });

  test("stands with none where none was chosen", async () => {
    receiver.asked.length = 0;
    agency.asked.length = 0;

    const read = await asked(add, { body: GROUP });

    expect(read.answer).toEqual({ chatId: 7, title: "Plans" });
    expect(receiver.asked.map((one) => [one.method, one.path])).toEqual([["POST", "/rooms"]]);
    expect(agency.asked).toEqual([]);
  });

  test("refuses another person's supervisor before the receiver is asked", async () => {
    receiver.asked.length = 0;

    const read = await asked(add, { body: { ...GROUP, supervisor: "agent-b" } });

    expect([read.status, read.message]).toEqual([400, wording("room.error.room_add_supervisor")]);
    expect(receiver.asked).toEqual([]);
  });

  test("stands on no one-to-one, which names none", async () => {
    receiver.asked.length = 0;

    const read = await asked(add, { body: { provider: "service-a", contactId: 51, mode: "record-only", supervisor: "agent-a" } });

    expect([read.status, read.message]).toEqual([400, wording("room.error.room_add_supervisor")]);
    expect(receiver.asked).toEqual([]);
  });
});
