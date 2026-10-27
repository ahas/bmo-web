import { describe, expect, test } from "bun:test";

import { RoomWatchers } from "../../../apps/web/server/utils/watching";

// The rooms a visible console tab shows now (docs/web.md, 「Notifications」): the set the account service keeps
// for the receiver's restart, sorted and without a repeat, and gone once no report has come for its stale while.

describe("the rooms a console has open", () => {
  test("visible tabs alone name them, sorted and once each", () => {
    const watchers = new RoomWatchers(90_000);

    watchers.report({ tab: "one", user: "owner", chatId: 2, visible: true }, 1_000);
    watchers.report({ tab: "two", user: "owner", chatId: 1, visible: true }, 1_000);
    watchers.report({ tab: "three", user: "owner", chatId: 2, visible: false }, 1_000);

    expect(watchers.visibleRooms(1_000)).toEqual([1, 2]);
  });

  test("a tab gone and a report gone stale are not open", () => {
    const watchers = new RoomWatchers(90_000);

    watchers.report({ tab: "one", user: "owner", chatId: 2, visible: true }, 1_000);
    watchers.report({ tab: "one", user: "owner", chatId: null, visible: false }, 1_001);

    expect(watchers.visibleRooms(1_001)).toEqual([]);
    expect(watchers.visibleRooms(200_000)).toEqual([]);
  });
});
