import { roleAllows } from "bmo-ui/shared/console-manifest";

import { ROOM_REACH_REFRESH_MS } from "#shared/config";

import { AppGate, CHAIN_DEPS } from "./app-gate";
import { LoginAccounts, usersForRinging } from "./login-accounts";
import { ownerKeyOf, ownerRoleOf } from "./owner-key";

import type { SignedIn } from "./accounts";
import type { AppGateDeps } from "./app-gate";
import type { LoginAccountsDeps } from "./login-accounts";
import type { ConsoleManifest, NoticeReaders } from "bmo-ui/shared/console-manifest";

// Whose devices a bundle's notice rings (docs/web.md, 「Notifications」; bmo-ui's `docs/console-bundles.md`, 「Who a
// notice rings」): the readers bmo-ui's `noticeReaders` names for its kind. Readers holding a role are every account
// whose role allows it, so `administrator` is the platform administrators alone and `member` every account; one account
// is the account whose owner key the member's field holds, and none where it holds no key; and the readers the
// manifest's role allows are every account whose role allows that one.

/** Whether a notice for these readers rings the devices of an account. */
export function noticeHeard(account: SignedIn, readers: NoticeReaders): boolean {
  if ("account" in readers) return readers.account !== null && ownerKeyOf(account) === readers.account;

  return roleAllows(ownerRoleOf(account), "role" in readers ? readers.role : readers.allowed);
}

export class NoticeHearers {
  private readonly accounts: LoginAccounts;

  constructor(
    deps: LoginAccountsDeps,
    private readonly chain: AppGateDeps = CHAIN_DEPS
  ) {
    this.accounts = new LoginAccounts(deps);
  }

  /** Whether a bundle's screen stands open for the account a login signs in as, its app on for them, so its notice
   * may ring their devices (docs/web.md, 「Screens a unit brings」). */
  async opens(login: string, manifest: ConsoleManifest): Promise<boolean> {
    return await new AppGate(ownerKeyOf(await this.accounts.of(login)), this.chain).opens(manifest);
  }

  /** Whether a notice for these readers rings the devices of a login. */
  async hears(login: string, readers: NoticeReaders): Promise<boolean> {
    if ("account" in readers && readers.account === null) return false;
    // Every account holds the member's role, so a notice for members rings every login with no account read: the
    // account service being away never silences it.
    if (!("account" in readers) && ("role" in readers ? readers.role : readers.allowed) === "member") return true;

    return noticeHeard(await this.accounts.of(login), readers);
  }
}

/** The hearers the bundles' notices ring by, reading the users as the administrator. */
export function noticeHearers(): NoticeHearers {
  return new NoticeHearers({ users: usersForRinging, now: Date.now, holdMs: ROOM_REACH_REFRESH_MS });
}
