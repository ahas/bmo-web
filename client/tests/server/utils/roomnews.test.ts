import { describe, expect, test } from "bun:test";

import { firstLine, ROOM_GATHER_MS, ROOM_QUIET_MS, RoomRinger, roomPush } from "../../../apps/web/server/utils/roomnews";
import { RoomWatchers } from "../../../apps/web/server/utils/watching";

import type { RoomLine } from "../../../apps/web/server/utils/roomnews";
import type { PushPayload } from "../../../apps/web/shared/types";
import { wording } from "../../../apps/web/shared/wording";
import { ROOM_ID as ROOM } from "../../support/ids";
import KO from "../../fixtures/server/utils/roomnews.test.ko.json";

// What an agent saying something in a room rings (docs/web.md, 「Notifications」): one notification a
// room, gathered, counted since they last looked, and none to an account looking at that room.

interface Bench {
  ringer: RoomRinger;
  watchers: RoomWatchers;
  sent: { payload: PushPayload; looking: string[] }[];
  // Moves the clock and runs every wait that has come due.
  pass: (ms: number) => Promise<void>;
  rows: Map<string, RoomLine>;
  now: () => number;
}

function bench(): Bench {
  let clock = 1_000_000;
  const waits: { at: number; run: () => void }[] = [];
  const sent: Bench["sent"] = [];
  const rows = new Map<string, RoomLine>();
  const watchers = new RoomWatchers(90_000);
  const ringer = new RoomRinger({
    base: "/console/",
    read: async (chatId, messageId) => rows.get(`${chatId}:${messageId}`) ?? null,
    title: async () => "Alpha Room",
    lookingAt: (chatId) => watchers.lookingAt(chatId, clock),
    seeing: (chatId) => watchers.seeing(chatId, clock),
    lastLooked: (chatId) => watchers.lastLooked(chatId, clock),
    ring: async (payload, looking) => {
      sent.push({ payload, looking: [...looking] });
    },
    now: () => clock,
    later: (run, ms) => {
      const wait = { at: clock + ms, run };

      waits.push(wait);

      return () => waits.splice(waits.indexOf(wait), 1);
    },
    failed: (error) => {
      throw error;
    }
  });

  return {
    ringer,
    watchers,
    sent,
    rows,
    now: () => clock,
    pass: async (ms) => {
      clock += ms;

      for (const wait of waits.filter((one) => one.at <= clock)) {
        waits.splice(waits.indexOf(wait), 1);
        wait.run();
      }

      await Promise.resolve();
    }
  };
}

async function said(at: Bench, messageId: number, line: string, sender = "agent-a"): Promise<void> {
  at.rows.set(`${ROOM}:${messageId}`, { sender, line });
  await at.ringer.heard(ROOM, String(messageId), at.now());
}

describe("a room's notification", () => {
  test("names the room, then who said it and the first line, and opens the room", () => {
    const push = roomPush({ base: "/bmo/", chatId: ROOM, room: "Alpha Room", latest: { sender: "Alice", line: "I'm back" }, count: 1 });

    expect(push).toEqual({ kind: "room", title: "Alpha Room", body: wording("push.message.room_line", { sender: "Alice", line: "I'm back" }), url: `/bmo/rooms/${ROOM}`, tag: `room:${ROOM}` });
  });

  test("the room it opens stands under the base path the ringer is configured with", async () => {
    const at = bench();

    await said(at, 1, "one");
    await at.pass(ROOM_GATHER_MS);

    expect(at.sent.map((one) => one.payload.url)).toEqual([`/console/rooms/${ROOM}`]);
  });

  test("the first line with words in it is the line, and a voice message has none", () => {
    expect(firstLine("\n  first line\nsecond line")).toBe("first line");
    expect(firstLine(KO.line_84)).toBeNull();
    expect(firstLine("  \n ")).toBeNull();
  });
});

