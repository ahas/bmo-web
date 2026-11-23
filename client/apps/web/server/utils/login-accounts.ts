import { listUsers } from "./account-service";

import type { SignedIn } from "./accounts";

// The account behind each login a device is kept by (docs/web.md, 「Notifications」): a device is kept by the login it
// was subscribed under, so whose devices a notice rings is read login by login as the account service names every
// user, by login, id and whether they are a platform administrator. What the service answered is held for `holdMs`; a
// login a held answer does not name has the service asked again before it is judged, since an account made after
// that answer would otherwise be taken for another. A login the service's fresh answer does not name is a console
// login standing before the account model, which is the administrator's.

export interface LoginAccountsDeps {
  // Every user the account service names, by login, id and whether they are a platform administrator.
  users: () => Promise<readonly { user: string; name: string; administrator: boolean }[]>;
  now: () => number;
  holdMs: number;
}

export class LoginAccounts {
  private users: { at: number; read: Promise<Map<string, SignedIn>> } | null = null;

  constructor(private readonly deps: LoginAccountsDeps) {}

  /** The account a login signs in as. */
  async of(login: string, now: number = this.deps.now()): Promise<SignedIn> {
    const held = this.users !== null && now - this.users.at < this.deps.holdMs;
    const found = (await this.read(now, !held)).get(login);

    if (found !== undefined) return found;

    const fresh = held ? (await this.read(now, true)).get(login) : undefined;

    return fresh ?? { name: login, id: null, administrator: true };
  }

  // The users as the service answered them: the answer held, or a new one where `again` asks for it.
  private async read(now: number, again: boolean): Promise<Map<string, SignedIn>> {
    let asked = this.users;

    if (again || asked === null) {
      const read = this.deps.users().then((users) => new Map(users.map((one) => [one.name, { name: one.name, id: Number(one.user), administrator: one.administrator }])));
      const made = { at: now, read };

      asked = made;
      this.users = made;
      // A read that failed is not kept, so the next notice asks again.
      read.catch(() => {
        if (this.users === made) this.users = null;
      });
    }

    return await asked.read;
  }
}

/** Every user, read as the administrator, as the console's own rings read them for nobody signed in. */
export async function usersForRinging(): Promise<readonly { user: string; name: string; administrator: boolean }[]> {
  return await listUsers({ key: "", role: "administrator" });
}
