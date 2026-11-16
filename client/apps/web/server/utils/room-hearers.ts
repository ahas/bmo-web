import { ROOM_REACH_REFRESH_MS } from "#shared/config";

import { listUsers } from "./account-service";
import { administratorsRooms, ownRooms } from "./room-reach";

import type { SignedIn } from "./accounts";

// Whose devices a room's message rings (docs/web.md, 「Notifications」): an account's, where its room list holds the
// room — its own rooms and, for the administrator, the deployment's. A device is kept by the login it was subscribed
// under, so each login is read as the account service names it, and the rooms its list holds are read again at most
// every `ROOM_REACH_REFRESH_MS`. A login the service does not name is a console login standing before the account
// model, which is the administrator's.

export interface RoomHearersDeps {
  // Every user the account service names, by login, id and whether they are a platform administrator.
  users: () => Promise<readonly { user: string; name: string; administrator: boolean }[]>;
  // The rooms a login's list holds.
  listed: (signed: SignedIn) => Promise<ReadonlySet<number>>;
  now: () => number;
  holdMs: number;
}

/** The rooms a login's list holds, as the console's room list reads them. */
export async function listedRoomsOf(signed: SignedIn): Promise<ReadonlySet<number>> {
  return signed.administrator ? await administratorsRooms(signed) : await ownRooms(signed);
}

export class RoomHearers {
  private users: { at: number; read: Promise<Map<string, SignedIn>> } | null = null;
  private readonly rooms = new Map<string, { at: number; read: Promise<ReadonlySet<number>> }>();

  constructor(private readonly deps: RoomHearersDeps) {}

  /** Whether a room's message rings the devices of a login. */
  async hears(login: string, room: number): Promise<boolean> {
    const now = this.deps.now();
    let held = this.rooms.get(login);

    if (held === undefined || now - held.at >= this.deps.holdMs) {
      held = { at: now, read: this.signedIn(login, now).then((signed) => this.deps.listed(signed)) };
      this.rooms.set(login, held);
      // A read that failed is not kept, so the next message asks again.
      held.read.catch(() => this.rooms.delete(login));
    }

    return (await held.read).has(room);
  }

  private async signedIn(login: string, now: number): Promise<SignedIn> {
    if (this.users === null || now - this.users.at >= this.deps.holdMs) {
      const read = this.deps.users().then((users) => new Map(users.map((one) => [one.name, { name: one.name, id: Number(one.user), administrator: one.administrator }])));

      this.users = { at: now, read };
      read.catch(() => (this.users = null));
    }

    return (await this.users.read).get(login) ?? { name: login, id: null, administrator: true };
  }
}

/** The hearers the console's own ear rings by, reading the users as the administrator. */
export function roomHearers(): RoomHearers {
  return new RoomHearers({
    users: async () => await listUsers({ key: "", role: "administrator" }),
    listed: listedRoomsOf,
    now: Date.now,
    holdMs: ROOM_REACH_REFRESH_MS
  });
}
