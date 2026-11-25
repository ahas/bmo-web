import { ROOM_REACH_REFRESH_MS } from "#shared/config";

import { companyMembers } from "./account-service";
import { ownerKeyOf, ownerRoleOf } from "./owner-key";

import type { SignedIn } from "./accounts";

// The people of an open stream's reader's company, whose presence the stream hands by account (docs/web.md,
// 「Presence and typing」): read as the stream opens and again every `ROOM_REACH_REFRESH_MS` while it is open. A person
// who joins is heard from then on; one who stands no longer among them ends the stream, so the browser opens it again
// and nothing of theirs stays drawn. A read that fails keeps the people as they stood, and nobody is heard before a
// read has landed.

/** The accounts of one company, asked one at a time as each frame passes. */
export type CompanyAccounts = Pick<ReadonlySet<number>, "has">;

export class CompanyPeople implements CompanyAccounts {
  private people: ReadonlySet<number> = new Set();
  private lost: (() => void) | null = null;

  /** `members` answers the company's accounts now, or null for a reader who stands in no company. */
  constructor(private readonly members: () => Promise<readonly number[] | null>) {}

  has(account: number): boolean {
    return this.people.has(account);
  }

  /** Reads the people again; where one who stood is gone, the stream is lost. */
  async read(): Promise<void> {
    let now: ReadonlySet<number>;

    try {
      now = new Set((await this.members()) ?? []);
    } catch (error) {
      console.warn(`the company's people could not be read: ${String(error)}`);

      return;
    }

    const gone = [...this.people].some((account) => !now.has(account));

    this.people = now;

    if (gone) {
      this.lost?.();
      this.lost = null;
    }
  }

  /** Reads again on the clock until the returned stop is called; `lost` is called once where somebody leaves. */
  follow(lost: () => void, refreshMs: number = ROOM_REACH_REFRESH_MS): () => void {
    const timer = setInterval(() => void this.read(), refreshMs);

    this.lost = lost;

    return () => {
      this.lost = null;
      clearInterval(timer);
    };
  }
}

/** The people of a signed-in login's company, as the account service's members list answers them for it; a login with
 * no user of the account service stands in no company. */
export function companyPeopleOf(signed: SignedIn): CompanyPeople {
  return new CompanyPeople(async () => {
    const key = ownerKeyOf(signed);

    if (key === null) return null;

    const members = await companyMembers(null, { key, role: ownerRoleOf(signed) });

    return members.map((member) => Number(member.user)).filter((account) => Number.isSafeInteger(account));
  });
}
