import { describe, expect, test } from "bun:test";

import { accountUsages, accountWindows, activeUsage, headlineOf, usageView, workerContexts, workerUsages } from "../../../apps/web/server/utils/usage";

// An entry of the agency's account list, as the mapping takes it.
type Account = Parameters<typeof accountUsages>[1][number];

// The usage view out of the agency's answers: the slot the chat runs on and the accounts' names from its fallback
// answer, each account's own window from its account list, and each worker's week from its usage. What an answer
// does not state stands absent, never as a nought and never as another slot's figure.

function account(id: string, window: unknown = null): Account {
  return {
    id,
    provider: "claude-code",
    userName: null,
    held: true,
    home: `/logins/${id}`,
    window,
    session: null,
    week: null,
    balance: null,
    restUntil: null,
    credentialKind: "directory",
    endpointUrl: null,
    keyFile: null,
    models: null,
    basePrompt: null
  };
}

const session = { name: "five_hour", account: "a", mode: "claude-code", utilization: 0.3, resetsAt: 1_800_000_000, seenAt: 1, durationMinutes: 300, limitName: null };
const week = { ...session, name: "seven_day", utilization: 0.6, durationMinutes: 10_080 };

function fallback(active: unknown): unknown {
  return {
    routes: [
      { name: "provider-x", enabled: true, label: "Provider X", reason: null },
      { name: "claude-code", enabled: true, label: "Claude Code", reason: null }
    ],
    answering: true,
    active,
    accounts: [
      { id: "a", name: "Account A", place: 1 },
      { id: "b", name: "Account B", place: 2 }
    ]
  };
}

const onClaude = { provider: "claude-code", account: "a", accountName: "Account A", accounts: 2, session, week };
const onOther = { provider: "provider-x", account: null, accountName: "Provider X", accounts: 0, session: null, week: null };

describe("the slot the chat runs on", () => {
  test("is the fallback answer's, its provider under the roads' label and its login named", () => {
    expect(activeUsage(fallback(onClaude))).toEqual({
      provider: "claude-code",
      label: "Claude Code",
      account: "a",
      accountName: "Account A",
      logins: 2,
      session: { name: "five_hour", utilization: 0.3, resetsAt: 1_800_000_000, durationMinutes: 300, limitName: null },
      week: { name: "seven_day", utilization: 0.6, resetsAt: 1_800_000_000, durationMinutes: 10_080, limitName: null }
    });
  });

  test("on a provider with no login it names no login and states no window", () => {
    expect(activeUsage(fallback(onOther))).toMatchObject({ provider: "provider-x", label: "Provider X", account: null, accountName: null, logins: 0, session: null, week: null });
  });

  test("is none where the answer names none, or names it in no shape it can be read in", () => {
    expect(activeUsage({ routes: [], answering: false })).toBeNull();
    expect(activeUsage(fallback(null))).toBeNull();
    expect(activeUsage(fallback({ provider: 7 }))).toBeNull();
    expect(activeUsage(null)).toBeNull();
  });

  test("a window in no shape it can be read in is none, not a nought", () => {
    expect(headlineOf({ name: "five_hour" })).toBeNull();
    expect(headlineOf({ utilization: 0.2 })).toBeNull();
    expect(headlineOf("five_hour")).toBeNull();
  });
});

describe("each account's windows", () => {
  test("are read from the session and weekly share its entry records", () => {
    expect(accountWindows({ utilization: 0.25, resetsAt: 1_800_000_000.5, weeklyUtilization: 0.5, weeklyResetsAt: null })).toEqual([
      { name: "five_hour", utilization: 0.25, resetsAt: 1_800_000_000, durationMinutes: 300, limitName: null },
      { name: "seven_day", utilization: 0.5, resetsAt: null, durationMinutes: 10_080, limitName: null }
    ]);
  });

  test("a week not read stands as none beside the session", () => {
    expect(accountWindows({ utilization: 0.25, resetsAt: 1_800_000_000 })[1]).toBeNull();
  });

  test("an entry with no window states none", () => {
    expect(accountWindows(null)).toEqual([null, null]);
    expect(accountWindows({})).toEqual([null, null]);
  });

  test("stand in the agency's order under their names, the one the chat runs on marked and holding the slot's windows", () => {
    const active = activeUsage(fallback(onClaude));
    const accounts = accountUsages(fallback(onClaude), [account("a"), account("b")], active);

    expect(accounts.map((one) => [one.id, one.name, one.label, one.inUse, one.session?.utilization ?? null, one.week?.utilization ?? null])).toEqual([
      ["a", "Account A", "Claude Code", true, 0.3, 0.6],
      ["b", "Account B", "Claude Code", false, null, null]
    ]);
  });

  test("an account's own window is its own, and never the slot's for another account", () => {
    const active = activeUsage(fallback(onClaude));
    const accounts = accountUsages(fallback(onClaude), [account("a", { utilization: 0.1, resetsAt: 1_800_000_000 }), account("b", { utilization: 0.9, resetsAt: 1_800_000_000 })], active);

    expect(accounts.map((one) => one.session?.utilization)).toEqual([0.1, 0.9]);
    expect(accounts.map((one) => one.week?.utilization ?? null)).toEqual([0.6, null]);
  });

  test("none is marked while the chat runs on a provider with no login, and none borrows a figure", () => {
    const active = activeUsage(fallback(onOther));
    const accounts = accountUsages(fallback(onOther), [account("a"), account("b")], active);

    expect(accounts.map((one) => [one.inUse, one.session, one.week])).toEqual([
      [false, null, null],
      [false, null, null]
    ]);
  });

  test("an account the fallback does not name stands under its id", () => {
    expect(accountUsages({ routes: [] }, [account("c")], null)[0]).toMatchObject({ id: "c", name: "c", label: "claude-code", inUse: false });
  });
});

describe("each worker's week", () => {
  const usage = {
    groups: [
      { key: "agent-a", tokens: 120_000, jobs: 3, firstAt: 1, lastAt: 2, contextTokens: 40_000 },
      { key: "agent-b", tokens: 0, jobs: 14, firstAt: 1, lastAt: 2, contextTokens: null },
      { tokens: 5 }
    ],
    after: 0,
    before: 1
  };

  test("is the tokens its jobs carry, whole and not split, where they carry any", () => {
    expect(workerUsages(usage)).toEqual([
      {
        agent: "agent-a",
        tokens: 120_000,
        runs: 3,
        inputTokens: null,
        outputTokens: null,
        cacheReadTokens: null,
        cacheWriteTokens: null,
        unsplitRuns: 3,
        unsplitTokens: 120_000
      }
    ]);
  });

  test("and what its sessions carry, where the agency counts it", () => {
    expect(workerContexts(usage)).toEqual([{ agent: "agent-a", contextTokens: 40_000 }]);
  });
});

describe("the whole view", () => {
  test("with nothing answered is empty, and says nothing of any figure", () => {
    expect(usageView({ routes: [], answering: false }, [], { groups: [], after: 0, before: 1 })).toEqual({ active: null, accounts: [], agents: [], contexts: [] });
  });
});
