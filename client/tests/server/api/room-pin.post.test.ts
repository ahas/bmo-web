import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { PinnedRooms } from "../../../apps/web/shared/types";

// A room pinned or let go: the route names the room and the account pinning it on the road that says which, answers the
// order as the receiver now holds it, and says a refusal of the receiver's by the pack's sentence for its code.

let order: number[] = [5];

const receiver = standIn("RECEIVER", (one) => {
  // No room here is anyone's private room; a pin of one is refused in room-private.test.ts.
  if (one.method === "GET") return answer({ id: Number(one.path.split("/")[2]), title: null, privateOf: null });

  const unpinned = /^\/pinned-rooms\/(-?\d+)$/.exec(one.path.split("?")[0] ?? "");
  const chat = unpinned === null ? (one.body?.room as number) : Number(unpinned[1]);

  if (chat === -404) return answer({ code: "not-found", error: "The record holds no such room." }, 404);
  if (one.method === "POST") order = order.includes(chat) ? order : [...order, chat];
  if (one.method === "DELETE") order = order.filter((room) => room !== chat);

  return answer({ roomIds: order });
});

const handler = await routeOf<PinnedRooms>("../../apps/web/server/api/rooms/[chatId]/pin.post");

describe("pinning a room", () => {
  test("adds the room to the receiver's order, last, and takes it out again", async () => {
    receiver.asked.length = 0;

    expect((await asked(handler, { params: { chatId: "-7" }, body: { pinned: true } })).answer).toEqual({ rooms: [5, -7] });
    expect((await asked(handler, { params: { chatId: "5" }, body: { pinned: false } })).answer).toEqual({ rooms: [-7] });
    expect(receiver.asked.filter((one) => one.method !== "GET").map((one) => [one.method, one.path, one.body])).toEqual([
      ["POST", "/pinned-rooms", { room: -7, account: 1 }],
      ["DELETE", "/pinned-rooms/5?account=1", null]
    ]);
  });

  test("refuses a request that says neither, here and in words, and never reaches the receiver", async () => {
    receiver.asked.length = 0;

    for (const body of [{}, { pinned: "yes" }, null]) {
      expect(await asked(handler, { params: { chatId: "-7" }, body })).toMatchObject({ status: 400, message: wording("room.error.pin_direction") });
    }

    expect(receiver.asked).toEqual([]);
  });

  test("says the receiver's refusal by the pack's sentence for its code", async () => {
    expect(await asked(handler, { params: { chatId: "-404" }, body: { pinned: true } })).toMatchObject({ status: 404, message: wording("room.error.receiver_not_found") });
  });
});
