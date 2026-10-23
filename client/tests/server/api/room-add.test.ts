import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

// A room added from a chat service's account (the receiver's docs/api.md, 「Rooms」): the services that list their
// rooms, a page of one service's rooms, and the add itself, each refusal said in the pack's sentence for its code.

const receiver = standIn("RECEIVER", (call) => {
  if (call.path === "/providers") {
    return answer({
      items: [
        { key: "service-a", label: "Service A", listsRooms: true, roomModes: ["record-only", "avatar"] },
        { key: "record", label: "Record", listsRooms: false, roomModes: [] }
      ],
      more: false
    });
  }

  if (call.path.startsWith("/providers/service-a/rooms")) {
    return answer({ items: [{ id: 7, title: "room-a", kind: "group", privateTo: null, mode: null }, { id: 8, title: null, kind: "owner", privateTo: 3, mode: "avatar" }], more: true });
  }

  if (call.method === "POST" && call.path === "/rooms") {
    return call.body?.roomId === 8
      ? answer({ code: "room-added", error: "the room is already added" }, 409)
      : answer({ id: 7, title: "room-a", messageCount: 0, lastMessageAt: null, pinned: false, senders: [], companions: [], ownerRoom: false, registered: true, workRoom: null, mode: "record-only" }, 201);
  }

  return answer({ code: "not-found", error: "no route" }, 404);
});

const services = await routeOf<unknown>("../../apps/web/server/api/room-add/index.get");
const page = await routeOf<unknown>("../../apps/web/server/api/room-add/[key].get");
const add = await routeOf<unknown>("../../apps/web/server/api/rooms.post");

describe("adding a room", () => {
  test("offers the services that list their account's rooms, with their modes", async () => {
    expect((await asked(services, {})).answer).toEqual([{ key: "service-a", label: "Service A", modes: ["record-only", "avatar"] }]);
  });

  test("reads a page of a service's rooms past the one given", async () => {
    const read = await asked(page, { params: { key: "service-a" }, query: { after: "5", limit: "50" } });

    expect(read.answer).toEqual({ items: [{ id: 7, title: "room-a", kind: "group", mode: null }, { id: 8, title: null, kind: "owner", mode: "avatar" }], more: true });
    expect(receiver.asked.at(-1)?.path).toBe("/providers/service-a/rooms?after=5&limit=50");
  });

  test("adds a room with its mode and an empty title left out, and answers the room's number", async () => {
    const read = await asked(add, { body: { provider: "service-a", roomId: 7, mode: "record-only", title: "  " } });

    expect(read.answer).toEqual({ chatId: 7, title: "room-a" });
    expect(receiver.asked.at(-1)?.body).toEqual({ provider: "service-a", roomId: 7, mode: "record-only", title: null });
  });

  test("says a room already added in the pack's sentence", async () => {
    const read = await asked(add, { body: { provider: "service-a", roomId: 8, mode: "avatar" } });

    expect(read.status).toBe(409);
    expect(read.message).toBe(wording("room.error.room_add_added"));
  });

  test("refuses a body that names no mode it knows, asking the receiver nothing", async () => {
    const before = receiver.asked.length;
    const read = await asked(add, { body: { provider: "service-a", roomId: 7, mode: "loud" } });

    expect(read.status).toBe(400);
    expect(receiver.asked.length).toBe(before);
  });
});
