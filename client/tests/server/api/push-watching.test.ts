import { describe, expect, test } from "bun:test";

import { asked, routeOf } from "../../support/nitro";
import { globalsRestoredAfter } from "../../support/globals";
import { answer, standIn } from "../../support/units";

// An open tab saying which room it shows (docs/web.md, 「Notifications」 and 「Access」): a room the account reads is
// written down against it, and the rooms open are reported to the account service; a room it does not read is refused
// as if it did not stand, so nobody's looking moves another's count for a room they cannot read.

const READ = -7;
const UNREAD = -8;

const accounts = standIn("WEB_SERVER", (one) => (one.path === "/watching" ? new Response(null, { status: 204 }) : answer({ code: "failed", error: "Not served here." }, 500)));

const { roomWatchers } = await import("../../../apps/web/server/utils/watching");
const globals: Record<string, unknown> = globalThis;
const session = { user: { name: "member-a", id: 7 }, sid: "bmo.sid=member", administrator: false };

globalsRestoredAfter(["requireUserSession", "roomWatchers"]);
globals.requireUserSession = async () => session;
globals.roomWatchers = roomWatchers;

const watching = await routeOf<{ ok: true }>("../../apps/web/server/api/push/watching.post");

// What the tab's report changed on the account service; the reads that ask who the login is change nothing.
const reported = () => accounts.asked.filter((one) => one.method !== "GET");

// The member reads the one room, as their room list holds it before the route runs.
const report = async (chatId: number | null) =>
  await asked(watching, { body: { tab: "tab-a", chatId, visible: true }, context: { readableRooms: new Set([READ]) } });

describe("a tab's report of the room it shows", () => {
  test("is written down for a room the account reads, and the rooms open are reported", async () => {
    accounts.asked.length = 0;

    expect((await report(READ)).answer).toEqual({ ok: true });
    expect(roomWatchers.seeing(READ, Date.now())).toEqual(new Set(["member-a"]));
    expect(reported().map((one) => [one.method, one.path, one.body])).toEqual([["PUT", "/watching", { rooms: [READ] }]]);
  });

  test("is refused as absent for a room the account does not read, and moves nothing", async () => {
    accounts.asked.length = 0;

    expect((await report(UNREAD)).status).toBe(404);
    expect(roomWatchers.seeing(UNREAD, Date.now())).toEqual(new Set());
    expect(roomWatchers.lastLooked(UNREAD, Date.now())).toBeNull();
    expect(reported()).toEqual([]);
    // The tab's earlier report stands as it was.
    expect(roomWatchers.seeing(READ, Date.now())).toEqual(new Set(["member-a"]));
  });

  test("of no room at all asks nothing of the rooms", async () => {
    expect((await report(null)).answer).toEqual({ ok: true });
  });
});
