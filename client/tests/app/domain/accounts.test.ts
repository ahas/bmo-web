import { describe, expect, test } from "bun:test";

import { wording } from "../../../apps/web/shared/wording";

import { accountCellText, accountChoices, accountKindLabel, accountLoginText, accountMark, nextAccountName } from "../../../apps/web/app/domain/accounts";

import type { ClaudeAccountView } from "../../../apps/web/shared/types";
import { ACCOUNT_ID } from "../../support/ids";
import KO from "../../fixtures/app/domain/accounts.test.ko.json";

// What the screen makes of an account: one mark, one line about its login, and the choices a work
// key is offered. Nothing here has a credential to render, because none reaches the browser.

const now = 1_700_000_000;

function account(over: Partial<ClaudeAccountView> = {}): ClaudeAccountView {
  return {
    id: ACCOUNT_ID,
    name: KO.line_18,
    place: 2,
    enabled: true,
    credentialKind: "directory",
    credentialPath: "/home/user/.claude-sub",
    login: "standing",
    loginEndsAt: now + 30 * 24 * 3600,
    chosen: false,
    restUntil: null,
    ...over
  };
}

describe("the mark a row carries", () => {
  test("says a standing login, one near its end and one that waits for a person", () => {
    expect(accountMark(account()).tone).toBe("text-success");
    expect(accountMark(account({ login: "ending" })).tone).toBe("text-warning");
    expect(accountMark(account({ login: "gone" })).tone).toBe("text-error");
  });

  test("says a login the owner turned off before anything about the login itself", () => {
    expect(accountMark(account({ enabled: false, login: "gone" }))).toMatchObject({ icon: "i-material-symbols-block", tone: "text-muted" });
  });
});

describe("what a row says about a login in words", () => {
  test("a standing login says nothing at all", () => {
    expect(accountLoginText(wording, account(), now)).toBe("");
  });

  test("one near its end says how long is left", () => {
    expect(accountLoginText(wording, account({ login: "ending", loginEndsAt: now + 3 * 3600 }), now)).toBe(KO.line_78);
    expect(accountLoginText(wording, account({ login: "ending", loginEndsAt: now + 20 * 60 }), now)).toBe(KO.line_79);
  });

  test("one that has ended, or whose end has passed, asks for a login", () => {
    expect(accountLoginText(wording, account({ login: "gone" }), now)).toBe(wording("agents.label.login_needed"));
    expect(accountLoginText(wording, account({ login: "ending", loginEndsAt: now - 60 }), now)).toBe(wording("agents.label.login_needed"));
  });

  test("one near its end whose end nothing can read says nothing rather than guessing", () => {
    expect(accountLoginText(wording, account({ login: "ending", loginEndsAt: null }), now)).toBe("");
  });
});

describe("the logins a work key is offered", () => {
  test(KO.line_93, () => {
    const items = accountChoices(wording, [account({ id: "default", name: KO.line_94 }), account()]);

    expect(items.map((one) => [one.value, one.label])).toEqual([
      ["auto", KO.line_97],
      ["default", KO.line_98],
      [ACCOUNT_ID, KO.line_99]
    ]);
    expect(items.every((one) => one.disabled !== true)).toBe(true);
  });

  test("one that is off stands disabled with that as its reason", () => {
    const items = accountChoices(wording, [account({ enabled: false })]);

    expect(items[1]).toMatchObject({ value: ACCOUNT_ID, disabled: true, description: wording("agents.label.account_off") });
  });
});

describe("what a key's cell reads", () => {
  test(KO.line_112, () => {
    expect(accountCellText(wording, [account()], ACCOUNT_ID)).toBe(KO.line_113);
    expect(accountCellText(wording, [account()], null)).toBe(wording("common.label.auto"));
  });

  test("an account no longer registered reads as the id the row still holds", () => {
    expect(accountCellText(wording, [account()], "gone-account")).toBe("gone-account");
  });
});

describe("how a credential is reached", () => {
  test("is said as what it is, never as a credential", () => {
    expect(accountKindLabel(wording, "directory")).toBe(wording("agents.label.account_kind_directory"));
    expect(accountKindLabel(wording, "token")).toBe(wording("agents.label.account_kind_token"));
  });
});

describe("the name a new account's box opens with", () => {
  test("is the next number of the list's own numbering, in two digits", () => {
    expect(nextAccountName([])).toBe("claude-01");
    expect(nextAccountName(["claude-01", "claude-02"])).toBe("claude-03");
    expect(nextAccountName(["claude-09", "claude-02"])).toBe("claude-10");
  });

  test("passes over a name of another shape, and goes one past the highest where a number is missing", () => {
    expect(nextAccountName(["gateway-members", "claude-01", "claude-04"])).toBe("claude-05");
    expect(nextAccountName(["claude-main", "claude-2b", " claude-03 "])).toBe("claude-04");
  });
});
