import { describe, expect, test } from "bun:test";

import { createError } from "h3";

import { backgroundCall } from "../../../apps/web/server/utils/pocket";
import { asked, routeOf } from "../../support/nitro";
import { answer, standIn } from "../../support/units";

import type { BackgroundView } from "../../../apps/web/shared/types";

// What waits for a room (docs/web.md, the room screen's list of what waits): the tool host's running asynchronous calls whose wake is for the
// room, read on its console face as the administrator, each a watch, a reminder or another call.

const globals: Record<string, unknown> = globalThis;

const KEPT = [
  { id: "late", tool: "bmo/wait", room: -7, agent: "agent-a", startedAt: 3000, state: "running", arguments: { note: "the fetch ended", check: "test -e /done", every: 900 } },
  { id: "early", tool: "bmo/wait", room: -7, agent: "agent-a", startedAt: 1000, state: "running", arguments: { note: "look again", seconds: 60 } },
  { id: "other-room", tool: "bmo/wait", room: -8, agent: "agent-a", startedAt: 2000, state: "running", arguments: { note: "not here", seconds: 5 } },
  { id: "plain", tool: "notes/keep", room: -7, agent: null, startedAt: 2000, state: "running", arguments: {} },
  { id: "roomless", tool: "bmo/wait", room: null, agent: null, startedAt: 4000, state: "running", arguments: { note: "the owner's", check: "true" } }
];

const receiver = standIn("RECEIVER", (one) => (one.path === "/owner" ? answer({ room: -5, senderId: 5 }) : answer({ code: "not-found", error: "no route" }, 404)));

let reachable = true;

const pocket = standIn(
  "POCKET",
  (one) => {
    if (!reachable) return answer({ code: "failed", error: "down" }, 500);

    return one.path.startsWith("/uses") ? answer({ items: KEPT }) : answer({ code: "not-found", error: "no route" }, 404);
  },
  { headers: true }
);

const read = await routeOf<BackgroundView>("../../apps/web/server/api/rooms/[chatId]/background.get");

describe("what waits for a room", () => {
  test("lists the room's running calls oldest first, each as a watch, a reminder or its tool", async () => {
    pocket.asked.length = 0;

    const calls = (await asked(read, { params: { chatId: "-7" } })).answer?.calls ?? [];

    expect(calls.map((call) => [call.id, call.kind])).toEqual([["early", "reminder"], ["plain", "call"], ["late", "watch"]]);
    expect(calls[0]?.until).toBe(61_000);
    expect(calls[2]?.everySeconds).toBe(900);
    expect(calls[2]?.note).toBe("the fetch ended");
    expect(pocket.asked[0]?.path).toBe("/uses?state=running");
    expect(pocket.asked[0]?.headers?.["owner-role"]).toBe("administrator");
  });

  test("reads a reminder by its moment, and a watch with no every as checking each minute", () => {
    expect(backgroundCall({ id: "a", tool: "bmo/wait", room: -7, startedAt: 0, arguments: { until: "2026-11-15T12:00:00Z" } }, -7, null)?.until).toBe(Date.parse("2026-11-15T12:00:00Z"));
    expect(backgroundCall({ id: "b", tool: "bmo/wait", room: -7, startedAt: 0, arguments: { check: "true" } }, -7, null)?.everySeconds).toBe(60);
    expect(backgroundCall({ id: "c", tool: "bmo/wait", room: -8, startedAt: 0, arguments: {} }, -7, null)).toBeNull();
  });

  test("stands a call naming no room in the owner's private chat alone", async () => {
    expect((await asked(read, { params: { chatId: "-5" } })).answer?.calls.map((call) => call.id)).toEqual(["roomless"]);
    expect((await asked(read, { params: { chatId: "-7" } })).answer?.calls.map((call) => call.id)).not.toContain("roomless");
    expect(receiver.asked.some((one) => one.path === "/owner")).toBe(true);
  });

  test("answers none where the tool host cannot be read", async () => {
    reachable = false;

    try {
      expect((await asked(read, { params: { chatId: "-7" } })).answer).toEqual({ calls: [] });
    } finally {
      reachable = true;
    }
  });

  test("is the administrator's alone", async () => {
    const administrator = globals.requireAdministrator;

    globals.requireAdministrator = async () => {
      throw createError({ statusCode: 403, statusMessage: "Forbidden" });
    };

    try {
      pocket.asked.length = 0;

      expect((await asked(read, { params: { chatId: "-7" } })).status).toBe(403);
      expect(pocket.asked).toEqual([]);
    } finally {
      globals.requireAdministrator = administrator;
    }
  });
});