describe("ringing a room", () => {
  test("an answer filed in parts rings once, carrying its last part and the count", async () => {
    const at = bench();

    await said(at, 1, "first part");
    await said(at, 2, "second part");
    // The same message named again by the stream's other word is not a second one.
    await at.ringer.heard(ROOM, "2", at.now());
    await at.pass(ROOM_GATHER_MS);

    expect(at.sent.map((one) => [one.payload.title, one.payload.body])).toEqual([[wording("push.title.room_bundled", { room: "Alpha Room", n: 2 }), wording("push.message.room_line", { sender: "agent-a", line: "second part" })]]);
  });

  test("what is not an agent's line, and what was said before listening began, rings nothing", async () => {
    const at = bench();

    await at.ringer.heard(ROOM, "9", at.now());
    at.rows.set(`${ROOM}:8`, { sender: "agent-a", line: "an old line" });
    await at.ringer.heard(ROOM, "8", at.now() - 1);
    await at.pass(ROOM_GATHER_MS);

    expect(at.sent).toHaveLength(0);
  });

  test("the count runs on until they look at the room, and starts again after", async () => {
    const at = bench();

    await said(at, 1, "one");
    await at.pass(ROOM_GATHER_MS);
    await said(at, 2, "two");
    await at.pass(ROOM_GATHER_MS);

    expect(at.sent.at(-1)?.payload.title).toBe(wording("push.title.room_bundled", { room: "Alpha Room", n: 2 }));

    at.watchers.report({ tab: "desk", user: "alice", chatId: ROOM, visible: true }, at.now());
    at.watchers.report({ tab: "desk", user: "alice", chatId: null, visible: true }, at.now() + 1);
    await at.pass(10);
    await said(at, 3, "three");
    await at.pass(ROOM_GATHER_MS);

    expect(at.sent.at(-1)?.payload.title).toBe("Alpha Room");
  });

  test("an hour of quiet starts the count again", async () => {
    const at = bench();

    await said(at, 1, "one");
    await at.pass(ROOM_GATHER_MS);
    await at.pass(ROOM_QUIET_MS + 1);
    await said(at, 2, "two");
    await at.pass(ROOM_GATHER_MS);

    expect(at.sent.at(-1)?.payload.title).toBe("Alpha Room");
  });

  test("an account with a visible tab on the room is passed over, and one hidden or elsewhere is not", async () => {
    const at = bench();

    at.watchers.report({ tab: "desk", user: "alice", chatId: ROOM, visible: true }, at.now());
    at.watchers.report({ tab: "phone", user: "guest", chatId: ROOM, visible: false }, at.now());
    at.watchers.report({ tab: "laptop", user: "qa-admin", chatId: -1009, visible: true }, at.now());
    await said(at, 1, "one");
    await at.pass(ROOM_GATHER_MS);

    expect(at.sent.map((one) => one.looking)).toEqual([["alice"]]);
  });
});

describe("the tabs' reports", () => {
  test("a tab silent past its time, or gone, no longer looks at the room", () => {
    const watchers = new RoomWatchers(90_000);

    watchers.report({ tab: "desk", user: "alice", chatId: ROOM, visible: true }, 0);
    watchers.report({ tab: "phone", user: "guest", chatId: ROOM, visible: true }, 0);

    expect([...watchers.lookingAt(ROOM, 90_000)].sort()).toEqual(["alice", "guest"]);

    watchers.report({ tab: "phone", user: "guest", chatId: null, visible: false }, 10);

    expect([...watchers.lookingAt(ROOM, 90_000)]).toEqual(["alice"]);
    expect([...watchers.lookingAt(ROOM, 90_001)]).toEqual([]);
    // It was looked at, and when is kept after the tab is gone.
    expect(watchers.lastLooked(ROOM, 90_001)).toBe(0);
  });
});

describe("an unseen look, the administrator's at a room not his own", () => {
  test("keeps his own devices quiet and nothing more: nobody else's count starts afresh, and no report of rooms open names it", async () => {
    const at = bench();

    at.watchers.report({ tab: "admin", user: "boss", chatId: ROOM, visible: true, unseen: true }, at.now());

    expect([...at.watchers.lookingAt(ROOM, at.now())]).toEqual(["boss"]);
    expect([...at.watchers.seeing(ROOM, at.now())]).toEqual([]);
    expect(at.watchers.lastLooked(ROOM, at.now())).toBeNull();
    expect(at.watchers.visibleRooms(at.now())).toEqual([]);

    await said(at, 1, "one");
    await at.pass(ROOM_GATHER_MS);
    await said(at, 2, "two");
    await at.pass(ROOM_GATHER_MS);

    // His devices are spared, and the count runs on for everyone else as though nobody had looked.
    expect(at.sent.map((one) => one.looking)).toEqual([["boss"], ["boss"]]);
    expect(at.sent.map((one) => one.payload.title)).toEqual(["Alpha Room", wording("push.title.room_bundled", { room: "Alpha Room", n: 2 })]);
  });
});
