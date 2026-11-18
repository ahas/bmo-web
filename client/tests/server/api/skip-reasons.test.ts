import { describe, expect, test } from "bun:test";

import { globalsRestoredAfter } from "../../support/globals";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { LatestSkipReason, SkipReasonPage } from "../../../apps/web/shared/types";

// The two routes a room's screen reads its silent turns' reasons from (docs/web.md, 「A turn the chat agent chose not to
// answer」): the reasons are the verdicts' words, so a member who reads the room is answered none and the gate is not
// asked, and a language that is no language tag is refused. How a reason is read and translated is the reading's own
// test.

const ROOM = -13;

// Whether the room may be read is the room reach's own test; here the rooms a reader reads are the event's.
const globals: Record<string, unknown> = globalThis;

globalsRestoredAfter(["requireReadableRoom", "readableRooms"]);
globals.requireReadableRoom = async () => undefined;
globals.readableRooms = async (event: { context: { readableRooms: unknown } }) => event.context.readableRooms;

const gate = standIn("GATE", (one) => {
  if (one.path === "/translations") return answer({ readings: [{ text: "ko:a reason", whole: true }] });

  return answer({ items: [{ id: 7, roomId: ROOM, messageId: null, gateName: "skipped", verdict: "SKIP", detail: "a reason", createdAt: 1_790_000_000_000, ms: null, round: null }], more: false });
});

const reasons = await routeOf<SkipReasonPage>("../../apps/web/server/api/rooms/[chatId]/skip-reasons.get");
const latest = await routeOf<LatestSkipReason>("../../apps/web/server/api/rooms/[chatId]/skip-reasons/latest.get");

const params = { chatId: String(ROOM) };
const query = { ids: "7", from: "1790000000", to: "1790000000", language: "ko" };

describe("a room's silent turn reasons", () => {
  test("are the administrator's", async () => {
    expect((await asked(reasons, { params, query, context: { readableRooms: "all" } })).answer).toEqual({ reasons: { "7": { kind: "named", text: "ko:a reason" } } });
    expect((await asked(latest, { params, query: { language: "ko" }, context: { readableRooms: "all" } })).answer).toEqual({ latest: { id: 7, reason: { kind: "named", text: "ko:a reason" } } });
  });

  test("are none for a member who reads the room, and the gate is not asked", async () => {
    gate.asked.length = 0;

    const member = { readableRooms: new Set([ROOM]) };

    expect((await asked(reasons, { params, query, context: member })).answer).toEqual({ reasons: {} });
    expect((await asked(latest, { params, query: { language: "ko" }, context: member })).answer).toEqual({ latest: null });
    expect(gate.asked).toEqual([]);
  });

  test("are refused for a language that is no language tag, or verdicts named by no numbers", async () => {
    const admin = { readableRooms: "all" as const };

    expect((await asked(reasons, { params, query: { ...query, language: "ko;drop" }, context: admin })).status).toBe(400);
    expect((await asked(latest, { params, query: {}, context: admin })).status).toBe(400);
    expect((await asked(reasons, { params, query: { ...query, ids: "" }, context: admin })).status).toBe(400);
  });
});
