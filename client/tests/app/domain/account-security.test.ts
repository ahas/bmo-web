import { describe, expect, test } from "bun:test";

import { securityActs } from "../../../apps/web/app/domain/account-security";
import { browserOfAgent, coarseAddress, failedTry, outcomeKey } from "../../../apps/web/shared/account-security";

import type { AccountSecurityView } from "../../../apps/web/shared/account-security";

// Account security on the console's screens (docs/web.md, 「Organisation」, the people tab; 「Settings」, 계정's 보안):
// the head's account acts, the browser and the address a device is shown by, and how a try is worded.

const SECURITY: AccountSecurityView = {
  email: "person@example.com",
  emailVerified: true,
  secondFactor: true,
  recoveryCodesLeft: 10,
  secondFactorRequired: false,
  enabled: true,
  left: false,
  lastSignIn: null,
  mail: true
};

describe("the head's account acts", () => {
  test("the administrator resets, resets the second factor and disables; a head does not disable", () => {
    expect(securityActs({ administrator: true, user: "1" }, "7", SECURITY)).toEqual(["password", "factor", "disable"]);
    expect(securityActs({ administrator: false, user: "9" }, "7", SECURITY)).toEqual(["password", "factor"]);
  });

  test("a disabled account is enabled, and one with no second factor offers no reset of it", () => {
    expect(securityActs({ administrator: true, user: "1" }, "7", { ...SECURITY, enabled: false, secondFactor: false })).toEqual(["password", "enable"]);
  });

  test("nothing is offered on the reader themselves, a person who left, or one whose security was not answered", () => {
    expect(securityActs({ administrator: true, user: "7" }, "7", SECURITY)).toEqual([]);
    expect(securityActs({ administrator: true, user: "1" }, "7", { ...SECURITY, left: true })).toEqual([]);
    expect(securityActs({ administrator: true, user: "1" }, "7", null)).toEqual([]);
  });
});

describe("a device as a row shows it", () => {
  test("a browser and its system are read off the user agent, the version cut to its major", () => {
    const agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
    const read = browserOfAgent(agent);

    expect(read.browser).toBe("Chrome 131");
    expect(read.system).toContain("Windows");
    expect(browserOfAgent("")).toEqual({ browser: "", system: "" });
  });

  test("an address keeps its first half alone", () => {
    expect(coarseAddress("203.0.113.7")).toBe("203.0.*");
    expect(coarseAddress("2001:db8:85a3::7")).toBe("2001:db8:*");
  });

  test("a failed try is told apart, and every outcome has its words", () => {
    expect(failedTry("wrong-password")).toBe(true);
    expect(failedTry("signed-in")).toBe(false);
    expect(outcomeKey("second-factor")).toBe("security.label.outcome_second_factor");
  });
});
