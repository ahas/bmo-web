import type { components } from "@agency/client/schema";
import type { AccountUsage, ActiveUsage, AgentContext, AgentTokenUsage, HeadlineWindow, UsageBalance, UsageView } from "#shared/types";

type Schemas = components["schemas"];

// The usage view out of the agency's answers (docs/web.md, 「Usage in the title bar」; docs/boundary.md, 「Gaps the
// console meets」): the slot the chat runs on and the accounts' names from its fallback answer, each account's own
// window from its account list, and each worker's week from its usage. What an answer does not state stands as
// absent, never as a nought and never as another slot's figure.

const SESSION_MINUTES = 5 * 60;
const WEEK_MINUTES = 7 * 24 * 60;

type Held = Record<string, unknown>;

function held(value: unknown): Held | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Held) : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** One window as the agency's headline pick states it, or none where the value is not one. */
export function headlineOf(value: unknown): HeadlineWindow | null {
  const window = held(value);
  const name = text(window?.name);
  const utilization = count(window?.utilization);

  if (window === null || name === null || utilization === null) return null;

  return {
    name,
    utilization,
    resetsAt: count(window.resetsAt),
    durationMinutes: count(window.durationMinutes),
    limitName: text(window.limitName)
  };
}

/** A balance as the agency answers it, or none where it states no amount and currency. */
export function balanceOf(value: unknown): UsageBalance | null {
  const balance = held(value);
  const amount = typeof balance?.amount === "number" && Number.isFinite(balance.amount) ? balance.amount : null;
  const currency = text(balance?.currency);
  const seenAt = count(balance?.seenAt);

  return amount === null || currency === null || seenAt === null ? null : { amount, currency, seenAt };
}

function windowAt(name: string, minutes: number, utilization: number | null, resetsAt: number | null): HeadlineWindow | null {
  return utilization === null
    ? null
    : { name, utilization, resetsAt: resetsAt === null ? null : Math.floor(resetsAt), durationMinutes: minutes, limitName: null };
}

/**
 * An account's session and weekly windows out of the window its list entry carries, in the shape the agency records
 * an account's usage in: the session's share and reset, and the week's beside them where it was read.
 */
export function accountWindows(value: unknown): [HeadlineWindow | null, HeadlineWindow | null] {
  const window = held(value);

  if (window === null) return [null, null];

  return [
    windowAt("five_hour", SESSION_MINUTES, count(window.utilization), count(window.resetsAt)),
    windowAt("seven_day", WEEK_MINUTES, count(window.weeklyUtilization), count(window.weeklyResetsAt))
  ];
}

/** Each provider's label, by its name, as the fallback's roads give it. */
function providerLabels(fallback: Held | null): Map<string, string> {
  const labels = new Map<string, string>();

  for (const road of Array.isArray(fallback?.routes) ? fallback.routes : []) {
    const name = text(held(road)?.name);
    const label = text(held(road)?.label);

    if (name !== null && label !== null) labels.set(name, label);
  }

  return labels;
}

/** Each account's name, by its id, as the fallback names its Claude accounts. */
function accountNames(fallback: Held | null): Map<string, string> {
  const names = new Map<string, string>();

  for (const account of Array.isArray(fallback?.accounts) ? fallback.accounts : []) {
    const id = text(held(account)?.id);
    const name = text(held(account)?.name);

    if (id !== null && name !== null) names.set(id, name);
  }

  return names;
}

/** The slot the chat runs on, as the fallback answer names it, or none where it names none. */
export function activeUsage(answer: unknown): ActiveUsage | null {
  const fallback = held(answer);
  const active = held(fallback?.active);
  const provider = text(active?.provider);

  if (active === null || provider === null) return null;

  const account = text(active.account);

  return {
    provider,
    label: providerLabels(fallback).get(provider) ?? provider,
    account,
    accountName: account === null ? null : (text(active.accountName) ?? accountNames(fallback).get(account) ?? account),
    logins: count(active.accounts) ?? 0,
    session: headlineOf(active.session),
    week: headlineOf(active.week),
    balance: balanceOf(active.balance)
  };
}

/**
 * Every account the agency lists, in its order, each with its own windows. The account the chat runs on takes the
 * slot's windows where its own entry states none, since those are the same login's; no other account takes them.
 */
export function accountUsages(answer: unknown, accounts: readonly Schemas["Account"][], active: ActiveUsage | null): AccountUsage[] {
  const fallback = held(answer);
  const names = accountNames(fallback);
  const labels = providerLabels(fallback);

  return accounts.map((account) => {
    const inUse = active !== null && active.provider === account.provider && active.account === account.id;
    // An account's own windows as the agency answers them, or read off the usage it last reported where it names
    // none of its own.
    const [reported, reportedWeek] = accountWindows(account.window);
    const session = headlineOf((account as { session?: unknown }).session) ?? reported;
    const week = headlineOf((account as { week?: unknown }).week) ?? reportedWeek;

    return {
      id: account.id,
      name: names.get(account.id) ?? account.id,
      provider: account.provider,
      label: labels.get(account.provider) ?? account.provider,
      inUse,
      session: session ?? (inUse ? active.session : null),
      week: week ?? (inUse ? active.week : null),
      balance: balanceOf((account as { balance?: unknown }).balance)
    };
  });
}

interface UsageGroup {
  key: string;
  tokens: number;
  jobs: number;
  contextTokens: number | null;
}

function groupOf(value: unknown): UsageGroup | null {
  const group = held(value);
  const key = text(group?.key);

  return group === null || key === null
    ? null
    : { key, tokens: count(group.tokens) ?? 0, jobs: count(group.jobs) ?? 0, contextTokens: count(group.contextTokens) };
}

/**
 * Each worker's week, where its jobs carry a figure. A worker whose jobs carry no tokens is one the agency recorded
 * none for, and it stands absent rather than as having spent nothing. The agency names no kind, so the whole of each
 * row stands as not split.
 */
export function workerUsages(usage: Schemas["Usage"]): AgentTokenUsage[] {
  return usage.groups.flatMap((value) => {
    const group = groupOf(value);

    return group === null || group.tokens <= 0
      ? []
      : [
          {
            agent: group.key,
            tokens: group.tokens,
            runs: group.jobs,
            inputTokens: null,
            outputTokens: null,
            cacheReadTokens: null,
            cacheWriteTokens: null,
            unsplitRuns: group.jobs,
            unsplitTokens: group.tokens
          }
        ];
  });
}

/** What each worker's sessions carry now, where the agency counts it. */
export function workerContexts(usage: Schemas["Usage"]): AgentContext[] {
  return usage.groups.flatMap((value) => {
    const group = groupOf(value);

    return group === null || group.contextTokens === null ? [] : [{ agent: group.key, contextTokens: group.contextTokens }];
  });
}

/** The whole view out of the three answers. */
export function usageView(fallback: unknown, accounts: readonly Schemas["Account"][], usage: Schemas["Usage"]): UsageView {
  const active = activeUsage(fallback);

  return { active, accounts: accountUsages(fallback, accounts, active), agents: workerUsages(usage), contexts: workerContexts(usage) };
}
