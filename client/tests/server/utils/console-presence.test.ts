import { describe, expect, test } from "bun:test";

import { ConsolePresence } from "../../../apps/web/server/utils/console-presence";
import { RoomWatchers } from "../../../apps/web/server/utils/watching";

// Each account's presence in the console, read off its tabs' reports (docs/web.md, 「Presence and typing」): online
// while a tab of it is visible, away while its tabs are open and none is, offline once none reports, told only as it
// changes, and taken back once for an account that turned its presence off.

const STALE_MS = 90_000;

function stand(): { watchers: RoomWatchers; presence: ConsolePresence; step: (now: number, hidden?: ReadonlySet<number> | null, settled?: boolean) => [number, unknown][] } {
  const watchers = new RoomWatchers(STALE_MS);
  const presence = new ConsolePresence();
  const step = (now: number, hidden: ReadonlySet<number> | null = new Set(), settled = true) =>
    presence.changes(watchers.accountTabs(now), (account) => watchers.lastSeen(account), hidden, settled);

  return { watchers, presence, step };
}

describe("an account's presence in the console", () => {
  test("a tab reloading never shows its account leaving between its gone word and its next report", () => {
    const { watchers, step } = stand();

    watchers.report({ tab: "one", user: "agent-a", account: 4, chatId: 2, visible: true }, 1_000);
    step(1_000);
    watchers.report({ tab: "one", user: "agent-a", account: 4, chatId: null, visible: false }, 2_000);
    expect(step(2_000, new Set(), false)).toEqual([]);
    watchers.report({ tab: "two", user: "agent-a", account: 4, chatId: 2, visible: true }, 2_500);
    expect(step(2_500, new Set(), false)).toEqual([]);
  });

  test("goes online, away and offline with its tabs, told once each time it changes", () => {
    const { watchers, step } = stand();

    watchers.report({ tab: "one", user: "agent-a", account: 4, chatId: 2, visible: true }, 1_000);
    expect(step(1_000)).toEqual([[4, { state: "online", lastSeenAt: 1_000 }]]);

    watchers.report({ tab: "one", user: "agent-a", account: 4, chatId: 2, visible: true }, 31_000);
    expect(step(31_000)).toEqual([]);

    watchers.report({ tab: "one", user: "agent-a", account: 4, chatId: 2, visible: false }, 40_000);
    expect(step(40_000)).toEqual([[4, { state: "away", lastSeenAt: 31_000 }]]);

    expect(step(40_000 + STALE_MS + 1, new Set(), false)).toEqual([]);
    expect(step(40_000 + STALE_MS + 1)).toEqual([[4, { state: "offline", lastSeenAt: 31_000 }]]);
    expect(step(40_000 + STALE_MS + 2)).toEqual([]);
  });

  test("one visible tab among hidden ones keeps the account online, and a login with no account tells nothing", () => {
    const { watchers, step } = stand();

    watchers.report({ tab: "one", user: "agent-a", account: 4, chatId: 2, visible: false }, 1_000);
    watchers.report({ tab: "two", user: "agent-a", account: 4, chatId: null, visible: true }, 1_000);
    watchers.report({ tab: "three", user: "console", account: null, chatId: 2, visible: true }, 1_000);

    expect(step(1_000)).toEqual([[4, { state: "online", lastSeenAt: 1_000 }]]);
  });

  test("nothing is told before the switches are read, and a hidden account's word is taken back once", () => {
    const { watchers, step } = stand();

    watchers.report({ tab: "one", user: "agent-a", account: 4, chatId: 2, visible: true }, 1_000);
    expect(step(1_000, null)).toEqual([]);
    expect(step(1_000)).toEqual([[4, { state: "online", lastSeenAt: 1_000 }]]);

    expect(step(2_000, new Set([4]))).toEqual([[4, { state: null, lastSeenAt: null }]]);
    expect(step(3_000, new Set([4]))).toEqual([]);
    expect(step(4_000)).toEqual([[4, { state: "online", lastSeenAt: 1_000 }]]);
  });

  test("a word the receiver did not take is told again at the next step", () => {
    const { watchers, presence, step } = stand();

    watchers.report({ tab: "one", user: "agent-a", account: 4, chatId: 2, visible: true }, 1_000);
    step(1_000);
    presence.untaken(4);

    expect(step(2_000)).toEqual([[4, { state: "online", lastSeenAt: 1_000 }]]);
  });
});
