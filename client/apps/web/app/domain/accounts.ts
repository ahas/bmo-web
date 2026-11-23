import { ADMIN_PATH } from "./administration";
import { AUTO_LABEL } from "./agent-settings";
import { untilText } from "./usage";

import type { CellChoice } from "./agent-settings";
import type { ClaudeAccountView } from "#shared/types";
import type { Translate } from "#shared/wording";

// The Claude accounts as the screen reads them. What a row says of a credential is where it is
// reached and how its login stands; nothing here has a credential to show, because nothing the bot
// answers with carries one.

// The name the accounts group answers to in an address: the administration screen's first tab, at that group
// (docs/web.md, 「Administration」).
export const ACCOUNTS_GROUP = "accounts";
export const ACCOUNTS_ADDRESS = `${ADMIN_PATH}#${ACCOUNTS_GROUP}`;

// The way a new account's box offers beside the two kinds: its login made here, through the agency's own run of the
// CLI's sign-in, into a configuration directory the agency makes for it (docs/web.md, 「Administration」).
export const SIGN_IN_KIND = { value: "sign-in", label: "agents.label.account_kind_sign_in" } as const;

export const ACCOUNT_KINDS = [
  { value: "directory", label: "agents.label.account_kind_directory" },
  { value: "token", label: "agents.label.account_kind_token" }
] as const;

// The name a new account's box opens with: accounts are numbered `claude-01`, `claude-02` and on, so the next is
// one past the highest number a name of that shape holds, written in two digits.
export function nextAccountName(names: readonly string[]): string {
  const highest = names.reduce((most, name) => {
    const numbered = /^claude-(\d+)$/.exec(name.trim());

    return numbered === null ? most : Math.max(most, Number(numbered[1]));
  }, 0);

  return `claude-${String(highest + 1).padStart(2, "0")}`;
}

export function accountKindLabel(t: Translate, kind: ClaudeAccountView["credentialKind"]): string {
  const key = ACCOUNT_KINDS.find((one) => one.value === kind)?.label;

  return key === undefined ? kind : t(key);
}

// The mark a row carries: a standing login, one near its end, one that waits for a person or was never
// signed in here — and a login the owner turned off, which answers nothing whatever its own standing.
export function accountMark(account: ClaudeAccountView): { icon: string; tone: string } {
  if (!account.enabled) {
    return { icon: "i-material-symbols-block", tone: "text-muted" };
  }

  if (account.login === "gone" || account.login === "none") {
    return { icon: "i-material-symbols-error-outline", tone: "text-error" };
  }

  if (account.login === "ending") {
    return { icon: "i-material-symbols-schedule-outline", tone: "text-warning" };
  }

  return { icon: "i-material-symbols-check-circle-outline", tone: "text-success" };
}

// What a row says about its login in words: a login never signed in here says so, one that needs a person
// says so, one near its end says how long is left, and one that simply stands says nothing at all.
export function accountLoginText(t: Translate, account: ClaudeAccountView, now: number): string {
  if (account.login === "none") {
    return t("agents.label.login_none");
  }

  if (account.login === "gone") {
    return t("agents.label.login_needed");
  }

  if (account.login !== "ending" || account.loginEndsAt === null) {
    return "";
  }

  const left = account.loginEndsAt - now;

  return left <= 0 ? t("agents.label.login_needed") : t("agents.label.login_expires", { time: untilText(t, left) });
}

// The logins a work key may be put on: the automatic choice, which walks the account order, then
// every account under the name the owner gave it. One they turned off stands disabled with that as its reason.
export function accountChoices(t: Translate, accounts: readonly ClaudeAccountView[]): CellChoice[] {
  return [
    { value: "auto", label: t(AUTO_LABEL) },
    ...accounts.map((one) => ({
      value: one.id,
      label: one.name,
      disabled: !one.enabled,
      ...(one.enabled ? {} : { description: t("agents.label.account_off") })
    }))
  ];
}

// What a key's account cell reads: the account it is pinned to by the name the owner gave it, the
// automatic choice where it walks the order, and nothing at all where the key's runs never reach an account.
export function accountCellText(t: Translate, accounts: readonly ClaudeAccountView[], account: string | null): string {
  if (account === null) {
    return t(AUTO_LABEL);
  }

  return accounts.find((one) => one.id === account)?.name ?? account;
}
