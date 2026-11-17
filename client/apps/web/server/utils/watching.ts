import { WATCH_STALE_MS } from "#shared/config";

// Which room each open console tab shows, as the tabs themselves report it (docs/web.md,
// 「Notifications」). A room message is not rung to an account while one of its visible tabs shows
// that room, and the count a room's notification carries starts again once somebody has looked.
// It is held in this server's memory alone: a report is good for a minute or two, and a server
// that restarts hears every open tab again within one interval. A tab that looks unseen — the administrator's on a
// room that is not his own (docs/web.md, 「Access」) — keeps its own account's devices quiet and nothing more: nobody
// else's count starts afresh for it, and it is in no report of the rooms open. The same reports are each account's
// presence in the console (docs/web.md, 「Presence and typing」): whether a tab of it is open, whether one is visible,
// and when a visible one last reported.

export interface TabReport {
  // The tab's own name for itself, made when it opened.
  tab: string;
  user: string;
  // The account the login stands for, or none for a console login standing before the account model.
  account?: number | null;
  // The room it shows, or null for any screen that is not a room.
  chatId: number | null;
  visible: boolean;
  // Whether its looking leaves no trace anyone else can see.
  unseen?: boolean;
}

interface Standing {
  user: string;
  account: number | null;
  chatId: number | null;
  visible: boolean;
  unseen: boolean;
  at: number;
}

/** An account's tabs as they stand now: whether one of them is visible. */
export interface AccountTabs {
  visible: boolean;
}

export class RoomWatchers {
  private readonly tabs = new Map<string, Standing>();
  // When a visible tab of each account last reported, kept once its tabs are gone.
  private readonly seen = new Map<number, number>();
  // When a visible tab last showed each room, so the ringer knows a room has been looked at.
  private readonly looked = new Map<number, number>();

  constructor(private readonly staleMs: number = WATCH_STALE_MS) {}

  report(report: TabReport, now: number): void {
    this.forgetStale(now);

    // A tab that has gone away says so with nothing to show, and is dropped rather than kept hidden.
    if (!report.visible && report.chatId === null) {
      this.tabs.delete(report.tab);

      return;
    }

    const unseen = report.unseen === true;
    const account = report.account ?? null;

    this.tabs.set(report.tab, { user: report.user, account, chatId: report.chatId, visible: report.visible, unseen, at: now });

    if (report.visible && account !== null) {
      this.seen.set(account, now);
    }

    if (report.visible && report.chatId !== null && !unseen) {
      this.looked.set(report.chatId, now);
    }
  }

  // The accounts with a visible tab on this room right now, whose own devices it keeps quiet.
  lookingAt(chatId: number, now: number): Set<string> {
    return this.usersOn(chatId, now, true);
  }

  // The accounts with a visible tab on this room right now whose looking counts for everyone, the unseen left out.
  seeing(chatId: number, now: number): Set<string> {
    return this.usersOn(chatId, now, false);
  }

  private usersOn(chatId: number, now: number, unseenToo: boolean): Set<string> {
    const users = new Set<string>();

    for (const standing of this.tabs.values()) {
      if (standing.visible && standing.chatId === chatId && now - standing.at <= this.staleMs && (unseenToo || !standing.unseen)) {
        users.add(standing.user);
      }
    }

    return users;
  }

  // The rooms a visible tab shows right now, sorted, for the receiver's start-up serving.
  visibleRooms(now: number): number[] {
    const rooms = new Set<number>();

    for (const standing of this.tabs.values()) {
      if (standing.visible && standing.chatId !== null && !standing.unseen && now - standing.at <= this.staleMs) {
        rooms.add(standing.chatId);
      }
    }

    return [...rooms].sort((one, other) => one - other);
  }

  // Every account with a tab reporting now, and whether one of its tabs is visible.
  accountTabs(now: number): Map<number, AccountTabs> {
    const accounts = new Map<number, AccountTabs>();

    for (const standing of this.tabs.values()) {
      if (standing.account === null || now - standing.at > this.staleMs) continue;

      accounts.set(standing.account, { visible: (accounts.get(standing.account)?.visible ?? false) || standing.visible });
    }

    return accounts;
  }

  // When a visible tab of the account last reported, or null where none has since this server started.
  lastSeen(account: number): number | null {
    return this.seen.get(account) ?? null;
  }

  // When the room was last shown on a visible tab, or null where it has not been since this server
  // started. A tab still showing it counts as looking now.
  lastLooked(chatId: number, now: number): number | null {
    return this.seeing(chatId, now).size > 0 ? now : (this.looked.get(chatId) ?? null);
  }

  private forgetStale(now: number): void {
    for (const [tab, standing] of this.tabs) {
      if (now - standing.at > this.staleMs) {
        this.tabs.delete(tab);
      }
    }
  }
}

// The one record this server keeps, which the route the tabs report to writes and the ringer reads.
export const roomWatchers = new RoomWatchers();
