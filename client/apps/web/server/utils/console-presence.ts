import { receiverRoute } from "./receiver";
import { presenceSwitches } from "./presence-switches";
import { roomWatchers } from "./watching";

import type { AccountTabs } from "./watching";

// Each account's presence in the console, read off its tabs' reports and told to the receiver as it changes (docs/web.md,
// 「Presence and typing」): online while a tab of it is visible, away while its tabs are open and none is, offline
// once none reports, with the last moment a visible tab of it reported. An account that turned its presence off has
// the console's word taken back once and is told nothing more while it stays off.

export type ConsoleState = "online" | "away" | "offline";

/** What the console tells the receiver of one account: its state, null where the console's word is taken back. */
export interface ConsoleWord {
  state: ConsoleState | null;
  lastSeenAt: number | null;
}

const TAKEN_BACK: ConsoleWord = { state: null, lastSeenAt: null };

// A word the receiver did not take, which differs from every word so the next step tells it again.
const UNTAKEN = "untaken";

function stateOf(tabs: AccountTabs | undefined): ConsoleState {
  if (tabs === undefined) return "offline";

  return tabs.visible ? "online" : "away";
}

// A word that tells nothing new: the same state, and for an account still online no moment either, since the
// moment moves with every report while it is.
function sameWord(told: ConsoleWord, word: ConsoleWord): boolean {
  return told.state === word.state && (word.state === "online" || told.lastSeenAt === word.lastSeenAt);
}

/** What the console last told of each account, and what it has to tell now. */
export class ConsolePresence {
  private readonly told = new Map<number, ConsoleWord | typeof UNTAKEN>();

  /**
   * The words to tell now, each recorded as told: for every account with a tab reporting and every account told of
   * before, its word where it differs from the last one told. Nothing is told until the switches are read, since
   * until then nobody knows whose presence may be told. An account going offline is told only on a `settled` look,
   * the one made every report interval, so a tab reloading, which says it is gone and reports again at once, never
   * shows its account leaving.
   */
  changes(tabs: ReadonlyMap<number, AccountTabs>, lastSeen: (account: number) => number | null, hidden: ReadonlySet<number> | null, settled = true): [number, ConsoleWord][] {
    if (hidden === null) return [];

    const changes: [number, ConsoleWord][] = [];

    for (const account of new Set([...this.told.keys(), ...tabs.keys()])) {
      const told = this.told.get(account);

      if (hidden.has(account)) {
        if (told !== undefined) changes.push([account, TAKEN_BACK]);

        this.told.delete(account);
        continue;
      }

      const word: ConsoleWord = { state: stateOf(tabs.get(account)), lastSeenAt: lastSeen(account) };

      if (word.state === "offline" && !settled) continue;

      if (told === undefined || told === UNTAKEN || !sameWord(told, word)) {
        changes.push([account, word]);
        this.told.set(account, word);
      }
    }

    return changes;
  }

  /** A word the receiver did not take, told again at the next step. */
  untaken(account: number): void {
    if (this.told.has(account)) this.told.set(account, UNTAKEN);
  }

  /** Whether anything has been told of the account since this server started. */
  hasTold(account: number): boolean {
    return this.told.has(account);
  }
}

/** The one record this server keeps. */
export const consolePresence = new ConsolePresence();

// Each account's words go one after another, so a later word never lands before an earlier one.
const queues = new Map<number, Promise<void>>();

function tell(account: number, word: ConsoleWord): Promise<void> {
  const told = (queues.get(account) ?? Promise.resolve())
    .then(() => receiverRoute(`/accounts/${account}/presence`, { method: "PUT", body: word }))
    .then(
      () => undefined,
      (error: unknown) => {
        consolePresence.untaken(account);
        console.warn(`account ${account}: its presence was not told to the receiver: ${String(error)}`);
      }
    );

  queues.set(account, told);
  void told.then(() => {
    if (queues.get(account) === told) queues.delete(account);
  });

  return told;
}

/** Every account's presence that changed, told to the receiver, an account gone offline only on a `settled` look;
 * nothing waits on the telling. */
export function tellPresenceChanges(now: number = Date.now(), settled = false): void {
  const changes = consolePresence.changes(roomWatchers.accountTabs(now), (account) => roomWatchers.lastSeen(account), presenceSwitches.hidden(), settled);

  for (const [account, word] of changes) void tell(account, word);
}

/** The console's word taken back for each account nothing has been told of since this server started, so no account
 * stands as it was before a restart. */
export async function takeBackUntold(accounts: readonly number[]): Promise<void> {
  for (const account of accounts) {
    if (!consolePresence.hasTold(account)) await tell(account, TAKEN_BACK);
  }
}
