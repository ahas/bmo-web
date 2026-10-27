import { WATCH_STALE_MS } from "#shared/config";

// Which room each open console tab shows, as the tabs themselves report it (docs/web.md,
// 「Notifications」). A room message is not rung to an account while one of its visible tabs shows
// that room, and the count a room's notification carries starts again once somebody has looked.
// It is held in this server's memory alone: a report is good for a minute or two, and a server
// that restarts hears every open tab again within one interval.

export interface TabReport {
  // The tab's own name for itself, made when it opened.
  tab: string;
  user: string;
  // The room it shows, or null for any screen that is not a room.
  chatId: number | null;
  visible: boolean;
}

interface Standing {
  user: string;
  chatId: number | null;
  visible: boolean;
  at: number;
}

export class RoomWatchers {
  private readonly tabs = new Map<string, Standing>();
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

    this.tabs.set(report.tab, { user: report.user, chatId: report.chatId, visible: report.visible, at: now });

    if (report.visible && report.chatId !== null) {
      this.looked.set(report.chatId, now);
    }
  }

  // The accounts with a visible tab on this room right now.
  lookingAt(chatId: number, now: number): Set<string> {
    const users = new Set<string>();

    for (const standing of this.tabs.values()) {
      if (standing.visible && standing.chatId === chatId && now - standing.at <= this.staleMs) {
        users.add(standing.user);
      }
    }

    return users;
  }

  // The rooms a visible tab shows right now, sorted, for the receiver's start-up serving.
  visibleRooms(now: number): number[] {
    const rooms = new Set<number>();

    for (const standing of this.tabs.values()) {
      if (standing.visible && standing.chatId !== null && now - standing.at <= this.staleMs) {
        rooms.add(standing.chatId);
      }
    }

    return [...rooms].sort((one, other) => one - other);
  }

  // When the room was last shown on a visible tab, or null where it has not been since this server
  // started. A tab still showing it counts as looking now.
  lastLooked(chatId: number, now: number): number | null {
    return this.lookingAt(chatId, now).size > 0 ? now : (this.looked.get(chatId) ?? null);
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
