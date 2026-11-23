import { ROOM_REACH_REFRESH_MS } from "#shared/config";

import { LoginAccounts, usersForRinging } from "./login-accounts";
import { administratorsRooms, ownRooms } from "./room-reach";

import type { SignedIn } from "./accounts";
import type { LoginAccountsDeps } from "./login-accounts";

// Whose devices a room's message rings (docs/web.md, 「Notifications」): an account's, where its room list holds the
// room — its own rooms and, for the administrator, the deployment's. Each login is read as the account it signs in as
// (`LoginAccounts`), and the rooms its list holds are read again at most every `ROOM_REACH_REFRESH_MS`.

export interface RoomHearersDeps extends LoginAccountsDeps {
  // The rooms a login's list holds.
  listed: (signed: SignedIn) => Promise<ReadonlySet<number>>;
}

/** The rooms a login's list holds, as the console's room list reads them. */
export async function listedRoomsOf(signed: SignedIn): Promise<ReadonlySet<number>> {
  return signed.administrator ? await administratorsRooms(signed) : await ownRooms(signed);
}

export class RoomHearers {
  private readonly accounts: LoginAccounts;
  private readonly rooms = new Map<string, { at: number; read: Promise<ReadonlySet<number>> }>();

  constructor(private readonly deps: RoomHearersDeps) {
    this.accounts = new LoginAccounts(deps);
  }

  /** Whether a room's message rings the devices of a login. */
  async hears(login: string, room: number): Promise<boolean> {
    const now = this.deps.now();
    let held = this.rooms.get(login);

    if (held === undefined || now - held.at >= this.deps.holdMs) {
      held = { at: now, read: this.accounts.of(login, now).then((signed) => this.deps.listed(signed)) };
      this.rooms.set(login, held);
      // A read that failed is not kept, so the next message asks again.
      held.read.catch(() => this.rooms.delete(login));
    }

    return (await held.read).has(room);
  }
}

/** The hearers the console's own ear rings by, reading the users as the administrator. */
export function roomHearers(): RoomHearers {
  return new RoomHearers({
    users: usersForRinging,
    listed: listedRoomsOf,
    now: Date.now,
    holdMs: ROOM_REACH_REFRESH_MS
  });
}
