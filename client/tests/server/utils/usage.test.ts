import { describe, expect, test } from "bun:test";

import { accountUsages, accountWindows, activeUsage, headlineOf, roadUsages, usageView, workerContexts, workerUsages } from "../../../apps/web/server/utils/usage";

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
      week: { name: "seven_day", utilization: 0.6, resetsAt: 1_800_000_000, durationMinutes: 10_080, limitName: null },
      balance: null
    });
  });

  test("on a provider with no login it names no login and states no window", () => {
    expect(activeUsage(fallback(onOther))).toMatchObject({ provider: "provider-x", label: "Provider X", account: null, accountName: null, logins: 0, session: null, week: null });
  });

  test("on a provider paid by the request it carries the balance the agency read, and none it cannot read", () => {
    const paid = { ...onOther, balance: { amount: 25.6, currency: "USD", seenAt: 1_800_000_000 } };

    expect(activeUsage(fallback(paid))?.balance).toEqual({ amount: 25.6, currency: "USD", seenAt: 1_800_000_000, requests: null });
    expect(activeUsage(fallback({ ...onOther, balance: { amount: "lots" } }))?.balance).toBeNull();
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

  test("an account the owner switched off is left out, and so is every account of a provider switched off", () => {
    const answer = { routes: [], accounts: [{ id: "a", name: "Account A", enabled: true }, { id: "b", name: "Account B", enabled: false }, { id: "c", name: "Account C" }] };

    expect(accountUsages(answer, [account("a"), account("b"), account("c")], null).map((one) => one.id)).toEqual(["a", "c"]);
    expect(accountUsages(answer, [account("a"), account("b"), account("c")], null, new Set(["claude-code"]))).toEqual([]);
    expect(accountUsages(answer, [account("a")], null, new Set(["provider-x"])).map((one) => one.id)).toEqual(["a"]);
    expect(usageView(answer, [account("a"), account("b")], { groups: [], after: 0, before: 1 }, null, new Set()).accounts.map((one) => one.id)).toEqual(["a"]);
  });

  test("an account the fallback does not name stands under its id", () => {
    expect(accountUsages({ routes: [] }, [account("c")], null)[0]).toMatchObject({ id: "c", name: "c", label: "claude-code", inUse: false });
  });
});

describe("each worker's week", () => {
  const unsplit = (tokens: number, jobs: number) => ({
    tokens, jobs, inputTokens: null, outputTokens: null, cacheReadTokens: null, cacheWriteTokens: null, unsplitJobs: jobs, unsplitTokens: tokens
  });
  const usage = {
    groups: [
      { key: "agent-a", ...unsplit(120_000, 3), firstAt: 1, lastAt: 2, contextTokens: 40_000 },
      { key: "agent-b", ...unsplit(0, 14), firstAt: 1, lastAt: 2, contextTokens: null },
      { key: "", ...unsplit(5, 1), firstAt: 1, lastAt: 2, contextTokens: null }
    ],
    after: 0,
    before: 1
  };

  test("is the tokens its jobs carry where they carry any, wholly not split where the agency names no kinds", () => {
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

describe("a provider's own road", () => {
  const road = (over: Record<string, unknown> = {}) => ({
    name: "provider-y",
    label: "Provider Y",
    enabled: true,
    quota: { has: true, balance: 9.55, currency: "USD", balanceSeenAt: 1_800_000_000, requests: { used: 12, limit: 1000, left: 988, scope: "free-models" } },
    ...over
  });

  test("that is switched on and keeps a balance stands with it and the request allowance read beside it", () => {
    expect(roadUsages([road()], null)).toEqual([
      { provider: "provider-y", label: "Provider Y", balance: { amount: 9.55, currency: "USD", seenAt: 1_800_000_000, requests: { used: 12, limit: 1000, left: 988, scope: "free-models" } } }
    ]);
    expect(roadUsages([road({ quota: { has: true, balance: 3, currency: "USD", balanceSeenAt: 5 } })], null)[0]?.balance.requests).toBeNull();
    expect(roadUsages([road({ quota: { has: true, balance: 3, currency: "USD", balanceSeenAt: 5, requests: { used: 1, limit: 2 } } })], null)[0]?.balance.requests).toBeNull();
  });

  test("is left out where it is switched off, keeps no balance, or is the slot the chat runs on", () => {
    const active = { provider: "provider-y", label: "Provider Y", account: null, accountName: null, logins: 0, session: null, week: null, balance: null };

    expect(roadUsages([road({ enabled: false })], null)).toEqual([]);
    expect(roadUsages([road({ quota: { has: true, balance: null } })], null)).toEqual([]);
    expect(roadUsages([road({ quota: { has: true, balance: 3 } })], null)).toEqual([]);
    expect(roadUsages([road()], active)).toEqual([]);
    expect(roadUsages([null, "provider-y", {}], null)).toEqual([]);
  });
});

describe("the whole view", () => {
  test("with nothing answered is empty, and says nothing of any figure", () => {
    expect(usageView({ routes: [], answering: false }, [], { groups: [], after: 0, before: 1 })).toEqual({ active: null, roads: [], accounts: [], agents: [], contexts: [] });
  });
});
